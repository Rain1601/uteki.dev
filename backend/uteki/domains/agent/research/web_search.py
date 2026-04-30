"""
WebSearchService — thin wrapper over SearchEngine for use as a tool in skill pipelines.
"""
import logging
from typing import Any, Dict, List, Optional

from uteki.common.config import settings
from .search_engine import SearchEngine

logger = logging.getLogger(__name__)

_service: Optional["WebSearchService"] = None


class WebSearchService:
    """Wraps SearchEngine for easy tool integration."""

    def __init__(self):
        self._engine = SearchEngine(
            google_api_key=getattr(settings, "google_search_api_key", None)
            or getattr(settings, "google_custom_search_api_key", None),
            google_engine_id=getattr(settings, "google_search_engine_id", None)
            or getattr(settings, "google_custom_search_engine_id", None),
        )

    @property
    def available(self) -> bool:
        return self._engine._strategy is not None

    async def search(
        self,
        query: str,
        max_results: int = 5,
        date_restrict: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Search and return JSON-serializable results.

        Args:
            date_restrict: Optional CSE dateRestrict (e.g. "d7", "m6", "y2") to limit
                          results to a recency window. None = no filter.
        """
        results = await self._engine.search(
            query, max_results=max_results, date_restrict=date_restrict
        )
        return [
            {
                "title": r.title,
                "url": r.url,
                "snippet": r.snippet,
                "source": r.source,
                "published_at": r.published_at,
            }
            for r in results
        ]


def get_web_search_service() -> WebSearchService:
    global _service
    if _service is None:
        _service = WebSearchService()
    return _service
