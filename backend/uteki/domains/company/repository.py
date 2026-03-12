"""
Company domain repository — SQLAlchemy async data access layer.

Uses SQLAlchemy directly (not SupabaseRepository) because the company schema
may not be exposed via PostgREST on Supabase yet.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from uuid import uuid4

from sqlalchemy import select, delete as sa_delete, func

from uteki.common.database import db_manager
from uteki.domains.company.models import CompanyAnalysis

logger = logging.getLogger(__name__)

# Summary columns (exclude full_report for list queries)
_SUMMARY_COLUMNS = [
    CompanyAnalysis.id,
    CompanyAnalysis.symbol,
    CompanyAnalysis.company_name,
    CompanyAnalysis.provider,
    CompanyAnalysis.model,
    CompanyAnalysis.status,
    CompanyAnalysis.verdict_action,
    CompanyAnalysis.verdict_conviction,
    CompanyAnalysis.verdict_quality,
    CompanyAnalysis.total_latency_ms,
    CompanyAnalysis.error_message,
    CompanyAnalysis.created_at,
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_id(data: dict) -> dict:
    if "id" not in data:
        data["id"] = str(uuid4())
    data.setdefault("created_at", _now())
    data.setdefault("updated_at", _now())
    return data


def _row_to_dict(row) -> dict:
    """Convert a SQLAlchemy model instance or Row to dict."""
    if hasattr(row, '__dict__'):
        d = {k: v for k, v in row.__dict__.items() if not k.startswith('_')}
    else:
        d = dict(row._mapping)
    # Serialize datetimes
    for k, v in d.items():
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


class CompanyAnalysisRepository:

    @staticmethod
    async def create(data: dict) -> dict:
        _ensure_id(data)
        async with db_manager.get_postgres_session() as session:
            obj = CompanyAnalysis(**{k: v for k, v in data.items() if hasattr(CompanyAnalysis, k)})
            session.add(obj)
            await session.flush()
            result = _row_to_dict(obj)
        return result

    @staticmethod
    async def list_by_user(
        user_id: str,
        symbol: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[dict], int]:
        async with db_manager.get_postgres_session() as session:
            # Count query
            count_q = select(func.count()).select_from(CompanyAnalysis).where(
                CompanyAnalysis.user_id == user_id
            )
            if symbol:
                count_q = count_q.where(CompanyAnalysis.symbol == symbol.upper())
            total = (await session.execute(count_q)).scalar() or 0

            # Data query (summary only)
            q = select(*_SUMMARY_COLUMNS).where(
                CompanyAnalysis.user_id == user_id
            ).order_by(CompanyAnalysis.created_at.desc()).offset(skip).limit(limit)
            if symbol:
                q = q.where(CompanyAnalysis.symbol == symbol.upper())
            rows = (await session.execute(q)).all()

            return [dict(r._mapping) for r in rows], total

    @staticmethod
    async def get_by_id(analysis_id: str) -> Optional[dict]:
        async with db_manager.get_postgres_session() as session:
            q = select(CompanyAnalysis).where(CompanyAnalysis.id == analysis_id)
            obj = (await session.execute(q)).scalar_one_or_none()
            if obj:
                return _row_to_dict(obj)
            return None

    @staticmethod
    async def update(analysis_id: str, data: dict) -> Optional[dict]:
        async with db_manager.get_postgres_session() as session:
            q = select(CompanyAnalysis).where(CompanyAnalysis.id == analysis_id)
            obj = (await session.execute(q)).scalar_one_or_none()
            if not obj:
                return None
            data["updated_at"] = _now()
            for k, v in data.items():
                if hasattr(CompanyAnalysis, k):
                    setattr(obj, k, v)
            await session.flush()
            return _row_to_dict(obj)

    @staticmethod
    async def delete(analysis_id: str) -> bool:
        async with db_manager.get_postgres_session() as session:
            q = sa_delete(CompanyAnalysis).where(CompanyAnalysis.id == analysis_id)
            result = await session.execute(q)
            return result.rowcount > 0
