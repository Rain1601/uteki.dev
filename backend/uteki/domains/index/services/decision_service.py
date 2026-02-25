"""决策日志与反事实追踪服务 — Supabase REST API 版"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from uuid import uuid4

from uteki.common.database import SupabaseRepository, db_manager
from uteki.domains.index.models.decision_log import DecisionLog
from uteki.domains.index.models.decision_harness import DecisionHarness
from uteki.domains.index.models.model_io import ModelIO
from uteki.domains.index.models.counterfactual import Counterfactual
from uteki.domains.index.models.index_price import IndexPrice

logger = logging.getLogger(__name__)

LOG_TABLE = "decision_log"
HARNESS_TABLE = "decision_harness"
MODEL_IO_TABLE = "model_io"
CF_TABLE = "counterfactual"
PRICE_TABLE = "index_prices"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_id(data: dict) -> dict:
    """Ensure dict has id + timestamps for a new row."""
    if "id" not in data:
        data["id"] = str(uuid4())
    data.setdefault("created_at", _now_iso())
    data.setdefault("updated_at", _now_iso())
    return data


async def _backup_rows(table: str, model_class, rows: list):
    """Best-effort SQLite backup (failure only warns)."""
    try:
        async with db_manager.get_postgres_session() as session:
            for row in rows:
                safe = {k: v for k, v in row.items() if hasattr(model_class, k)}
                await session.merge(model_class(**safe))
    except Exception as e:
        logger.warning(f"SQLite backup failed for {table}: {e}")


class DecisionService:
    """决策日志管理 — append-only, 反事实追踪"""

    async def create_log(
        self,
        harness_id: str,
        user_action: str,
        adopted_model_io_id: Optional[str] = None,
        original_allocations: Optional[list] = None,
        executed_allocations: Optional[list] = None,
        execution_results: Optional[list] = None,
        user_notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """创建不可变的决策日志记录"""
        data = {
            "harness_id": harness_id,
            "adopted_model_io_id": adopted_model_io_id,
            "user_action": user_action,
            "original_allocations": original_allocations,
            "executed_allocations": executed_allocations,
            "execution_results": execution_results,
            "user_notes": user_notes,
        }
        _ensure_id(data)

        repo = SupabaseRepository(LOG_TABLE)
        result = repo.upsert(data)
        row = result.data[0] if result.data else data

        await _backup_rows(LOG_TABLE, DecisionLog, [row])
        logger.info(f"Decision log created: {row.get('id')} action={user_action}")
        return row

    async def get_timeline(
        self,
        limit: int = 50,
        offset: int = 0,
        user_action: Optional[str] = None,
        harness_type: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """获取决策时间线（逆时间序）"""
        # 1. Fetch decision logs with filters
        eq_filters: Dict[str, Any] = {}
        if user_action:
            eq_filters["user_action"] = user_action

        gte_filters: Optional[Dict[str, Any]] = None
        if start_date:
            gte_filters = {"created_at": start_date}

        lte_filters: Optional[Dict[str, Any]] = None
        if end_date:
            lte_filters = {"created_at": end_date}

        log_repo = SupabaseRepository(LOG_TABLE)
        logs = log_repo.select_data(
            eq=eq_filters or None,
            gte=gte_filters,
            lte=lte_filters,
            order="created_at.desc",
            limit=limit,
            offset=offset,
        )

        if not logs:
            return []

        # 2. Batch-fetch harness data
        harness_ids = list({log["harness_id"] for log in logs if log.get("harness_id")})
        harness_repo = SupabaseRepository(HARNESS_TABLE)
        harnesses_list = harness_repo.select_data(in_={"id": harness_ids}) if harness_ids else []
        harness_map = {h["id"]: h for h in harnesses_list}

        # 3. Filter by harness_type if specified (post-filter since it's on a different table)
        if harness_type:
            valid_harness_ids = {
                hid for hid, h in harness_map.items()
                if h.get("harness_type") == harness_type
            }
            logs = [log for log in logs if log.get("harness_id") in valid_harness_ids]

        # 4. Build timeline
        timeline = []
        model_io_repo = SupabaseRepository(MODEL_IO_TABLE)

        for log in logs:
            hid = log.get("harness_id")
            harness = harness_map.get(hid, {})

            # Model count for this harness
            count_result = model_io_repo.select("*", count="exact", eq={"harness_id": hid}, limit=0)
            model_count = count_result.count if count_result.count is not None else 0

            # Adopted model info
            adopted_model = None
            if log.get("adopted_model_io_id"):
                adopted_row = model_io_repo.select_one(eq={"id": log["adopted_model_io_id"]})
                if adopted_row:
                    adopted_model = {
                        "provider": adopted_row.get("model_provider"),
                        "name": adopted_row.get("model_name"),
                    }

            timeline.append({
                **log,
                "harness_type": harness.get("harness_type"),
                "prompt_version_id": harness.get("prompt_version_id"),
                "model_count": model_count,
                "adopted_model": adopted_model,
            })

        return timeline

    async def get_by_id(self, decision_id: str) -> Optional[Dict[str, Any]]:
        """获取决策详情，含 Harness 和所有模型 I/O"""
        # 1. Get log
        log_repo = SupabaseRepository(LOG_TABLE)
        log = log_repo.select_one(eq={"id": decision_id})
        if not log:
            return None

        # 2. Get harness
        harness_repo = SupabaseRepository(HARNESS_TABLE)
        harness = harness_repo.select_one(eq={"id": log["harness_id"]})
        if not harness:
            return None

        # 3. Get model I/Os
        model_io_repo = SupabaseRepository(MODEL_IO_TABLE)
        model_ios = model_io_repo.select_data(eq={"harness_id": log["harness_id"]})

        # 4. Get counterfactuals
        cf_repo = SupabaseRepository(CF_TABLE)
        counterfactuals = cf_repo.select_data(eq={"decision_log_id": decision_id})

        return {
            **log,
            "harness": harness,
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
    ) -> List[Dict[str, Any]]:
        """计算一个决策的所有模型的反事实收益"""
        # 1. Get decision log
        log_repo = SupabaseRepository(LOG_TABLE)
        log = log_repo.select_one(eq={"id": decision_log_id})
        if not log:
            return []

        # 2. Get harness
        harness_repo = SupabaseRepository(HARNESS_TABLE)
        harness = harness_repo.select_one(eq={"id": log["harness_id"]})
        if not harness:
            return []

        # 3. Calculate target date
        created_at = log.get("created_at", "")
        if isinstance(created_at, str):
            # Parse ISO datetime string to get date
            decision_date = datetime.fromisoformat(created_at.replace("Z", "+00:00")).date()
        else:
            decision_date = created_at.date() if hasattr(created_at, "date") else created_at
        target_date = decision_date + timedelta(days=tracking_days)
        target_date_str = target_date.isoformat()

        # 4. Get all successful model I/Os
        model_io_repo = SupabaseRepository(MODEL_IO_TABLE)
        model_ios = model_io_repo.select_data(
            eq={"harness_id": log["harness_id"], "status": "success"}
        )

        price_repo = SupabaseRepository(PRICE_TABLE)
        results = []
        cf_rows = []

        for mio in model_ios:
            output_structured = mio.get("output_structured") or {}
            allocations = output_structured.get("allocations", [])
            if not allocations:
                continue

            # Entry prices from harness market_snapshot
            market_snapshot = harness.get("market_snapshot") or {}
            actual_prices = {}
            total_return = 0.0
            total_weight = 0.0

            for alloc in allocations:
                etf = alloc.get("etf", "")
                pct = alloc.get("percentage", 0)
                if not etf or pct <= 0:
                    continue

                entry_price = (market_snapshot.get(etf) or {}).get("price")
                if not entry_price:
                    continue

                # N-day future price
                future_rows = price_repo.select_data(
                    eq={"symbol": etf},
                    lte={"date": target_date_str},
                    order="date.desc",
                    limit=1,
                )
                future_price = future_rows[0]["close"] if future_rows else entry_price

                ret = (future_price - entry_price) / entry_price * 100
                actual_prices[etf] = {
                    "entry_price": entry_price,
                    "future_price": future_price,
                    "return_pct": round(ret, 2),
                }
                total_return += ret * (pct / 100)
                total_weight += pct / 100

            hypothetical_return = total_return / total_weight if total_weight > 0 else 0.0
            was_adopted = log.get("adopted_model_io_id") == mio.get("id")

            cf_data = {
                "decision_log_id": decision_log_id,
                "model_io_id": mio.get("id"),
                "was_adopted": was_adopted,
                "tracking_days": tracking_days,
                "hypothetical_return_pct": round(hypothetical_return, 2),
                "actual_prices": actual_prices,
                "calculated_at": _now_iso(),
            }
            _ensure_id(cf_data)
            cf_rows.append(cf_data)
            results.append(cf_data)

        # Batch upsert counterfactuals
        if cf_rows:
            cf_repo = SupabaseRepository(CF_TABLE)
            cf_repo.upsert(cf_rows)
            await _backup_rows(CF_TABLE, Counterfactual, cf_rows)

        return results

    async def run_counterfactual_batch(
        self,
        tracking_days: int = 7,
    ) -> Dict[str, Any]:
        """批量计算反事实 — 找出所有 tracking_days 天前的决策，计算尚未存在的反事实"""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=tracking_days)).isoformat()

        # Get logs older than cutoff
        log_repo = SupabaseRepository(LOG_TABLE)
        logs = log_repo.select_data(
            lte={"created_at": cutoff},
            order="created_at.desc",
            limit=100,
        )

        processed = 0
        skipped = 0
        cf_repo = SupabaseRepository(CF_TABLE)

        for log in logs:
            log_id = log.get("id")
            # Check if counterfactual already exists for this tracking_days
            existing = cf_repo.select(
                "*", count="exact",
                eq={"decision_log_id": log_id, "tracking_days": tracking_days},
                limit=0,
            )
            if existing.count and existing.count > 0:
                skipped += 1
                continue

            await self.calculate_counterfactual(log_id, tracking_days)
            processed += 1

        return {
            "tracking_days": tracking_days,
            "decisions_checked": len(logs),
            "calculated": processed,
            "skipped": skipped,
        }

    async def get_counterfactuals(
        self, decision_log_id: str
    ) -> List[Dict[str, Any]]:
        """获取某决策的所有反事实数据"""
        cf_repo = SupabaseRepository(CF_TABLE)
        return cf_repo.select_data(
            eq={"decision_log_id": decision_log_id},
            order="tracking_days.asc",
        )

    async def classify_counterfactuals(
        self,
        decision_log_id: str,
    ) -> List[Dict[str, Any]]:
        """对反事实进行分类: missed_opportunity / dodged_bullet / correct_call / wrong_call"""
        cfs = await self.get_counterfactuals(decision_log_id)

        classified = []
        for cf in cfs:
            if cf.get("was_adopted"):
                label = "correct_call" if cf.get("hypothetical_return_pct", 0) >= 0 else "wrong_call"
            else:
                label = "missed_opportunity" if cf.get("hypothetical_return_pct", 0) > 0 else "dodged_bullet"
            classified.append({**cf, "classification": label})

        return classified


_decision_service: Optional[DecisionService] = None


def get_decision_service() -> DecisionService:
    global _decision_service
    if _decision_service is None:
        _decision_service = DecisionService()
    return _decision_service
