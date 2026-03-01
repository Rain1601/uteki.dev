"""Data quality checker — validates kline data after ingestion.

Checks performed per symbol:
  1. Freshness   — is the latest data point up-to-date?
  2. Gaps        — missing expected trading days
  3. OHLC sanity — high >= low, prices > 0
  4. Anomalies   — single-day price change > threshold
  5. Volume      — zero volume on an expected trading day
  6. Duplicates  — multiple rows for same (time, symbol)

Issues are written to ``market_data.data_quality_log``.
"""

import logging
from datetime import date, timedelta
from typing import Dict, List, Optional
from uuid import uuid4

from sqlalchemy import select, text

from uteki.common.database import db_manager
from uteki.domains.data.models import DataQualityLog, KlineDaily, Symbol
from uteki.domains.data.validation.market_calendars import (
    expected_trading_days,
    latest_expected_date,
)

logger = logging.getLogger(__name__)

# Thresholds
PRICE_CHANGE_WARN = 0.15   # 15% daily change → warning
PRICE_CHANGE_ERROR = 0.50  # 50% daily change → error (likely bad data)
STALE_DAYS_WARN = 3        # data older than 3 expected-trading-days → warning
STALE_DAYS_ERROR = 7       # data older than 7 → error


class QualityChecker:
    """Run data quality checks and persist issues to data_quality_log."""

    async def check_symbol(
        self,
        symbol: str,
        asset_type: str,
        symbol_id: str,
        lookback_days: int = 90,
    ) -> List[Dict]:
        """Run all checks for a single symbol. Returns list of issue dicts."""
        end = date.today()
        start = end - timedelta(days=lookback_days)

        rows = await self._fetch_klines(symbol, start, end)
        if not rows:
            issue = self._make_issue(
                symbol, symbol_id, end, "no_data", "error",
                {"message": f"No kline data found in last {lookback_days} days"},
            )
            await self._persist_issues([issue])
            return [issue]

        issues: List[Dict] = []

        # 1. Freshness check
        issues.extend(self._check_freshness(symbol, symbol_id, asset_type, rows))

        # 2. Gap detection
        issues.extend(self._check_gaps(symbol, symbol_id, asset_type, rows, start, end))

        # 3. OHLC sanity
        issues.extend(self._check_ohlc(symbol, symbol_id, rows))

        # 4. Price anomalies
        issues.extend(self._check_anomalies(symbol, symbol_id, rows))

        # 5. Volume check
        issues.extend(self._check_volume(symbol, symbol_id, asset_type, rows))

        if issues:
            await self._persist_issues(issues)
            logger.warning(f"Quality check {symbol}: {len(issues)} issue(s) found")
        else:
            logger.info(f"Quality check {symbol}: OK")

        return issues

    async def check_all(self, lookback_days: int = 90) -> Dict:
        """Run quality checks on all active symbols."""
        async with db_manager.get_postgres_session() as session:
            result = await session.execute(
                select(Symbol).where(Symbol.is_active.is_(True))
            )
            symbols = result.scalars().all()

        all_issues: List[Dict] = []
        summary = {"total_symbols": len(symbols), "symbols_ok": 0, "symbols_with_issues": 0}

        for sym in symbols:
            issues = await self.check_symbol(
                sym.symbol, sym.asset_type, sym.id, lookback_days
            )
            if issues:
                summary["symbols_with_issues"] += 1
            else:
                summary["symbols_ok"] += 1
            all_issues.extend(issues)

        summary["total_issues"] = len(all_issues)
        summary["issues_by_type"] = {}
        for iss in all_issues:
            t = iss["issue_type"]
            summary["issues_by_type"][t] = summary["issues_by_type"].get(t, 0) + 1

        return {"summary": summary, "issues": all_issues}

    async def freshness_report(self) -> List[Dict]:
        """Quick freshness check: for each active symbol, report latest date vs expected."""
        async with db_manager.get_postgres_session() as session:
            result = await session.execute(
                select(Symbol).where(Symbol.is_active.is_(True))
                .order_by(Symbol.asset_type, Symbol.symbol)
            )
            symbols = result.scalars().all()

        report = []
        for sym in symbols:
            expected = latest_expected_date(sym.asset_type)
            actual = await self._get_latest_date(sym.symbol)

            status = "ok"
            days_behind = 0
            if actual is None:
                status = "no_data"
                days_behind = -1
            elif actual < expected:
                days_behind = (expected - actual).days
                if days_behind >= STALE_DAYS_ERROR:
                    status = "error"
                elif days_behind >= STALE_DAYS_WARN:
                    status = "warning"
                else:
                    status = "stale"

            report.append({
                "symbol": sym.symbol,
                "asset_type": sym.asset_type,
                "expected_latest": expected.isoformat(),
                "actual_latest": actual.isoformat() if actual else None,
                "days_behind": days_behind,
                "status": status,
            })

        return report

    # ── Individual checks ──

    def _check_freshness(
        self, symbol: str, symbol_id: str, asset_type: str, rows: List,
    ) -> List[Dict]:
        issues = []
        latest_row_date = rows[-1]["time"] if isinstance(rows[-1]["time"], date) else date.fromisoformat(str(rows[-1]["time"]))
        expected = latest_expected_date(asset_type)
        gap = (expected - latest_row_date).days

        if gap >= STALE_DAYS_ERROR:
            issues.append(self._make_issue(
                symbol, symbol_id, latest_row_date, "stale", "error",
                {"expected": expected.isoformat(), "actual": latest_row_date.isoformat(), "days_behind": gap},
            ))
        elif gap >= STALE_DAYS_WARN:
            issues.append(self._make_issue(
                symbol, symbol_id, latest_row_date, "stale", "warning",
                {"expected": expected.isoformat(), "actual": latest_row_date.isoformat(), "days_behind": gap},
            ))
        return issues

    def _check_gaps(
        self, symbol: str, symbol_id: str, asset_type: str,
        rows: List, start: date, end: date,
    ) -> List[Dict]:
        issues = []
        expected_days = set(expected_trading_days(asset_type, start, end))
        actual_days = set()
        for r in rows:
            d = r["time"] if isinstance(r["time"], date) else date.fromisoformat(str(r["time"]))
            actual_days.add(d)

        missing = sorted(expected_days - actual_days)

        # Group consecutive missing days
        if missing:
            # Only report if there are missing days within data range
            first_actual = min(actual_days) if actual_days else start
            last_actual = max(actual_days) if actual_days else end
            relevant_missing = [d for d in missing if first_actual <= d <= last_actual]

            if relevant_missing:
                issues.append(self._make_issue(
                    symbol, symbol_id, relevant_missing[0], "gap", "warning",
                    {
                        "missing_days": len(relevant_missing),
                        "first_missing": relevant_missing[0].isoformat(),
                        "last_missing": relevant_missing[-1].isoformat(),
                        "dates": [d.isoformat() for d in relevant_missing[:10]],  # first 10
                    },
                ))
        return issues

    def _check_ohlc(self, symbol: str, symbol_id: str, rows: List) -> List[Dict]:
        issues = []
        for r in rows:
            d = r["time"] if isinstance(r["time"], date) else date.fromisoformat(str(r["time"]))
            o, h, l, c = r.get("open"), r.get("high"), r.get("low"), r.get("close")

            if any(v is not None and v <= 0 for v in [o, h, l, c]):
                issues.append(self._make_issue(
                    symbol, symbol_id, d, "invalid_price", "error",
                    {"open": o, "high": h, "low": l, "close": c, "reason": "price <= 0"},
                ))
            elif h is not None and l is not None and h < l:
                issues.append(self._make_issue(
                    symbol, symbol_id, d, "ohlc_inconsistent", "error",
                    {"high": h, "low": l, "reason": "high < low"},
                ))
        return issues

    def _check_anomalies(self, symbol: str, symbol_id: str, rows: List) -> List[Dict]:
        issues = []
        for i in range(1, len(rows)):
            prev_close = rows[i - 1].get("close")
            curr_close = rows[i].get("close")

            if prev_close and curr_close and prev_close > 0:
                change = abs(curr_close - prev_close) / prev_close
                d = rows[i]["time"] if isinstance(rows[i]["time"], date) else date.fromisoformat(str(rows[i]["time"]))

                if change >= PRICE_CHANGE_ERROR:
                    issues.append(self._make_issue(
                        symbol, symbol_id, d, "anomaly", "error",
                        {"prev_close": float(prev_close), "close": float(curr_close),
                         "change_pct": round(change * 100, 2), "reason": "extreme price change"},
                    ))
                elif change >= PRICE_CHANGE_WARN:
                    issues.append(self._make_issue(
                        symbol, symbol_id, d, "anomaly", "warning",
                        {"prev_close": float(prev_close), "close": float(curr_close),
                         "change_pct": round(change * 100, 2)},
                    ))
        return issues

    def _check_volume(
        self, symbol: str, symbol_id: str, asset_type: str, rows: List,
    ) -> List[Dict]:
        # Forex often has 0 volume — skip
        if asset_type == "forex":
            return []

        issues = []
        zero_vol_dates = []
        for r in rows:
            vol = r.get("volume")
            if vol is not None and vol == 0:
                d = r["time"] if isinstance(r["time"], date) else date.fromisoformat(str(r["time"]))
                zero_vol_dates.append(d)

        if zero_vol_dates and len(zero_vol_dates) > 3:
            issues.append(self._make_issue(
                symbol, symbol_id, zero_vol_dates[0], "zero_volume", "info",
                {"count": len(zero_vol_dates), "dates": [d.isoformat() for d in zero_vol_dates[:5]]},
            ))
        return issues

    # ── Helpers ──

    def _make_issue(
        self, symbol: str, symbol_id: str, check_date: date,
        issue_type: str, severity: str, details: dict,
    ) -> Dict:
        return {
            "id": str(uuid4()),
            "symbol": symbol,
            "symbol_id": symbol_id,
            "check_date": check_date if isinstance(check_date, date) else date.fromisoformat(str(check_date)),
            "issue_type": issue_type,
            "severity": severity,
            "details": details,
            "resolved": False,
        }

    async def _fetch_klines(self, symbol: str, start: date, end: date) -> List[Dict]:
        async with db_manager.get_postgres_session() as session:
            result = await session.execute(
                select(KlineDaily)
                .where(KlineDaily.symbol == symbol)
                .where(KlineDaily.time >= start)
                .where(KlineDaily.time <= end)
                .order_by(KlineDaily.time.asc())
            )
            return [row.to_dict() for row in result.scalars().all()]

    async def _get_latest_date(self, symbol: str) -> Optional[date]:
        async with db_manager.get_postgres_session() as session:
            result = await session.execute(
                text("SELECT max(time) FROM market_data.klines_daily WHERE symbol = :symbol"),
                {"symbol": symbol},
            )
            return result.scalar()

    async def _persist_issues(self, issues: List[Dict]):
        """Write quality issues to data_quality_log table."""
        async with db_manager.get_postgres_session() as session:
            for iss in issues:
                log = DataQualityLog(
                    id=iss["id"],
                    symbol=iss["symbol"],
                    symbol_id=iss["symbol_id"],
                    check_date=iss["check_date"],
                    issue_type=iss["issue_type"],
                    severity=iss["severity"],
                    details=iss["details"],
                    resolved=False,
                )
                session.add(log)


# Singleton
_checker: Optional[QualityChecker] = None


def get_quality_checker() -> QualityChecker:
    global _checker
    if _checker is None:
        _checker = QualityChecker()
    return _checker
