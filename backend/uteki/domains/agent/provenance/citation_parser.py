"""Citation parser — extract [src:N,M] markers from LLM output and validate.

Two markers are recognized:
- `[src:7]` or `[src:1,3,7]` — claim is supported by catalog DataPoints 1, 3, 7.
- `[src:none]` — claim is explicitly inferential / not source-backed.
  The model is instructed to use this rather than fabricating fake src ids.

Validation rules:
- Every cited int must exist in the SourceCatalog.
- Orphan citations (id not in catalog) are dropped from the parsed result and
  logged as warnings — these usually indicate the model invented a number.
- Duplicate ids within a single marker (e.g. `[src:1,1,3]`) are deduped.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

NO_SOURCE_TOKEN = "none"

# Match [src:1,3,7] or [src:1, 3, 7] or [src:none]
_CITATION_RE = re.compile(r"\[src:\s*([0-9, ]+|none)\s*\]", re.IGNORECASE)


@dataclass
class Citation:
    """One citation marker found in text."""
    span: tuple[int, int]               # (start, end) char offsets in the source string
    raw: str                            # the full matched substring "[src:1,3]"
    ids: list[int] = field(default_factory=list)
    is_no_source: bool = False          # true for "[src:none]"


@dataclass
class CitationExtraction:
    """Result of running the parser on a chunk of text."""
    text: str                           # original input
    citations: list[Citation] = field(default_factory=list)
    orphan_ids: list[int] = field(default_factory=list)  # ids cited but not in catalog
    no_source_count: int = 0

    def all_cited_ids(self) -> set[int]:
        out: set[int] = set()
        for c in self.citations:
            out.update(c.ids)
        return out

    def stripped(self) -> str:
        """Return the input text with all citation markers removed (for clean rendering)."""
        return _CITATION_RE.sub("", self.text).strip()

    def cleaned(self, valid_ids: set[int]) -> str:
        """Return the input text with orphan citation markers neutralized.

        Each `[src:M,N,...]` marker is rewritten:
        - if all IDs are valid → unchanged
        - if some IDs are valid → drop only the invalid ones, keep valid ones
        - if all IDs are invalid → replaced with `[src:none]` (admits non-grounded claim)
        - `[src:none]` markers are kept as-is

        This preserves the document structure but strips fabricated references
        so they don't render as broken chips in the UI.
        """
        def _repl(match: re.Match) -> str:
            body = match.group(1).strip().lower()
            if body == NO_SOURCE_TOKEN:
                return match.group(0)
            kept: list[int] = []
            for part in body.split(","):
                p = part.strip()
                if not p:
                    continue
                try:
                    n = int(p)
                except ValueError:
                    continue
                if n in valid_ids and n not in kept:
                    kept.append(n)
            if not kept:
                return "[src:none]"
            return f"[src:{','.join(str(n) for n in kept)}]"
        return _CITATION_RE.sub(_repl, self.text)


def extract_citations(
    text: str,
    valid_ids: Optional[set[int]] = None,
) -> CitationExtraction:
    """Extract citation markers from `text`.

    Args:
        text: LLM output to scan
        valid_ids: optional set of catalog ids — citations referencing missing
                  ids are dropped and logged as orphans. If None, no validation.

    Returns:
        CitationExtraction with `citations`, `orphan_ids`, and `no_source_count`.
    """
    if not text:
        return CitationExtraction(text="")

    citations: list[Citation] = []
    orphans: list[int] = []
    no_source_count = 0

    for match in _CITATION_RE.finditer(text):
        body = match.group(1).strip().lower()
        if body == NO_SOURCE_TOKEN:
            citations.append(Citation(
                span=(match.start(), match.end()),
                raw=match.group(0),
                ids=[],
                is_no_source=True,
            ))
            no_source_count += 1
            continue

        # Parse comma-separated integer ids
        ids: list[int] = []
        for part in body.split(","):
            part = part.strip()
            if not part:
                continue
            try:
                n = int(part)
            except ValueError:
                logger.debug(f"[citation_parser] non-integer in {match.group(0)!r}: {part!r}")
                continue
            if n in ids:
                continue  # dedup within marker
            if valid_ids is not None and n not in valid_ids:
                orphans.append(n)
                continue
            ids.append(n)

        if not ids and not orphans:
            # Empty parse — treat as no_source for visualization
            citations.append(Citation(
                span=(match.start(), match.end()),
                raw=match.group(0),
                ids=[],
                is_no_source=True,
            ))
            continue

        citations.append(Citation(
            span=(match.start(), match.end()),
            raw=match.group(0),
            ids=ids,
            is_no_source=False,
        ))

    return CitationExtraction(
        text=text,
        citations=citations,
        orphan_ids=orphans,
        no_source_count=no_source_count,
    )


class CitationParser:
    """Stateful helper bound to a SourceCatalog instance.

    Use this when you have a live catalog and want to validate citations in
    chunks of LLM output (e.g. inside skill_runner after each gate completes).

    Example:
        parser = CitationParser(catalog)
        ext = parser.parse(gate_result.raw)
        gate_result.citations = ext.all_cited_ids()
    """

    def __init__(self, catalog):
        # late import to keep this module importable without provenance/__init__.py
        from .catalog import SourceCatalog
        if not isinstance(catalog, SourceCatalog):
            raise TypeError(f"expected SourceCatalog, got {type(catalog).__name__}")
        self._catalog = catalog

    @property
    def valid_ids(self) -> set[int]:
        return {dp.id for dp in self._catalog}

    def parse(self, text: str) -> CitationExtraction:
        return extract_citations(text, valid_ids=self.valid_ids)
