"""Multi-market trading calendars — determine expected trading days per asset type.

Reuses the existing US market holiday logic and adds HK, forex, crypto rules.
"""

from datetime import date, timedelta
from typing import List, Set

from uteki.domains.index.services.market_calendar import (
    get_us_market_holidays,
    _observed,
    _nth_weekday_of_month,
)

# ── Hong Kong market holidays (major fixed + lunar new year approximation) ──

_HK_FIXED_HOLIDAYS: dict[int, Set[date]] = {}


def get_hk_market_holidays(year: int) -> Set[date]:
    """Return approximate HKEX holiday dates for a given year.

    Covers major fixed holidays. Lunar New Year and mid-autumn are approximate
    (±1 day). For production use, consider a lookup table or external API.
    """
    if year in _HK_FIXED_HOLIDAYS:
        return _HK_FIXED_HOLIDAYS[year]

    holidays: Set[date] = set()

    # New Year's Day
    holidays.add(_observed(date(year, 1, 1)))
    # Ching Ming Festival (approx Apr 4-5)
    holidays.add(date(year, 4, 4))
    # Labour Day
    holidays.add(_observed(date(year, 5, 1)))
    # Tuen Ng (Dragon Boat) — approx early June
    holidays.add(date(year, 6, 14))  # approximate
    # HKSAR Establishment Day
    holidays.add(_observed(date(year, 7, 1)))
    # Mid-Autumn — late Sep/early Oct, approximate
    holidays.add(date(year, 9, 29))  # approximate
    # National Day
    holidays.add(_observed(date(year, 10, 1)))
    # Christmas
    holidays.add(date(year, 12, 25))
    holidays.add(date(year, 12, 26))

    # Lunar New Year — very rough approximation (late Jan/early Feb)
    # In practice these shift every year; this is a conservative estimate
    holidays.add(date(year, 1, 29))
    holidays.add(date(year, 1, 30))
    holidays.add(date(year, 1, 31))

    _HK_FIXED_HOLIDAYS[year] = holidays
    return holidays


# ── Per-market trading day logic ──


def expected_trading_days(
    asset_type: str,
    start: date,
    end: date,
) -> List[date]:
    """Return the list of dates where we expect data for this asset type."""
    days: List[date] = []
    d = start
    while d <= end:
        if _is_expected_day(asset_type, d):
            days.append(d)
        d += timedelta(days=1)
    return days


def _is_expected_day(asset_type: str, d: date) -> bool:
    """Check if we expect market data for this asset type on this date."""
    if asset_type == "crypto":
        # 24/7 market — every day
        return True

    if asset_type == "forex":
        # Mon-Fri, no major holidays (simplified: weekdays only)
        return d.weekday() < 5

    if asset_type in ("us_stock", "us_etf", "futures"):
        # Weekday and not a US holiday
        if d.weekday() >= 5:
            return False
        holidays = get_us_market_holidays(d.year)
        return d not in holidays

    if asset_type == "hk_stock":
        # Weekday and not a HK holiday
        if d.weekday() >= 5:
            return False
        holidays = get_hk_market_holidays(d.year)
        return d not in holidays

    if asset_type == "a_share":
        # Simplified: weekdays, exclude Chinese holidays (very approximate)
        return d.weekday() < 5

    # Unknown asset type — assume weekdays
    return d.weekday() < 5


def latest_expected_date(asset_type: str, as_of: date | None = None) -> date:
    """Return the most recent date where data should be available.

    For crypto, that's yesterday (or today if UTC already past midnight).
    For equities, that's the last completed trading day.
    """
    if as_of is None:
        as_of = date.today()

    # Walk backward from yesterday to find last expected trading day
    d = as_of - timedelta(days=1)
    for _ in range(10):  # at most 10 days back (covers long weekends)
        if _is_expected_day(asset_type, d):
            return d
        d -= timedelta(days=1)
    return d
