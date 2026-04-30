"""Google Custom Search fetcher.

Replaces the legacy `_exec_web_search` in CompanyToolExecutor by:
1. Hitting `WebSearchService.search()` with a query (and optional time_window)
2. Wrapping each hit as a DataPoint with explicit publisher / published_at
3. Returning LLM-visible text with `[src:N]` markers inlined

Confidence policy:
- High when the source domain is a known authoritative publisher
  (sec.gov, reuters.com, bloomberg.com, ft.com, wsj.com)
- Medium when published_at is present (we can time-bound the claim)
- Low when published_at is missing (typical of CSE — useful but not auditable)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from uteki.domains.agent.provenance.catalog import SourceCatalog
from uteki.domains.agent.provenance.registry import (
    FetcherOutput,
    ToolEntry,
    register,
)

logger = logging.getLogger(__name__)

_CSE_TIMEOUT = 15

# Domains we treat as gold-standard primary sources
_AUTHORITATIVE_DOMAINS = {
    "sec.gov", "data.sec.gov",
    "investor.apple.com", "investor.tesla.com",
    "abc.xyz",  # Alphabet IR
    "reuters.com", "bloomberg.com", "ft.com", "wsj.com",
    "nasdaq.com", "nyse.com",
}


def _confidence_for(domain: str, published_at: Optional[str]) -> str:
    bare = domain.lower()
    if bare.startswith("www."):
        bare = bare[4:]
    if bare in _AUTHORITATIVE_DOMAINS or bare.endswith(".sec.gov"):
        return "high"
    if published_at:
        return "medium"
    return "low"


async def _fetch_cse(
    args: dict,
    catalog: SourceCatalog,
    as_of: Optional[str] = None,
    company_data: Optional[dict] = None,
) -> FetcherOutput:
    """Issue a Google CSE search and register results in the catalog."""
    query = (args.get("query") or "").strip()
    if not query:
        return FetcherOutput(text="Error: empty search query", error="empty_query")

    # Optional recency filter passed straight through to CSE
    time_window = args.get("time_window") or args.get("date_restrict")

    # Phase γ: derive a time_window from as_of when caller didn't pass one
    if as_of and not time_window:
        try:
            cutoff = datetime.fromisoformat(as_of[:19].replace("Z", "")).date()
            today = datetime.now(timezone.utc).date()
            days = max((today - cutoff).days, 1)
            # CSE accepts d/w/m/y units
            if days <= 90:
                time_window = f"d{days}"
            elif days <= 365 * 2:
                time_window = f"m{days // 30}"
            else:
                time_window = f"y{days // 365}"
        except Exception:
            pass

    # late import to avoid heavy deps at module load
    from uteki.domains.agent.research.web_search import get_web_search_service

    svc = get_web_search_service()
    if not svc.available:
        return FetcherOutput(
            text="Error: web search service not configured (missing API keys)",
            error="not_configured",
        )

    try:
        results = await asyncio.wait_for(
            svc.search(query, max_results=5, date_restrict=time_window),
            timeout=_CSE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        return FetcherOutput(text=f"Error: search timeout for: {query}", error="timeout")
    except Exception as e:
        logger.warning(f"[cse_fetcher] search failed: {e}")
        return FetcherOutput(text=f"Error: search failed: {e}", error=str(e))

    if not results:
        return FetcherOutput(text=f"No results found for: {query}")

    fetched_at = datetime.now(timezone.utc).isoformat()
    lines: list[str] = []
    ids: list[int] = []

    for hit in results:
        url = hit.get("url", "")
        domain = (hit.get("source") or urlparse(url).netloc or "unknown").lower()
        published_at = hit.get("published_at")
        confidence = _confidence_for(domain, published_at)

        sid = catalog.add({
            "key": f"web_hit:{query[:48]}",  # query-keyed so different queries don't dedup
            "value": {
                "title": hit.get("title", ""),
                "url": url,
                "snippet": hit.get("snippet", ""),
            },
            "source_type": "google_cse",
            "source_url": url,
            "publisher": domain,
            "published_at": published_at,
            "fetched_at": fetched_at,
            "confidence": confidence,
            "excerpt": (hit.get("snippet") or "")[:400],
        })

        # Sentinel id 0 means catalog rejected it (e.g. future-data leak in γ)
        if sid == 0:
            continue
        ids.append(sid)

        pub_tag = f" [发布: {published_at[:10]}]" if published_at else ""
        lines.append(
            f"[src:{sid}] {hit.get('title','')}{pub_tag}: "
            f"{hit.get('snippet','')} ({url})"
        )

    if not lines:
        return FetcherOutput(text=f"All search results filtered out by as_of constraint.",
                             error="all_filtered")

    return FetcherOutput(text="\n".join(lines), data_point_ids=ids)


# Register the fetcher into the global registry on import
register(ToolEntry(
    name="web_search",
    description=(
        "搜索互联网获取公司相关信息、新闻、分析。"
        "返回的每条结果都已编号 [src:N]，请在你的【关键发现】末尾用这些 src 引用支持你的判断。"
    ),
    args_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "搜索关键词（建议英文）"},
            "time_window": {
                "type": "string",
                "description": "可选；限制结果时间窗口，如 'd7'（近7天）、'm6'（近6个月）、'y2'（近2年）",
            },
        },
        "required": ["query"],
    },
    fetcher=_fetch_cse,
    requires_company_data=False,
))
