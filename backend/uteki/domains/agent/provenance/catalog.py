"""SourceCatalog — per-run registry of all DataPoints.

Lifecycle:
- One SourceCatalog instance per pipeline run, attached to PipelineContext.
- Fetchers call `add()` with a DataPoint missing the `id` field; catalog
  assigns the next sequential id, dedupes against prior entries, and returns
  the assigned id.
- Tool-result formatters embed `[src:N]` markers into the LLM-visible text;
  the LLM is then instructed to copy those markers into its conclusions.
- After the run, `to_dict()` serializes the catalog into `full_report.source_catalog`.

Dedup policy:
- Two DataPoints are considered duplicates iff (source_url, key) match exactly.
  When add() is called with a duplicate, the existing id is returned and no
  new entry is created. This prevents the model from accumulating dozens of
  near-identical citations when it queries the same URL twice.
- Computed DataPoints (no source_url) dedupe by (source_type, key, value) instead.
"""
from __future__ import annotations

import logging
from typing import Iterator, Optional

from .datapoint import DataPoint, SourceType

logger = logging.getLogger(__name__)


class SourceCatalog:
    """Registry of DataPoints for a single pipeline run."""

    def __init__(self, as_of: Optional[str] = None):
        self._items: dict[int, DataPoint] = {}
        self._next_id = 1
        # Map (source_url, key) → id for fast dedup
        self._url_index: dict[tuple[str, str], int] = {}
        # Map (source_type, key, str(value)) → id for computed dedup
        self._computed_index: dict[tuple[str, str, str], int] = {}
        self.as_of = as_of

    # ── core API ──

    def add(self, partial: dict) -> int:
        """Register a DataPoint (without id) and return its assigned id.

        `partial` must contain all required DataPoint fields except `id`.
        Returns existing id if a duplicate is detected.
        """
        # Dedup by source_url+key for web/API sources
        url = partial.get("source_url")
        key = partial.get("key", "")
        source_type = partial.get("source_type")

        if url:
            cached = self._url_index.get((url, key))
            if cached is not None:
                return cached
        elif source_type == "computed":
            cached = self._computed_index.get((source_type, key, str(partial.get("value"))))
            if cached is not None:
                return cached

        # Inject the run-level as_of if not explicitly provided
        if "as_of" not in partial and self.as_of is not None:
            partial = {**partial, "as_of": self.as_of}

        # Future-data leak guard (active when as_of is set — Phase γ)
        if self.as_of and partial.get("published_at"):
            try:
                if partial["published_at"][:10] > self.as_of[:10]:
                    logger.warning(
                        f"[catalog] DataPoint {key!r} from {url} published "
                        f"{partial['published_at'][:10]} > as_of {self.as_of[:10]} — "
                        f"will not be added (would leak future data)"
                    )
                    # Return a sentinel "rejected" id of 0 — callers should treat as no-citation
                    return 0
            except (TypeError, IndexError):
                pass

        new_id = self._next_id
        self._next_id += 1
        partial["id"] = new_id
        dp = DataPoint(**partial)
        self._items[new_id] = dp

        if url:
            self._url_index[(url, key)] = new_id
        elif source_type == "computed":
            self._computed_index[(source_type, key, str(partial.get("value")))] = new_id

        return new_id

    def get(self, dp_id: int) -> Optional[DataPoint]:
        return self._items.get(dp_id)

    def has(self, dp_id: int) -> bool:
        return dp_id in self._items

    def __len__(self) -> int:
        return len(self._items)

    def __iter__(self) -> Iterator[DataPoint]:
        for k in sorted(self._items):
            yield self._items[k]

    # ── filters ──

    def by_source_type(self, source_type: SourceType) -> list[DataPoint]:
        return [dp for dp in self if dp.source_type == source_type]

    def grounded(self) -> list[DataPoint]:
        """All DataPoints that have a verifiable trail."""
        return [dp for dp in self if dp.is_grounded()]

    # ── serialization ──

    def to_dict(self) -> dict[int, dict]:
        """Plain dict for JSON storage in full_report.source_catalog."""
        return {dp_id: dp.model_dump() for dp_id, dp in self._items.items()}

    def to_llm_block(self, ids: Optional[list[int]] = None, max_excerpt: int = 200) -> str:
        """Render a compact source listing for inclusion in LLM user-message turns.

        Format:
            [7] reuters.com (2024-03-15) — TSMC market share: "Snippet text..."
            [8] yfinance — gross_margin: 53.2

        If `ids` is given, only those entries are rendered (useful when injecting
        only the sources for the latest tool call). Otherwise renders the whole catalog.
        """
        lines = []
        target_ids = ids if ids is not None else sorted(self._items)
        for dp_id in target_ids:
            dp = self._items.get(dp_id)
            if not dp:
                continue
            pub = f" ({dp.published_at[:10]})" if dp.published_at else ""
            publisher = dp.publisher or dp.source_type
            value_repr = ""
            if dp.excerpt:
                excerpt = dp.excerpt[:max_excerpt].replace("\n", " ")
                value_repr = f': "{excerpt}"'
            elif isinstance(dp.value, (int, float, str, bool)):
                value_repr = f": {dp.value}"
            lines.append(f"[src:{dp_id}] {publisher}{pub} — {dp.key}{value_repr}")
        return "\n".join(lines)
