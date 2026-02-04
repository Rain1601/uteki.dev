"""决策日志与反事实追踪服务"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.domains.index.models.decision_log import DecisionLog
from uteki.domains.index.models.decision_harness import DecisionHarness
from uteki.domains.index.models.model_io import ModelIO
from uteki.domains.index.models.counterfactual import Counterfactual
from uteki.domains.index.models.index_price import IndexPrice

logger = logging.getLogger(__name__)


class DecisionService:
    """决策日志管理 — append-only, 反事实追踪"""

    async def create_log(
        self,
        harness_id: str,
        user_action: str,
        session: AsyncSession,
        adopted_model_io_id: Optional[str] = None,
        original_allocations: Optional[list] = None,
        executed_allocations: Optional[list] = None,
        execution_results: Optional[list] = None,
        user_notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """创建不可变的决策日志记录"""
        log = DecisionLog(
            harness_id=harness_id,
            adopted_model_io_id=adopted_model_io_id,
            user_action=user_action,
            original_allocations=original_allocations,
            executed_allocations=executed_allocations,
            execution_results=execution_results,
            user_notes=user_notes,
        )
        session.add(log)
        await session.commit()
        await session.refresh(log)
        logger.info(f"Decision log created: {log.id} action={user_action}")
        return log.to_dict()

    async def get_timeline(
        self,
        session: AsyncSession,
        limit: int = 50,
        offset: int = 0,
        user_action: Optional[str] = None,
        harness_type: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """获取决策时间线（逆时间序）"""
        query = (
            select(DecisionLog, DecisionHarness)
            .join(DecisionHarness, DecisionLog.harness_id == DecisionHarness.id)
        )

        if user_action:
            query = query.where(DecisionLog.user_action == user_action)
        if harness_type:
            query = query.where(DecisionHarness.harness_type == harness_type)
        if start_date:
            query = query.where(DecisionLog.created_at >= start_date)
        if end_date:
            query = query.where(DecisionLog.created_at <= end_date)

        query = query.order_by(DecisionLog.created_at.desc()).offset(offset).limit(limit)
        result = await session.execute(query)
        rows = result.all()

        timeline = []
        for log, harness in rows:
            # 获取该 harness 的模型数量
            model_count_q = select(func.count()).select_from(ModelIO).where(ModelIO.harness_id == harness.id)
            model_count_r = await session.execute(model_count_q)
            model_count = model_count_r.scalar_one()

            # 获取采纳的模型信息
            adopted_model = None
            if log.adopted_model_io_id:
                model_q = select(ModelIO).where(ModelIO.id == log.adopted_model_io_id)
                model_r = await session.execute(model_q)
                adopted = model_r.scalar_one_or_none()
                if adopted:
                    adopted_model = {"provider": adopted.model_provider, "name": adopted.model_name}

            timeline.append({
                **log.to_dict(),
                "harness_type": harness.harness_type,
                "prompt_version_id": harness.prompt_version_id,
                "model_count": model_count,
                "adopted_model": adopted_model,
            })

        return timeline

    async def get_by_id(self, decision_id: str, session: AsyncSession) -> Optional[Dict[str, Any]]:
        """获取决策详情，含 Harness 和所有模型 I/O"""
        query = (
            select(DecisionLog, DecisionHarness)
            .join(DecisionHarness, DecisionLog.harness_id == DecisionHarness.id)
            .where(DecisionLog.id == decision_id)
        )
        result = await session.execute(query)
        row = result.one_or_none()
        if not row:
            return None

        log, harness = row

        # 获取所有模型 I/O
        io_query = select(ModelIO).where(ModelIO.harness_id == harness.id)
        io_result = await session.execute(io_query)
        model_ios = [m.to_dict() for m in io_result.scalars().all()]

        # 获取反事实数据
        cf_query = select(Counterfactual).where(Counterfactual.decision_log_id == decision_id)
        cf_result = await session.execute(cf_query)
        counterfactuals = [c.to_dict() for c in cf_result.scalars().all()]

        return {
            **log.to_dict(),
            "harness": harness.to_dict(),
            "model_ios": model_ios,
            "counterfactuals": counterfactuals,
        }

    # ── Immutability enforcement ──

    async def update_log(self, *args, **kwargs):
        """拒绝更新操作"""
        raise ValueError("Decision log records are immutable — updates not permitted")

    async def delete_log(self, *args, **kwargs):
        """拒绝删除操作"""
        raise ValueError("Decision log records are immutable — deletes not permitted")

    # ── Counterfactual tracking ──

    async def calculate_counterfactual(
        self,
        decision_log_id: str,
        tracking_days: int,
        session: AsyncSession,
    ) -> List[Dict[str, Any]]:
        """计算一个决策的所有模型的反事实收益"""
        # 获取决策和 Harness
        log_query = select(DecisionLog).where(DecisionLog.id == decision_log_id)
        log_result = await session.execute(log_query)
        log = log_result.scalar_one_or_none()
        if not log:
            return []

        harness_query = select(DecisionHarness).where(DecisionHarness.id == log.harness_id)
        harness_result = await session.execute(harness_query)
        harness = harness_result.scalar_one_or_none()
        if not harness:
            return []

        # 计算目标日期
        decision_date = log.created_at.date() if hasattr(log.created_at, 'date') else log.created_at
        target_date = decision_date + timedelta(days=tracking_days)

        # 获取所有模型 I/O
        io_query = select(ModelIO).where(
            ModelIO.harness_id == log.harness_id,
            ModelIO.status == "success",
        )
        io_result = await session.execute(io_query)
        model_ios = io_result.scalars().all()

        results = []
        for mio in model_ios:
            allocations = (mio.output_structured or {}).get("allocations", [])
            if not allocations:
                continue

            # 从 Harness 获取入场价格
            market_snapshot = harness.market_snapshot or {}
            actual_prices = {}
            total_return = 0.0
            total_weight = 0.0

            for alloc in allocations:
                etf = alloc.get("etf", "")
                pct = alloc.get("percentage", 0)
                if not etf or pct <= 0:
                    continue

                # 入场价格
                entry_price = market_snapshot.get(etf, {}).get("price")
                if not entry_price:
                    continue

                # N 天后价格
                future_query = (
                    select(IndexPrice)
                    .where(
                        IndexPrice.symbol == etf,
                        IndexPrice.date <= target_date,
                    )
                    .order_by(IndexPrice.date.desc())
                    .limit(1)
                )
                future_result = await session.execute(future_query)
                future_price_row = future_result.scalar_one_or_none()
                future_price = future_price_row.close if future_price_row else entry_price

                ret = (future_price - entry_price) / entry_price * 100
                actual_prices[etf] = {
                    "entry_price": entry_price,
                    "future_price": future_price,
                    "return_pct": round(ret, 2),
                }
                total_return += ret * (pct / 100)
                total_weight += pct / 100

            hypothetical_return = total_return / total_weight if total_weight > 0 else 0.0
            was_adopted = log.adopted_model_io_id == mio.id

            cf = Counterfactual(
                decision_log_id=decision_log_id,
                model_io_id=mio.id,
                was_adopted=was_adopted,
                tracking_days=tracking_days,
                hypothetical_return_pct=round(hypothetical_return, 2),
                actual_prices=actual_prices,
                calculated_at=datetime.now(timezone.utc),
            )
            session.add(cf)
            results.append(cf.to_dict())

        await session.commit()
        return results

    async def run_counterfactual_batch(
        self,
        session: AsyncSession,
        tracking_days: int = 7,
    ) -> Dict[str, Any]:
        """批量计算反事实 — 找出所有 tracking_days 天前的决策，计算尚未存在的反事实"""
        cutoff = datetime.now(timezone.utc) - timedelta(days=tracking_days)
        # 找出已到期的决策
        log_query = (
            select(DecisionLog)
            .where(DecisionLog.created_at <= cutoff)
            .order_by(DecisionLog.created_at.desc())
            .limit(100)
        )
        log_result = await session.execute(log_query)
        logs = log_result.scalars().all()

        processed = 0
        skipped = 0
        for log in logs:
            # 检查是否已有该 tracking_days 的反事实
            existing_q = select(func.count()).select_from(Counterfactual).where(
                and_(
                    Counterfactual.decision_log_id == log.id,
                    Counterfactual.tracking_days == tracking_days,
                )
            )
            existing_r = await session.execute(existing_q)
            if existing_r.scalar_one() > 0:
                skipped += 1
                continue

            await self.calculate_counterfactual(log.id, tracking_days, session)
            processed += 1

        return {
            "tracking_days": tracking_days,
            "decisions_checked": len(logs),
            "calculated": processed,
            "skipped": skipped,
        }

    async def classify_counterfactuals(
        self,
        decision_log_id: str,
        session: AsyncSession,
    ) -> List[Dict[str, Any]]:
        """对反事实进行分类: missed_opportunity / dodged_bullet / correct_call / wrong_call"""
        cfs = await self.get_counterfactuals(decision_log_id, session)

        classified = []
        for cf in cfs:
            label = None
            if cf["was_adopted"]:
                label = "correct_call" if cf["hypothetical_return_pct"] >= 0 else "wrong_call"
            else:
                label = "missed_opportunity" if cf["hypothetical_return_pct"] > 0 else "dodged_bullet"
            classified.append({**cf, "classification": label})

        return classified

    async def get_counterfactuals(
        self, decision_log_id: str, session: AsyncSession
    ) -> List[Dict[str, Any]]:
        query = (
            select(Counterfactual)
            .where(Counterfactual.decision_log_id == decision_log_id)
            .order_by(Counterfactual.tracking_days.asc())
        )
        result = await session.execute(query)
        return [c.to_dict() for c in result.scalars().all()]


_decision_service: Optional[DecisionService] = None


def get_decision_service() -> DecisionService:
    global _decision_service
    if _decision_service is None:
        _decision_service = DecisionService()
    return _decision_service
