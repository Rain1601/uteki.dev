"""Provenance subsystem — DataPoints, SourceCatalog, citation parsing.

Goal: every numeric/factual claim in a Company Agent analysis must trace back
to a structured DataPoint with explicit source_url, published_at, and confidence.
This makes hidden hallucinations (model recalled a number from training data
rather than the search result) visually distinct from grounded claims.
"""
from .datapoint import DataPoint
from .catalog import SourceCatalog
from .citation_parser import (
    CitationParser,
    extract_citations,
    NO_SOURCE_TOKEN,
)
from .registry import (
    ToolRegistry,
    ToolEntry,
    ToolDispatcher,
    FetcherOutput,
    DataFetcher,
    register,
    get_registry,
)

__all__ = [
    "DataPoint",
    "SourceCatalog",
    "CitationParser",
    "extract_citations",
    "NO_SOURCE_TOKEN",
    "ToolRegistry",
    "ToolEntry",
    "ToolDispatcher",
    "FetcherOutput",
    "DataFetcher",
    "register",
    "get_registry",
]
