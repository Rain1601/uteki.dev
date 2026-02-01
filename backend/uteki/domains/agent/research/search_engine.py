"""
Search engine abstraction with strategy pattern.
Supports Google Custom Search API and DuckDuckGo.
"""

import logging
from abc import ABC, abstractmethod
from typing import List, Dict
from urllib.parse import urlparse
import os

from .schemas import SearchResult

logger = logging.getLogger(__name__)


class SearchStrategy(ABC):
    """Abstract base class for search strategies."""

    @abstractmethod
    async def search(self, query: str, max_results: int, region: str) -> List[SearchResult]:
        """Execute search and return results."""
        pass


class GoogleSearchStrategy(SearchStrategy):
    """Google Custom Search API strategy."""

    def __init__(self, api_key: str, engine_id: str):
        """Initialize with Google API credentials."""
        self.api_key = api_key
        self.engine_id = engine_id
        logger.info("Initialized Google Custom Search strategy")

    async def search(self, query: str, max_results: int, region: str = "us-en") -> List[SearchResult]:
        """Search using Google Custom Search API."""
        try:
            from googleapiclient.discovery import build
            from googleapiclient.errors import HttpError
        except ImportError:
            logger.error("google-api-python-client not installed")
            return []

        try:
            service = build("customsearch", "v1", developerKey=self.api_key)

            results = []
            num_per_request = min(max_results, 10)  # Google API max per request

            # Google API uses pagination
            start_index = 1
            while len(results) < max_results:
                response = service.cse().list(
                    q=query,
                    cx=self.engine_id,
                    num=num_per_request,
                    start=start_index,
                    lr=f"lang_{region.split('-')[1]}" if "-" in region else None,
                    gl=region.split("-")[0] if "-" in region else region,
                ).execute()

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


class DuckDuckGoSearchStrategy(SearchStrategy):
    """DuckDuckGo search strategy (no API key required)."""

    def __init__(self):
        """Initialize DuckDuckGo search."""
        logger.info("Initialized DuckDuckGo search strategy")

    async def search(self, query: str, max_results: int, region: str = "us-en") -> List[SearchResult]:
        """Search using DuckDuckGo."""
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            logger.error("duckduckgo-search not installed")
            return []

        try:
            results = []

            with DDGS() as ddgs:
                search_results = ddgs.text(
                    query,
                    region=region.replace("-", "_"),
                    max_results=max_results,
                )

                for result in search_results:
                    url = result.get("href", result.get("url", ""))
                    domain = urlparse(url).netloc

                    results.append(SearchResult(
                        title=result.get("title", ""),
                        url=url,
                        snippet=result.get("body", result.get("snippet", "")),
                        source=domain,
                    ))

            logger.info(f"DuckDuckGo search returned {len(results)} results for query: {query}")
            return results

        except Exception as e:
            logger.error(f"DuckDuckGo search failed: {e}")
            return []


class QuotaExceededError(Exception):
    """Raised when search API quota is exceeded."""
    pass


class SearchEngine:
    """
    Unified search interface with automatic fallback.
    Uses Google Custom Search if configured, otherwise DuckDuckGo.
    """

    def __init__(
        self,
        engine: str = "duckduckgo",
        google_api_key: str | None = None,
        google_engine_id: str | None = None,
    ):
        """
        Initialize search engine.

        Args:
            engine: Preferred engine ("google" or "duckduckgo")
            google_api_key: Google Custom Search API key
            google_engine_id: Google Custom Search Engine ID
        """
        self.preferred_engine = engine
        self.google_api_key = google_api_key or os.getenv("GOOGLE_CUSTOM_SEARCH_API_KEY")
        self.google_engine_id = google_engine_id or os.getenv("GOOGLE_CUSTOM_SEARCH_ENGINE_ID")

        # Initialize strategies
        self._google_strategy = None
        self._duckduckgo_strategy = DuckDuckGoSearchStrategy()

        if self.google_api_key and self.google_engine_id:
            self._google_strategy = GoogleSearchStrategy(
                self.google_api_key,
                self.google_engine_id
            )
            if engine == "google":
                logger.info("Using Google Custom Search as primary engine")
        elif engine == "google":
            logger.warning(
                "Google API not configured, falling back to DuckDuckGo"
            )
            self.preferred_engine = "duckduckgo"

        if self.preferred_engine == "duckduckgo":
            logger.info("Using DuckDuckGo as primary engine")

    async def search(
        self, query: str, max_results: int = 20, region: str = "us-en"
    ) -> List[SearchResult]:
        """
        Execute search with automatic fallback.

        Args:
            query: Search query
            max_results: Maximum results to return
            region: Region code (e.g., "us-en")

        Returns:
            List of SearchResult objects
        """
        logger.info(f"Searching for: {query} (max_results={max_results}, region={region})")

        # Try primary engine
        if self.preferred_engine == "google" and self._google_strategy:
            try:
                results = await self._google_strategy.search(query, max_results, region)
                if results:
                    return self._deduplicate(results)
            except QuotaExceededError:
                logger.warning("Google quota exceeded, falling back to DuckDuckGo")
            except Exception as e:
                logger.error(f"Google search failed, falling back to DuckDuckGo: {e}")

        # Fallback to DuckDuckGo
        results = await self._duckduckgo_strategy.search(query, max_results, region)
        return self._deduplicate(results)

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
