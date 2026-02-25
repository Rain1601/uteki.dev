"""模型评分与排行榜服务 — Supabase REST API 版"""

import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from uuid import uuid4

from uteki.common.database import SupabaseRepository, db_manager

logger = logging.getLogger(__name__)

TABLE = "model_score"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_id(data: dict) -> dict:
    """Ensure dict has id + timestamps for a new row."""
    if "id" not in data:
        data["id"] = str(uuid4())
    data.setdefault("created_at", _now_iso())
    data.setdefault("updated_at", _now_iso())
    return data


async def _backup_rows(rows: list):
    """Best-effort SQLite backup (failure only warns)."""
    try:
        from uteki.domains.index.models.model_score import ModelScore
        async with db_manager.get_postgres_session() as session:
            for row in rows:
                safe = {k: v for k, v in row.items() if hasattr(ModelScore, k)}
                await session.merge(ModelScore(**safe))
    except Exception as e:
        logger.warning(f"SQLite backup failed for {TABLE}: {e}")


def _to_dict(row: dict) -> dict:
    """Compute derived fields from a raw model_score row (mirrors ModelScore.to_dict)."""
    adoption_count = row.get("adoption_count", 0)
    total_decisions = row.get("total_decisions", 0)
    win_count = row.get("win_count", 0)
    loss_count = row.get("loss_count", 0)
    cf_win = row.get("counterfactual_win_count", 0)
    cf_total = row.get("counterfactual_total", 0)
    approve = row.get("approve_vote_count", 0) or 0
    reject = row.get("rejection_count", 0) or 0
    avg_return = row.get("avg_return_pct", 0.0)
    sim_return = row.get("simulated_return_pct")
    dec_acc = row.get("decision_accuracy")
    conf_cal = row.get("confidence_calibration")

    adoption_rate = (adoption_count / total_decisions * 100) if total_decisions > 0 else 0
    win_rate = (win_count / (win_count + loss_count) * 100) if (win_count + loss_count) > 0 else 0
    cf_win_rate = (cf_win / cf_total * 100) if cf_total > 0 else 0
    model_score = approve - reject

    return {
        "id": row.get("id"),
        "model_provider": row.get("model_provider"),
        "model_name": row.get("model_name"),
        "prompt_version_id": row.get("prompt_version_id"),
        "adoption_count": adoption_count,
        "adoption_rate": round(adoption_rate, 1),
        "approve_vote_count": approve,
        "rejection_count": reject,
        "model_score": model_score,
        "win_count": win_count,
        "loss_count": loss_count,
        "win_rate": round(win_rate, 1),
        "total_decisions": total_decisions,
        "counterfactual_win_count": cf_win,
        "counterfactual_total": cf_total,
        "counterfactual_win_rate": round(cf_win_rate, 1),
        "avg_return_pct": round(avg_return, 2),
        "simulated_return_pct": round(sim_return, 2) if sim_return is not None else None,
        "decision_accuracy": round(dec_acc, 2) if dec_acc is not None else None,
        "confidence_calibration": round(conf_cal, 2) if conf_cal is not None else None,
    }


class ScoreService:
    """模型评分管理 — 采纳率、胜率、反事实胜率"""

    def __init__(self):
        self.repo = SupabaseRepository(TABLE)

    async def _get_or_create(
        self,
        model_provider: str,
        model_name: str,
        prompt_version_id: str,
    ) -> dict:
        """Get existing score row or create a new one. Returns dict."""
        row = self.repo.select_one(eq={
            "model_provider": model_provider,
            "model_name": model_name,
            "prompt_version_id": prompt_version_id,
        })

        if not row:
            row = _ensure_id({
                "model_provider": model_provider,
                "model_name": model_name,
                "prompt_version_id": prompt_version_id,
                "adoption_count": 0,
                "win_count": 0,
                "loss_count": 0,
                "total_decisions": 0,
                "counterfactual_win_count": 0,
                "counterfactual_total": 0,
                "avg_return_pct": 0.0,
                "rejection_count": 0,
                "approve_vote_count": 0,
            })
            self.repo.upsert(row)
            await _backup_rows([row])

        return row

    async def update_on_adoption(
        self,
        model_provider: str,
        model_name: str,
        prompt_version_id: str,
    ) -> None:
        """用户采纳时更新评分"""
        row = await self._get_or_create(model_provider, model_name, prompt_version_id)
        updated = {
            "adoption_count": (row.get("adoption_count", 0) or 0) + 1,
            "updated_at": _now_iso(),
        }
        self.repo.update(data=updated, eq={"id": row["id"]})
        row.update(updated)
        await _backup_rows([row])

    async def update_on_decision(
        self,
        model_provider: str,
        model_name: str,
        prompt_version_id: str,
    ) -> None:
        """每次 Arena 参与时增加总决策数"""
        row = await self._get_or_create(model_provider, model_name, prompt_version_id)
        updated = {
            "total_decisions": (row.get("total_decisions", 0) or 0) + 1,
            "updated_at": _now_iso(),
        }
        self.repo.update(data=updated, eq={"id": row["id"]})
        row.update(updated)
        await _backup_rows([row])

    async def update_on_counterfactual(
        self,
        model_provider: str,
        model_name: str,
        prompt_version_id: str,
        hypothetical_return_pct: float,
        was_adopted: bool,
    ) -> None:
        """反事实数据可用时更新"""
        row = await self._get_or_create(model_provider, model_name, prompt_version_id)

        cf_total = (row.get("counterfactual_total", 0) or 0) + 1
        cf_win = row.get("counterfactual_win_count", 0) or 0
        win_count = row.get("win_count", 0) or 0
        loss_count = row.get("loss_count", 0) or 0
        old_avg = row.get("avg_return_pct", 0.0) or 0.0

        if hypothetical_return_pct > 0:
            cf_win += 1

        if was_adopted:
            if hypothetical_return_pct > 0:
                win_count += 1
            else:
                loss_count += 1

        avg_return_pct = (
            (old_avg * (cf_total - 1) + hypothetical_return_pct) / cf_total
            if cf_total > 0 else 0
        )

        updated = {
            "counterfactual_total": cf_total,
            "counterfactual_win_count": cf_win,
            "win_count": win_count,
            "loss_count": loss_count,
            "avg_return_pct": avg_return_pct,
            "updated_at": _now_iso(),
        }
        self.repo.update(data=updated, eq={"id": row["id"]})
        row.update(updated)
        await _backup_rows([row])

    async def get_leaderboard(
        self,
        prompt_version_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """获取排行榜 — Python-side aggregation from model_score table"""
        # If no prompt_version_id, find the current one
        if not prompt_version_id:
            pv_repo = SupabaseRepository("prompt_version")
            current = pv_repo.select_one(eq={"is_current": True})
            prompt_version_id = current["id"] if current else None

        if not prompt_version_id:
            return []

        rows = self.repo.select_data(eq={"prompt_version_id": prompt_version_id})
        if not rows:
            return []

        # Sort by (approve_vote_count - rejection_count) DESC, adoption_count DESC, avg_return_pct DESC
        rows.sort(key=lambda r: (
            (r.get("approve_vote_count", 0) or 0) - (r.get("rejection_count", 0) or 0),
            r.get("adoption_count", 0) or 0,
            r.get("avg_return_pct", 0.0) or 0.0,
        ), reverse=True)

        leaderboard = []
        for rank, row in enumerate(rows, 1):
            d = _to_dict(row)
            d["rank"] = rank
            leaderboard.append(d)

        return leaderboard


_score_service: Optional[ScoreService] = None


def get_score_service() -> ScoreService:
    global _score_service
    if _score_service is None:
        _score_service = ScoreService()
    return _score_service
