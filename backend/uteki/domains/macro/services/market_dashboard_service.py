"""Market Dashboard Service — 宏观指标仪表盘

回答三个核心问题：
1. 美股贵不贵？（估值 Valuation）
2. 美元流动性高不高？（流动性 Liquidity）
3. 钱往哪里流？（资金流向 Money Flow）

数据源：
- FRED: 巴菲特指数、M2、联储资产负债表、逆回购、TGA、利率、VIX、收益率曲线、美元指数
- FMP: SPY PE、板块 ETF、风格/区域对比、BTC
"""

import asyncio
import logging
import statistics
from typing import Any, Dict, List, Optional

import httpx

from uteki.common.cache import get_cache_service
from uteki.common.config import settings
from uteki.domains.macro.services.fred_service import get_fred_service
from uteki.domains.index.services.data_service import get_data_service

logger = logging.getLogger(__name__)

# Cache TTL
FRED_CACHE_TTL = 3600    # 1 hour
FMP_CACHE_TTL = 900      # 15 min


def _signal(value: Optional[float], thresholds: Dict[str, Any]) -> str:
    """根据阈值返回 green / yellow / red"""
    if value is None:
        return "neutral"
    mode = thresholds.get("mode", "ascending")  # ascending: 高值=红, descending: 高值=绿
    low = thresholds["low"]
    high = thresholds["high"]
    if mode == "ascending":
        if value < low:
            return "green"
        elif value <= high:
            return "yellow"
        else:
            return "red"
    else:  # descending: 高值=绿
        if value > high:
            return "green"
        elif value >= low:
            return "yellow"
        else:
            return "red"


def _trend_signal(data: List[Dict]) -> str:
    """根据最近数据趋势返回信号: green=上升, yellow=平稳, red=下降"""
    if len(data) < 8:
        return "neutral"
    recent = [d["value"] for d in data[-4:]]
    prior = [d["value"] for d in data[-8:-4]]
    recent_avg = sum(recent) / len(recent)
    prior_avg = sum(prior) / len(prior)
    if prior_avg == 0:
        return "neutral"
    pct = (recent_avg - prior_avg) / abs(prior_avg) * 100
    if pct > 1:
        return "green"
    elif pct < -1:
        return "red"
    return "yellow"


def _majority_signal(signals: List[str]) -> str:
    """取众数信号"""
    counts = {"green": 0, "yellow": 0, "red": 0, "neutral": 0}
    for s in signals:
        counts[s] = counts.get(s, 0) + 1
    # neutral 不参与投票
    active = {k: v for k, v in counts.items() if k != "neutral"}
    if not active or all(v == 0 for v in active.values()):
        return "neutral"
    return max(active, key=active.get)


SIGNAL_LABELS = {
    "green": "Low Risk",
    "yellow": "Moderate",
    "red": "Elevated Risk",
    "neutral": "No Data",
}


class MarketDashboardService:
    def __init__(self):
        pass

    # ── FRED helpers ──

    async def _fetch_fred(self, series_id: str, limit: int = 52) -> Dict:
        """Fetch FRED series — delegates to FredService which has its own caching."""
        fred = get_fred_service()
        return await fred.fetch_series(series_id, limit=limit)

    # ── FMP helpers ──

    async def _fetch_quote(self, symbol: str) -> Dict[str, Any]:
        """Fetch quote — delegates to DataService which has its own caching."""
        ds = get_data_service()
        return await ds.get_quote(symbol)

    async def _fetch_quotes_batch(self, symbols: List[str]) -> Dict[str, Dict]:
        tasks = [self._fetch_quote(s) for s in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        out = {}
        for sym, res in zip(symbols, results):
            if isinstance(res, Exception):
                logger.warning(f"Quote fetch failed for {sym}: {res}")
                out[sym] = {"symbol": sym, "price": None, "error": str(res)}
            else:
                out[sym] = res
        return out

    # ── FMP ratios-ttm helper ──

    async def _fetch_ratios_ttm(self, symbol: str) -> Optional[Dict]:
        """Fetch TTM ratios from FMP /stable/ratios-ttm, cached 15min."""
        cache = get_cache_service()
        cache_key = f"uteki:dashboard:ratios_ttm:{symbol}"

        cached = await cache.get(cache_key)
        if cached:
            return cached
        if not settings.fmp_api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    "https://financialmodelingprep.com/stable/ratios-ttm",
                    params={"symbol": symbol, "apikey": settings.fmp_api_key},
                )
            if resp.status_code != 200:
                return None
            data = resp.json()
            if not data:
                return None
            row = data[0] if isinstance(data, list) else data
            await cache.set(cache_key, row, ttl=FMP_CACHE_TTL)
            return row
        except Exception as e:
            logger.warning(f"FMP ratios-ttm error for {symbol}: {e}")
            return None

    async def _get_market_pe(self) -> Optional[float]:
        """Top-5 mega-cap median PE as S&P 500 proxy."""
        symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]
        tasks = [self._fetch_ratios_ttm(s) for s in symbols]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        pes = []
        for r in results:
            if isinstance(r, dict):
                pe = r.get("priceToEarningsRatioTTM")
                if pe and pe > 0:
                    pes.append(pe)
        if len(pes) < 2:
            return None
        return statistics.median(pes)

    # ── Valuation indicators ──

    async def _get_buffett_indicator(self, limit: int = 1) -> Dict:
        sp500_res, gdp_res = await asyncio.gather(
            self._fetch_fred("SP500", limit=max(limit, 2)),
            self._fetch_fred("GDP", limit=max(limit, 2)),
            return_exceptions=True,
        )
        if isinstance(sp500_res, Exception) or isinstance(gdp_res, Exception):
            return {"id": "buffett", "name": "Buffett Indicator", "value": None, "signal": "neutral"}

        sp500_data = sp500_res.get("data", [])
        gdp_data = gdp_res.get("data", [])
        if not sp500_data or not gdp_data:
            return {"id": "buffett", "name": "Buffett Indicator", "value": None, "signal": "neutral"}

        sp500_val = sp500_data[-1]["value"]
        gdp_val = gdp_data[-1]["value"]
        # SP500 index ~6900, GDP ~31000 B$ → ratio ~0.22
        # Scale to make it comparable: (SP500 / GDP) * 1000
        ratio = (sp500_val / gdp_val * 1000) if gdp_val else None

        history = None
        if limit > 1 and len(sp500_data) > 1 and len(gdp_data) > 1:
            gdp_map = {d["date"][:7]: d["value"] for d in gdp_data}
            history = []
            last_gdp = gdp_data[-1]["value"]
            for s in sp500_data:
                g = gdp_map.get(s["date"][:7], last_gdp)
                if g:
                    history.append({"date": s["date"], "value": round(s["value"] / g * 1000, 1)})

        return {
            "id": "buffett",
            "name": "Buffett Indicator",
            "value": round(ratio, 1) if ratio else None,
            "unit": "",
            "signal": _signal(ratio, {"low": 150, "high": 220, "mode": "ascending"}),
            "description": "S&P 500 / GDP ratio (proxy)",
            "source": "FRED",
            "history": history,
        }

    async def _get_spy_pe(self) -> Dict:
        pe = await self._get_market_pe()
        return {
            "id": "spy_pe",
            "name": "S&P 500 P/E",
            "value": round(pe, 1) if pe else None,
            "unit": "x",
            "signal": _signal(pe, {"low": 18, "high": 25, "mode": "ascending"}),
            "description": "Top-5 Median PE (proxy)",
            "source": "FMP",
        }

    async def _get_equity_risk_premium(self) -> Dict:
        pe_task = self._get_market_pe()
        dgs10_task = self._fetch_fred("DGS10", limit=1)
        pe, dgs10_res = await asyncio.gather(pe_task, dgs10_task, return_exceptions=True)

        if isinstance(pe, Exception) or isinstance(dgs10_res, Exception):
            return {"id": "erp", "name": "Equity Risk Premium", "value": None, "signal": "neutral"}

        dgs10_data = dgs10_res.get("data", []) if isinstance(dgs10_res, dict) else []

        if not pe or not dgs10_data:
            return {"id": "erp", "name": "Equity Risk Premium", "value": None, "signal": "neutral"}

        earnings_yield = (1 / pe) * 100
        treasury_yield = dgs10_data[-1]["value"]
        erp = earnings_yield - treasury_yield

        return {
            "id": "erp",
            "name": "Equity Risk Premium",
            "value": round(erp, 2),
            "unit": "%",
            "signal": _signal(erp, {"low": 1, "high": 3, "mode": "descending"}),
            "description": "Earnings Yield - 10Y Treasury",
            "source": "FMP + FRED",
        }

    async def _get_spy_vs_ma200(self) -> Dict:
        quote = await self._fetch_quote("SPY")
        price = quote.get("price")
        ma200 = quote.get("ma200")
        if price and ma200 and ma200 > 0:
            ratio = (price / ma200) * 100
        else:
            ratio = None

        return {
            "id": "spy_ma200",
            "name": "SPY vs MA200",
            "value": round(ratio, 1) if ratio else None,
            "unit": "%",
            "signal": _signal(ratio, {"low": 95, "high": 110, "mode": "ascending"}),
            "description": "SPY Price / 200-day Moving Average",
            "source": "FMP",
        }

    # ── Liquidity indicators ──

    async def _get_fed_balance_sheet(self, limit: int = 1) -> Dict:
        res = await self._fetch_fred("WALCL", limit=max(limit, 8))
        data = res.get("data", [])
        value = data[-1]["value"] if data else None
        trend = _trend_signal(data) if len(data) >= 8 else "neutral"
        return {
            "id": "fed_bs",
            "name": "Fed Balance Sheet",
            "value": round(value / 1e6, 2) if value else None,
            "unit": "T$",
            "signal": trend,
            "description": "Federal Reserve Total Assets (WALCL)",
            "source": "FRED",
            "history": data if limit > 1 else None,
        }

    async def _get_m2(self, limit: int = 1) -> Dict:
        res = await self._fetch_fred("WM2NS", limit=max(limit, 60))
        data = res.get("data", [])
        if not data:
            return {"id": "m2", "name": "M2 Money Supply", "value": None, "signal": "neutral"}

        latest = data[-1]["value"]
        yoy = None
        if len(data) >= 52:
            year_ago = data[-52]["value"]
            if year_ago:
                yoy = (latest - year_ago) / year_ago * 100

        return {
            "id": "m2",
            "name": "M2 Money Supply",
            "value": round(latest, 1),
            "unit": "B$",
            "change_pct": round(yoy, 2) if yoy is not None else None,
            "signal": _signal(yoy, {"low": 0, "high": 5, "mode": "descending"}) if yoy is not None else "neutral",
            "description": f"M2 YoY: {round(yoy, 1)}%" if yoy is not None else "M2 Money Supply",
            "source": "FRED",
            "history": data if limit > 1 else None,
        }

    async def _get_reverse_repo(self, limit: int = 1) -> Dict:
        res = await self._fetch_fred("RRPONTSYD", limit=max(limit, 8))
        data = res.get("data", [])
        value = data[-1]["value"] if data else None
        trend = _trend_signal(data) if len(data) >= 8 else "neutral"
        # For reverse repo, declining is GREEN (liquidity releasing)
        inverted_trend = {"green": "red", "red": "green"}.get(trend, trend)
        return {
            "id": "rrp",
            "name": "Reverse Repo (RRP)",
            "value": round(value, 1) if value else None,
            "unit": "B$",
            "signal": inverted_trend,
            "description": "ON RRP (declining = more liquidity)",
            "source": "FRED",
            "history": data if limit > 1 else None,
        }

    async def _get_tga(self, limit: int = 1) -> Dict:
        res = await self._fetch_fred("WTREGEN", limit=max(limit, 8))
        data = res.get("data", [])
        value = data[-1]["value"] if data else None
        trend = _trend_signal(data) if len(data) >= 8 else "neutral"
        # TGA declining = more liquidity = GREEN
        inverted_trend = {"green": "red", "red": "green"}.get(trend, trend)
        return {
            "id": "tga",
            "name": "TGA Balance",
            "value": round(value, 1) if value else None,
            "unit": "B$",
            "signal": inverted_trend,
            "description": "Treasury General Account (declining = more liquidity)",
            "source": "FRED",
            "history": data if limit > 1 else None,
        }

    async def _get_net_liquidity(self, limit: int = 1) -> Dict:
        fetch_limit = max(limit, 8)
        walcl_res, rrp_res, tga_res = await asyncio.gather(
            self._fetch_fred("WALCL", limit=fetch_limit),
            self._fetch_fred("RRPONTSYD", limit=fetch_limit),
            self._fetch_fred("WTREGEN", limit=fetch_limit),
            return_exceptions=True,
        )

        def safe_data(r):
            return r.get("data", []) if isinstance(r, dict) else []

        walcl_data = safe_data(walcl_res)
        rrp_data = safe_data(rrp_res)
        tga_data = safe_data(tga_res)

        if not walcl_data:
            return {"id": "net_liq", "name": "Net Liquidity", "value": None, "signal": "neutral"}

        # Align by building date-indexed maps
        walcl_map = {d["date"]: d["value"] for d in walcl_data}
        rrp_map = {d["date"]: d["value"] for d in rrp_data}
        tga_map = {d["date"]: d["value"] for d in tga_data}

        # Use walcl dates as base, fill missing with last known
        net_history = []
        last_rrp = rrp_data[-1]["value"] if rrp_data else 0
        last_tga = tga_data[-1]["value"] if tga_data else 0

        for d in walcl_data:
            dt = d["date"]
            w = d["value"]
            r = rrp_map.get(dt, last_rrp)
            t = tga_map.get(dt, last_tga)
            net = w - r - t
            net_history.append({"date": dt, "value": round(net, 1)})

        value = net_history[-1]["value"] if net_history else None
        trend = _trend_signal(net_history) if len(net_history) >= 8 else "neutral"

        return {
            "id": "net_liq",
            "name": "Net Liquidity",
            "value": round(value / 1e6, 2) if value else None,
            "unit": "T$",
            "signal": trend,
            "description": "WALCL - RRP - TGA",
            "source": "FRED (calculated)",
            "history": net_history if limit > 1 else None,
        }

    async def _get_fed_funds_rate(self, limit: int = 1) -> Dict:
        res = await self._fetch_fred("FEDFUNDS", limit=max(limit, 2))
        data = res.get("data", [])
        value = data[-1]["value"] if data else None
        return {
            "id": "fedfunds",
            "name": "Fed Funds Rate",
            "value": round(value, 2) if value is not None else None,
            "unit": "%",
            "signal": _signal(value, {"low": 3, "high": 5, "mode": "ascending"}),
            "description": "Effective Federal Funds Rate",
            "source": "FRED",
            "history": data if limit > 1 else None,
        }

    # ── Money Flow indicators ──

    async def _get_sector_etfs(self) -> List[Dict]:
        symbols = ["XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLU", "XLRE", "XLC", "XLB"]
        names = {
            "XLK": "Technology", "XLF": "Financials", "XLE": "Energy",
            "XLV": "Healthcare", "XLY": "Consumer Disc.", "XLP": "Consumer Staples",
            "XLI": "Industrials", "XLU": "Utilities", "XLRE": "Real Estate",
            "XLC": "Communication", "XLB": "Materials",
        }
        quotes = await self._fetch_quotes_batch(symbols)
        sectors = []
        for sym in symbols:
            q = quotes.get(sym, {})
            sectors.append({
                "symbol": sym,
                "name": names.get(sym, sym),
                "price": q.get("price"),
                "change_pct": q.get("change_pct"),
            })
        sectors.sort(key=lambda x: x.get("change_pct") or 0, reverse=True)
        return sectors

    async def _get_style_comparisons(self) -> List[Dict]:
        symbols = ["SPY", "IWM", "EFA", "EEM", "QQQ", "IWD"]
        quotes = await self._fetch_quotes_batch(symbols)

        def _pair(label: str, sym_a: str, sym_b: str, label_a: str, label_b: str) -> Dict:
            qa = quotes.get(sym_a, {})
            qb = quotes.get(sym_b, {})
            return {
                "label": label,
                "a": {"symbol": sym_a, "name": label_a, "price": qa.get("price"), "change_pct": qa.get("change_pct")},
                "b": {"symbol": sym_b, "name": label_b, "price": qb.get("price"), "change_pct": qb.get("change_pct")},
            }

        return [
            _pair("Large vs Small Cap", "SPY", "IWM", "S&P 500", "Russell 2000"),
            _pair("US vs International", "SPY", "EFA", "US (SPY)", "Intl (EFA)"),
            _pair("US vs Emerging", "SPY", "EEM", "US (SPY)", "EM (EEM)"),
            _pair("Growth vs Value", "QQQ", "IWD", "Growth (QQQ)", "Value (IWD)"),
        ]

    async def _get_vix(self, limit: int = 1) -> Dict:
        res = await self._fetch_fred("VIXCLS", limit=max(limit, 2))
        data = res.get("data", [])
        value = data[-1]["value"] if data else None
        return {
            "id": "vix",
            "name": "VIX",
            "value": round(value, 1) if value is not None else None,
            "unit": "",
            "signal": _signal(value, {"low": 15, "high": 25, "mode": "ascending"}),
            "description": "CBOE Volatility Index",
            "source": "FRED",
            "history": data if limit > 1 else None,
        }

    async def _get_yield_curve(self, limit: int = 1) -> Dict:
        res = await self._fetch_fred("T10Y2Y", limit=max(limit, 2))
        data = res.get("data", [])
        value = data[-1]["value"] if data else None
        return {
            "id": "yield_curve",
            "name": "Yield Curve (10Y-2Y)",
            "value": round(value, 2) if value is not None else None,
            "unit": "%",
            "signal": _signal(value, {"low": 0, "high": 0.5, "mode": "descending"}),
            "description": "10Y - 2Y Treasury Spread",
            "source": "FRED",
            "history": data if limit > 1 else None,
        }

    async def _get_dxy(self, limit: int = 1) -> Dict:
        res = await self._fetch_fred("DTWEXBGS", limit=max(limit, 2))
        data = res.get("data", [])
        value = data[-1]["value"] if data else None
        return {
            "id": "dxy",
            "name": "US Dollar Index",
            "value": round(value, 2) if value is not None else None,
            "unit": "",
            "signal": "neutral",
            "description": "Broad Trade-Weighted USD Index",
            "source": "FRED",
            "history": data if limit > 1 else None,
        }

    async def _get_btc(self) -> Dict:
        quote = await self._fetch_quote("BTCUSD")
        price = quote.get("price")
        change = quote.get("change_pct")
        return {
            "id": "btc",
            "name": "Bitcoin",
            "value": round(price, 0) if price else None,
            "unit": "$",
            "change_pct": round(change, 2) if change else None,
            "signal": "neutral",
            "description": "BTC/USD",
            "source": "FMP",
        }

    # ═══════════════════════════════════════════════════
    # Public API methods
    # ═══════════════════════════════════════════════════

    async def get_overview(self) -> Dict:
        """3 类指标当前值 + 信号灯，无历史"""
        # Gather all concurrently
        val_tasks = asyncio.gather(
            self._get_buffett_indicator(limit=1),
            self._get_spy_pe(),
            self._get_equity_risk_premium(),
            self._get_spy_vs_ma200(),
            return_exceptions=True,
        )
        liq_tasks = asyncio.gather(
            self._get_fed_balance_sheet(limit=1),
            self._get_m2(limit=1),
            self._get_reverse_repo(limit=1),
            self._get_tga(limit=1),
            self._get_net_liquidity(limit=1),
            self._get_fed_funds_rate(limit=1),
            return_exceptions=True,
        )
        flow_tasks = asyncio.gather(
            self._get_vix(limit=1),
            self._get_yield_curve(limit=1),
            self._get_dxy(limit=1),
            self._get_btc(),
            return_exceptions=True,
        )

        val_results, liq_results, flow_results = await asyncio.gather(
            val_tasks, liq_tasks, flow_tasks
        )

        def _safe(results):
            return [r if not isinstance(r, Exception) else
                    {"id": "error", "name": "Error", "value": None, "signal": "neutral"}
                    for r in results]

        val_indicators = _safe(val_results)
        liq_indicators = _safe(liq_results)
        flow_indicators = _safe(flow_results)

        # Strip history for overview
        for ind in val_indicators + liq_indicators + flow_indicators:
            ind.pop("history", None)

        val_signal = _majority_signal([i.get("signal", "neutral") for i in val_indicators])
        liq_signal = _majority_signal([i.get("signal", "neutral") for i in liq_indicators])
        flow_signal = _majority_signal([i.get("signal", "neutral") for i in flow_indicators])

        return {
            "success": True,
            "data": {
                "categories": [
                    {
                        "category": "valuation",
                        "question": "Is the market expensive?",
                        "signal": val_signal,
                        "signal_label": SIGNAL_LABELS.get(val_signal, ""),
                        "indicators": val_indicators,
                    },
                    {
                        "category": "liquidity",
                        "question": "Is liquidity abundant?",
                        "signal": liq_signal,
                        "signal_label": SIGNAL_LABELS.get(liq_signal, ""),
                        "indicators": liq_indicators,
                    },
                    {
                        "category": "flow",
                        "question": "Where is money flowing?",
                        "signal": flow_signal,
                        "signal_label": SIGNAL_LABELS.get(flow_signal, ""),
                        "indicators": flow_indicators,
                    },
                ],
            },
        }

    async def get_valuation_detail(self, limit: int = 52) -> Dict:
        """估值详情 + 历史序列"""
        results = await asyncio.gather(
            self._get_buffett_indicator(limit=limit),
            self._get_spy_pe(),
            self._get_equity_risk_premium(),
            self._get_spy_vs_ma200(),
            return_exceptions=True,
        )
        indicators = [r if not isinstance(r, Exception) else
                      {"id": "error", "name": "Error", "value": None, "signal": "neutral"}
                      for r in results]
        signal = _majority_signal([i.get("signal", "neutral") for i in indicators])

        return {
            "success": True,
            "data": {
                "category": "valuation",
                "question": "Is the market expensive?",
                "signal": signal,
                "signal_label": SIGNAL_LABELS.get(signal, ""),
                "indicators": indicators,
            },
        }

    async def get_liquidity_detail(self, limit: int = 52) -> Dict:
        """流动性详情 + 历史序列"""
        results = await asyncio.gather(
            self._get_fed_balance_sheet(limit=limit),
            self._get_m2(limit=limit),
            self._get_reverse_repo(limit=limit),
            self._get_tga(limit=limit),
            self._get_net_liquidity(limit=limit),
            self._get_fed_funds_rate(limit=limit),
            return_exceptions=True,
        )
        indicators = [r if not isinstance(r, Exception) else
                      {"id": "error", "name": "Error", "value": None, "signal": "neutral"}
                      for r in results]
        signal = _majority_signal([i.get("signal", "neutral") for i in indicators])

        return {
            "success": True,
            "data": {
                "category": "liquidity",
                "question": "Is liquidity abundant?",
                "signal": signal,
                "signal_label": SIGNAL_LABELS.get(signal, ""),
                "indicators": indicators,
            },
        }

    async def get_flow_detail(self) -> Dict:
        """资金流向详情"""
        sectors_task = self._get_sector_etfs()
        style_task = self._get_style_comparisons()
        vix_task = self._get_vix(limit=1)
        yc_task = self._get_yield_curve(limit=1)
        dxy_task = self._get_dxy(limit=1)
        btc_task = self._get_btc()

        sectors, styles, vix, yc, dxy, btc = await asyncio.gather(
            sectors_task, style_task, vix_task, yc_task, dxy_task, btc_task,
            return_exceptions=True,
        )

        def _safe_val(v, default=None):
            return default if isinstance(v, Exception) else v

        indicators = []
        for ind in [_safe_val(vix, {}), _safe_val(yc, {}), _safe_val(dxy, {}), _safe_val(btc, {})]:
            if ind:
                ind.pop("history", None)
                indicators.append(ind)

        signal = _majority_signal([i.get("signal", "neutral") for i in indicators])

        return {
            "success": True,
            "data": {
                "category": "flow",
                "question": "Where is money flowing?",
                "signal": signal,
                "signal_label": SIGNAL_LABELS.get(signal, ""),
                "sectors": _safe_val(sectors, []),
                "style_comparisons": _safe_val(styles, []),
                "indicators": indicators,
            },
        }


# Singleton
_service: Optional[MarketDashboardService] = None


def get_market_dashboard_service() -> MarketDashboardService:
    global _service
    if _service is None:
        _service = MarketDashboardService()
    return _service
