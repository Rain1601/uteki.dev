"""Evaluation 聚合分析服务 — 模型质量深度洞察"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func, and_, case, cast, Float, Date
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.domains.index.models.decision_harness import DecisionHarness
from uteki.domains.index.models.model_io import ModelIO
from uteki.domains.index.models.arena_vote import ArenaVote
from uteki.domains.index.models.decision_log import DecisionLog
from uteki.domains.index.models.counterfactual import Counterfactual
from uteki.domains.index.models.model_score import ModelScore

logger = logging.getLogger(__name__)


class EvaluationService:
    """聚合查询 — Overview / Voting / Trend / Cost / Counterfactual"""

    async def get_overview(self, session: AsyncSession) -> Dict[str, Any]:
        """聚合 KPI：总运行次数、决策分布、最佳模型、平均胜率"""
        # Harness 统计
        harness_q = select(
            func.count(DecisionHarness.id).label("total"),
            DecisionHarness.harness_type,
        ).group_by(DecisionHarness.harness_type)
        harness_res = await session.execute(harness_q)
        harness_rows = harness_res.all()
        total_arena_runs = sum(r.total for r in harness_rows)
        harness_breakdown = {r.harness_type: r.total for r in harness_rows}

        # Decision 统计
        decision_q = select(
            func.count(DecisionLog.id).label("total"),
            DecisionLog.user_action,
        ).group_by(DecisionLog.user_action)
        decision_res = await session.execute(decision_q)
        decision_rows = decision_res.all()
        total_decisions = sum(r.total for r in decision_rows)
        decision_breakdown = {r.user_action: r.total for r in decision_rows}

        # Best model & avg win rate from ModelScore
        best_model = None
        avg_win_rate = 0.0
        score_q = select(ModelScore)
        score_res = await session.execute(score_q)
        scores = score_res.scalars().all()
        if scores:
            best = max(scores, key=lambda s: (s.approve_vote_count - s.rejection_count))
            best_model = f"{best.model_provider}:{best.model_name}"
            win_rates = []
            for s in scores:
                total = s.win_count + s.loss_count
                win_rates.append(s.win_count / total * 100 if total > 0 else 0)
            avg_win_rate = round(sum(win_rates) / len(win_rates), 1) if win_rates else 0

        # ModelIO 延迟 & 成本
        io_q = select(
            func.avg(ModelIO.latency_ms).label("avg_latency"),
            func.avg(ModelIO.cost_usd).label("avg_cost"),
            func.sum(ModelIO.cost_usd).label("total_cost"),
        )
        io_res = await session.execute(io_q)
        io_row = io_res.one()

        return {
            "total_arena_runs": total_arena_runs,
            "harness_breakdown": harness_breakdown,
            "total_decisions": total_decisions,
            "decision_breakdown": decision_breakdown,
            "best_model": best_model,
            "avg_win_rate": avg_win_rate,
            "avg_latency_ms": round(io_row.avg_latency or 0, 0),
            "avg_cost_usd": round(io_row.avg_cost or 0, 4),
            "total_cost_usd": round(io_row.total_cost or 0, 2),
        }

    async def get_voting_matrix(
        self, session: AsyncSession, limit: int = 20,
    ) -> Dict[str, Any]:
        """投票热力图：最近 N 次 arena 的 voter→target approve/reject 矩阵"""
        # 最近 N 个 harness
        recent_q = (
            select(DecisionHarness.id)
            .order_by(DecisionHarness.created_at.desc())
            .limit(limit)
        )
        recent_res = await session.execute(recent_q)
        harness_ids = [r[0] for r in recent_res.all()]
        if not harness_ids:
            return {"models": [], "matrix": []}

        voter_io = select(ModelIO).subquery("voter_io")
        target_io = select(ModelIO).subquery("target_io")

        q = (
            select(
                voter_io.c.model_provider.label("voter_provider"),
                voter_io.c.model_name.label("voter_name"),
                target_io.c.model_provider.label("target_provider"),
                target_io.c.model_name.label("target_name"),
                ArenaVote.vote_type,
                func.count().label("cnt"),
            )
            .join(voter_io, ArenaVote.voter_model_io_id == voter_io.c.id)
            .join(target_io, ArenaVote.target_model_io_id == target_io.c.id)
            .where(ArenaVote.harness_id.in_(harness_ids))
            .group_by(
                voter_io.c.model_provider,
                voter_io.c.model_name,
                target_io.c.model_provider,
                target_io.c.model_name,
                ArenaVote.vote_type,
            )
        )
        res = await session.execute(q)
        rows = res.all()

        models_set: set = set()
        raw: Dict = {}
        for r in rows:
            voter = f"{r.voter_provider}:{r.voter_name}"
            target = f"{r.target_provider}:{r.target_name}"
            models_set.add(voter)
            models_set.add(target)
            key = (voter, target)
            if key not in raw:
                raw[key] = {"voter": voter, "target": target, "approve": 0, "reject": 0}
            raw[key][r.vote_type] = r.cnt

        return {"models": sorted(models_set), "matrix": list(raw.values())}

    async def get_performance_trend(
        self, session: AsyncSession, days: int = 30,
    ) -> Dict[str, Any]:
        """按日期×模型聚合延迟/成本/成功率趋势"""
        since = datetime.utcnow() - timedelta(days=days)

        date_expr = func.date(DecisionHarness.created_at)
        q = (
            select(
                date_expr.label("date"),
                ModelIO.model_provider,
                ModelIO.model_name,
                func.avg(ModelIO.latency_ms).label("avg_latency"),
                func.avg(ModelIO.cost_usd).label("avg_cost"),
                func.count().label("runs"),
                func.sum(case((ModelIO.status == "success", 1), else_=0)).label("success_count"),
            )
            .join(DecisionHarness, ModelIO.harness_id == DecisionHarness.id)
            .where(DecisionHarness.created_at >= since)
            .group_by(
                date_expr,
                ModelIO.model_provider,
                ModelIO.model_name,
            )
            .order_by(date_expr)
        )
        res = await session.execute(q)
        rows = res.all()

        dates_set: set = set()
        model_data: Dict[str, List] = {}
        for r in rows:
            d = str(r.date)[:10]  # ensure YYYY-MM-DD
            dates_set.add(d)
            name = f"{r.model_provider}:{r.model_name}"
            if name not in model_data:
                model_data[name] = []
            model_data[name].append({
                "date": d,
                "latency": round(float(r.avg_latency or 0), 0),
                "cost": round(float(r.avg_cost or 0), 4),
                "success_rate": round(float(r.success_count) / r.runs * 100, 1) if r.runs else 0,
                "runs": r.runs,
            })

        return {
            "dates": sorted(dates_set),
            "models": [{"name": k, "data": v} for k, v in model_data.items()],
        }

    async def get_cost_analysis(self, session: AsyncSession) -> Dict[str, Any]:
        """每模型运营指标：延迟 / 成本 / token / error rate"""
        # 基础聚合（兼容 SQLite + PostgreSQL）
        q = (
            select(
                ModelIO.model_provider,
                ModelIO.model_name,
                func.avg(ModelIO.latency_ms).label("avg_latency"),
                func.max(ModelIO.latency_ms).label("max_latency"),
                func.avg(ModelIO.cost_usd).label("avg_cost"),
                func.sum(ModelIO.cost_usd).label("total_cost"),
                func.avg(ModelIO.input_token_count).label("avg_input_tokens"),
                func.avg(ModelIO.output_token_count).label("avg_output_tokens"),
                func.count().label("total_runs"),
                func.sum(case((ModelIO.status != "success", 1), else_=0)).label("error_count"),
            )
            .group_by(ModelIO.model_provider, ModelIO.model_name)
        )
        res = await session.execute(q)
        rows = res.all()

        models = []
        for r in rows:
            # p95 近似：使用 avg + (max - avg) * 0.5 作为简易近似
            avg_lat = r.avg_latency or 0
            max_lat = r.max_latency or 0
            p95_approx = avg_lat + (max_lat - avg_lat) * 0.5
            models.append({
                "name": f"{r.model_provider}:{r.model_name}",
                "avg_latency": round(avg_lat, 0),
                "p95_latency": round(p95_approx, 0),
                "avg_cost": round(r.avg_cost or 0, 4),
                "total_cost": round(r.total_cost or 0, 2),
                "avg_input_tokens": round(r.avg_input_tokens or 0, 0),
                "avg_output_tokens": round(r.avg_output_tokens or 0, 0),
                "total_runs": r.total_runs,
                "error_rate": round(r.error_count / r.total_runs * 100, 1) if r.total_runs else 0,
            })

        return {"models": models}

    async def get_counterfactual_summary(self, session: AsyncSession) -> Dict[str, Any]:
        """反事实对比：adopted vs missed 平均收益"""
        q = (
            select(
                ModelIO.model_provider,
                ModelIO.model_name,
                Counterfactual.was_adopted,
                func.avg(Counterfactual.hypothetical_return_pct).label("avg_return"),
                func.count().label("cnt"),
            )
            .join(ModelIO, Counterfactual.model_io_id == ModelIO.id)
            .group_by(
                ModelIO.model_provider,
                ModelIO.model_name,
                Counterfactual.was_adopted,
            )
        )
        res = await session.execute(q)
        rows = res.all()

        model_map: Dict[str, Dict] = {}
        for r in rows:
            name = f"{r.model_provider}:{r.model_name}"
            if name not in model_map:
                model_map[name] = {
                    "name": name,
                    "adopted_avg_return": 0, "adopted_count": 0,
                    "missed_avg_return": 0, "missed_count": 0,
                    "opportunity_cost": 0,
                }
            entry = model_map[name]
            if r.was_adopted:
                entry["adopted_avg_return"] = round(r.avg_return or 0, 2)
                entry["adopted_count"] = r.cnt
            else:
                entry["missed_avg_return"] = round(r.avg_return or 0, 2)
                entry["missed_count"] = r.cnt

        # opportunity_cost = missed_avg_return − adopted_avg_return
        for m in model_map.values():
            m["opportunity_cost"] = round(
                m["missed_avg_return"] - m["adopted_avg_return"], 2
            )

        return {"models": list(model_map.values())}


_evaluation_service: Optional[EvaluationService] = None


def get_evaluation_service() -> EvaluationService:
    global _evaluation_service
    if _evaluation_service is None:
        _evaluation_service = EvaluationService()
    return _evaluation_service
