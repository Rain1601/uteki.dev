"""US market holiday calendar for NYSE/NASDAQ trading day detection."""

from datetime import date, timedelta


def _nth_weekday_of_month(year: int, month: int, weekday: int, n: int) -> date:
    """Return the nth occurrence of a weekday in a given month (1-indexed)."""
    first = date(year, month, 1)
    # Days until the first occurrence of the target weekday
    offset = (weekday - first.weekday()) % 7
    result = first + timedelta(days=offset + 7 * (n - 1))
    return result


def _last_weekday_of_month(year: int, month: int, weekday: int) -> date:
    """Return the last occurrence of a weekday in a given month."""
    # Start from the last day of the month
    if month == 12:
        last_day = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last_day = date(year, month + 1, 1) - timedelta(days=1)
    offset = (last_day.weekday() - weekday) % 7
    return last_day - timedelta(days=offset)


def _easter(year: int) -> date:
    """Compute Easter Sunday using the Anonymous Gregorian algorithm."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _observed(d: date) -> date:
    """If a holiday falls on Saturday, observed Friday; on Sunday, observed Monday."""
    if d.weekday() == 5:  # Saturday
        return d - timedelta(days=1)
    if d.weekday() == 6:  # Sunday
        return d + timedelta(days=1)
    return d


def get_us_market_holidays(year: int) -> set[date]:
    """Return all NYSE/NASDAQ holiday dates for a given year."""
    holidays = set()

    # New Year's Day (Jan 1, observed)
    holidays.add(_observed(date(year, 1, 1)))

    # MLK Day (3rd Monday of January)
    holidays.add(_nth_weekday_of_month(year, 1, 0, 3))  # Monday=0

    # Presidents' Day (3rd Monday of February)
    holidays.add(_nth_weekday_of_month(year, 2, 0, 3))

    # Good Friday (Friday before Easter)
    holidays.add(_easter(year) - timedelta(days=2))

    # Memorial Day (last Monday of May)
    holidays.add(_last_weekday_of_month(year, 5, 0))

    # Juneteenth (Jun 19, observed)
    holidays.add(_observed(date(year, 6, 19)))

    # Independence Day (Jul 4, observed)
    holidays.add(_observed(date(year, 7, 4)))

    # Labor Day (1st Monday of September)
    holidays.add(_nth_weekday_of_month(year, 9, 0, 1))

    # Thanksgiving (4th Thursday of November)
    holidays.add(_nth_weekday_of_month(year, 11, 3, 4))  # Thursday=3

    # Christmas (Dec 25, observed)
    holidays.add(_observed(date(year, 12, 25)))

    return holidays


# Cache per year to avoid recomputation
_holiday_cache: dict[int, set[date]] = {}


def is_us_market_holiday(d: date) -> bool:
    """Check if a date is a US stock market holiday (NYSE/NASDAQ closed)."""
    year = d.year
    if year not in _holiday_cache:
        _holiday_cache[year] = get_us_market_holidays(year)
    return d in _holiday_cache[year]


def is_trading_day(d: date) -> bool:
    """Check if a date is a US stock market trading day (weekday and not a holiday)."""
    return d.weekday() < 5 and not is_us_market_holiday(d)
