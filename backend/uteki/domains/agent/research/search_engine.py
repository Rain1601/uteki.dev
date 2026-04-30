"""
Search engine abstraction with strategy pattern.
Supports Google Custom Search API.
"""

import logging
import os
from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from urllib.parse import urlparse

from .schemas import SearchResult

logger = logging.getLogger(__name__)


def _extract_published_at(item: dict) -> Optional[str]:
    """Pull a publication timestamp out of CSE pagemap metadata if available.

    Google CSE doesn't expose datePublished directly, but many results include
    OpenGraph or news-article metadata in `pagemap`. We try the common keys
    in priority order; the first non-empty value wins. Returns ISO string or None.
    """
    pagemap = item.get("pagemap") or {}
    # OpenGraph article:published_time (most common)
    metatags = pagemap.get("metatags") or []
    if metatags and isinstance(metatags, list):
        first = metatags[0] or {}
        for k in ("article:published_time", "og:article:published_time",
                  "article:modified_time", "datepublished", "publishdate"):
            v = first.get(k)
            if v:
                return str(v)
    # NewsArticle / Article schema.org
    for key in ("newsarticle", "article", "blogposting"):
        items = pagemap.get(key) or []
        if items and isinstance(items, list):
            v = (items[0] or {}).get("datepublished") or (items[0] or {}).get("datemodified")
            if v:
                return str(v)
    return None


class SearchStrategy(ABC):
    """Abstract base class for search strategies."""

    @abstractmethod
    async def search(
        self,
        query: str,
        max_results: int,
        region: str,
        date_restrict: Optional[str] = None,
    ) -> List[SearchResult]:
        """Execute search and return results."""
        pass


class GoogleSearchStrategy(SearchStrategy):
    """Google Custom Search API strategy."""

    def __init__(self, api_key: str, engine_id: str):
        """Initialize with Google API credentials."""
        self.api_key = api_key
        self.engine_id = engine_id
        logger.info("Initialized Google Custom Search strategy")

    async def search(
        self,
        query: str,
        max_results: int,
        region: str = "us-en",
        date_restrict: Optional[str] = None,
    ) -> List[SearchResult]:
        """Search using Google Custom Search API.

        Args:
            date_restrict: Optional Google CSE dateRestrict value (e.g. "d7", "m6", "y2").
                           When set, only returns pages indexed within that recency window.
        """
        logger.debug(
            f"🔍 Google Search: '{query}' (max_results={max_results}, region={region}, "
            f"date_restrict={date_restrict})"
        )
        try:
            from googleapiclient.discovery import build
            from googleapiclient.errors import HttpError
        except ImportError:
            logger.error("❌ google-api-python-client not installed - install with: pip install google-api-python-client")
            return []

        try:
            service = build("customsearch", "v1", developerKey=self.api_key)
            logger.debug(f"✓ Google Custom Search service initialized")

            results = []
            num_per_request = min(max_results, 10)  # Google API max per request

            # Google API uses pagination
            start_index = 1
            while len(results) < max_results:
                kwargs = dict(
                    q=query,
                    cx=self.engine_id,
                    num=num_per_request,
                    start=start_index,
                    lr=f"lang_{region.split('-')[1]}" if "-" in region else None,
                    gl=region.split("-")[0] if "-" in region else region,
                )
                if date_restrict:
                    kwargs["dateRestrict"] = date_restrict
                response = service.cse().list(**kwargs).execute()

                items = response.get("items", [])
                if not items:
                    break

                for item in items:
                    url = item.get("link", "")
                    domain = urlparse(url).netloc

                    results.append(SearchResult(
                        title=item.get("title", ""),
                        url=url,
                        snippet=item.get("snippet", ""),
                        source=domain,
                        published_at=_extract_published_at(item),
                    ))

                    if len(results) >= max_results:
                        break

                start_index += num_per_request

            logger.info(f"Google search returned {len(results)} results for query: {query}")
            return results[:max_results]

        except HttpError as e:
            if e.resp.status == 429:
                logger.warning("Google API quota exceeded, results may be limited")
                raise QuotaExceededError("Google API quota exceeded")
            else:
                logger.error(f"Google API error: {e}")
                return []
        except Exception as e:
            logger.error(f"Google search failed: {e}")
            return []


class QuotaExceededError(Exception):
    """Raised when search API quota is exceeded."""
    pass


class SearchEngine:
    """
    Unified search interface using Google Custom Search API.
    """

    def __init__(
        self,
        google_api_key: str | None = None,
        google_engine_id: str | None = None,
    ):
        """
        Initialize search engine.

        Args:
            google_api_key: Google Custom Search API key
            google_engine_id: Google Custom Search Engine ID
        """
        self.google_api_key = (
            google_api_key
            or os.getenv("GOOGLE_SEARCH_API_KEY")
            or os.getenv("GOOGLE_CUSTOM_SEARCH_API_KEY")
        )
        self.google_engine_id = (
            google_engine_id
            or os.getenv("GOOGLE_SEARCH_ENGINE_ID")
            or os.getenv("GOOGLE_CUSTOM_SEARCH_ENGINE_ID")
        )

        self._strategy = None

        if self.google_api_key and self.google_engine_id:
            self._strategy = GoogleSearchStrategy(
                self.google_api_key,
                self.google_engine_id
            )
            logger.info("Google Custom Search initialized")
        else:
            logger.warning("Google Custom Search API not configured — search disabled")

    async def search(
        self,
        query: str,
        max_results: int = 20,
        region: str = "us-en",
        date_restrict: Optional[str] = None,
    ) -> List[SearchResult]:
        """
        Execute search with automatic fallback.

        Args:
            query: Search query
            max_results: Maximum results to return
            region: Region code (e.g., "us-en")
            date_restrict: Optional Google CSE dateRestrict (e.g. "d7", "m6", "y2")
                           to limit results to a recency window. None disables filtering.

        Returns:
            List of SearchResult objects
        """
        logger.info(
            f"Searching for: {query} (max_results={max_results}, region={region}, "
            f"date_restrict={date_restrict})"
        )

        if not self._strategy:
            logger.warning("No search engine configured")
            return []

        try:
            results = await self._strategy.search(query, max_results, region, date_restrict)
            if results:
                logger.info(f"Google returned {len(results)} results")
                return self._deduplicate(results)
            else:
                logger.warning(f"Google returned 0 results for: {query}")
                return []
        except QuotaExceededError:
            logger.warning("Google quota exceeded, returning empty results")
            return []
        except Exception as e:
            logger.error(f"Google search failed: {e}")
            return []

    def _deduplicate(self, results: List[SearchResult]) -> List[SearchResult]:
        """
        Remove duplicate URLs from results.
        Normalizes URLs by removing protocol and www prefix.
        """
        seen = set()
        deduplicated = []

        for result in results:
            normalized = self._normalize_url(result.url)
            if normalized not in seen:
                seen.add(normalized)
                deduplicated.append(result)

        if len(results) > len(deduplicated):
            logger.info(f"Removed {len(results) - len(deduplicated)} duplicate URLs")

        return deduplicated

    @staticmethod
    def _normalize_url(url: str) -> str:
        """Normalize URL for deduplication."""
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()

        # Remove www prefix
        if netloc.startswith("www."):
            netloc = netloc[4:]

        return f"{netloc}{parsed.path}"

    @staticmethod
    def aggregate_sources(results: List[SearchResult]) -> Dict[str, int]:
        """
        Aggregate results by source domain.

        Args:
            results: List of search results

        Returns:
            Dictionary mapping domain to count, sorted by count descending
        """
        sources: Dict[str, int] = {}

        for result in results:
            sources[result.source] = sources.get(result.source, 0) + 1

        # Sort by count descending
        sorted_sources = dict(sorted(sources.items(), key=lambda x: x[1], reverse=True))

        return sorted_sources
