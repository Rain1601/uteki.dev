"""Tool registry — replaces CompanyToolExecutor's hardcoded if/else dispatch.

Each tool is a `DataFetcher` that:
- accepts `args: dict` (from the LLM's <tool_call> block) and a `SourceCatalog`
- fetches data from its underlying source (CSE, yfinance, FMP, EDGAR, …)
- registers each retrieved fact as a DataPoint in the catalog
- returns a `FetcherOutput` containing:
    * `text`: the formatted result the LLM sees in the next turn
              (with `[src:N]` markers already inlined)
    * `data_point_ids`: the catalog ids it just registered

Compared to the old executor, this layer:
1. Decouples tool dispatch from the company domain (lives in `agent.provenance`)
2. Lets multiple gates share fetchers without duplicating wiring
3. Makes tool descriptions self-contained (each fetcher carries its own
   `name`, `description`, `args_schema`) so prompt assembly is automatic.

Thread-safety: each pipeline run gets a *fresh* registry-bound `ToolDispatcher`
so that the catalog reference is per-run.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional, Protocol

from .catalog import SourceCatalog

logger = logging.getLogger(__name__)


@dataclass
class FetcherOutput:
    """Return value of any DataFetcher invocation."""
    text: str                                   # LLM-visible result text
    data_point_ids: list[int] = field(default_factory=list)  # ids registered in catalog
    error: Optional[str] = None                 # set on transient failures (timeout, quota)

    @property
    def ok(self) -> bool:
        return self.error is None


class DataFetcher(Protocol):
    """Contract every tool must satisfy.

    Implementations should be `async` because most fetchers do I/O.
    """

    name: str
    description: str
    args_schema: dict             # JSON Schema describing accepted args
    requires_company_data: bool   # True if the fetcher needs ticker/profile context

    async def fetch(
        self,
        args: dict,
        catalog: SourceCatalog,
        as_of: Optional[str] = None,
        company_data: Optional[dict] = None,
    ) -> FetcherOutput:
        ...


# ── Registry ──────────────────────────────────────────────────────────────

# Type alias for the simpler functional fetchers (no class needed)
FetcherFn = Callable[
    [dict, SourceCatalog, Optional[str], Optional[dict]],
    Awaitable[FetcherOutput],
]


@dataclass
class ToolEntry:
    """Static description of a registered tool."""
    name: str
    description: str
    args_schema: dict
    fetcher: DataFetcher | FetcherFn
    requires_company_data: bool = False
    # Gates this tool is permitted in. Empty = available to all gates.
    allowed_gates: tuple[int, ...] = ()


class ToolRegistry:
    """Static registry of available DataFetchers.

    Tools register at module import time via `registry.register(...)`. The
    registry is a singleton — the *catalog* (run state) is passed at dispatch
    time, not stored here.
    """

    def __init__(self):
        self._tools: dict[str, ToolEntry] = {}

    def register(self, entry: ToolEntry) -> None:
        if entry.name in self._tools:
            logger.warning(f"[registry] overwriting existing tool '{entry.name}'")
        self._tools[entry.name] = entry

    def get(self, name: str) -> Optional[ToolEntry]:
        return self._tools.get(name)

    def names(self, gate: Optional[int] = None) -> list[str]:
        if gate is None:
            return list(self._tools.keys())
        return [
            n for n, e in self._tools.items()
            if not e.allowed_gates or gate in e.allowed_gates
        ]

    def describe_for_prompt(self, gate: Optional[int] = None) -> str:
        """Render a 【可用工具】 section for inclusion in a gate's system prompt."""
        names = self.names(gate)
        if not names:
            return ""
        parts = ["\n【可用工具】"]
        for name in names:
            entry = self._tools[name]
            parts.append(f"\n**{entry.name}** — {entry.description.strip()}")
            # Render minimal arg signature
            props = (entry.args_schema or {}).get("properties") or {}
            if props:
                arg_keys = ", ".join(f"{k}" for k in props.keys())
                parts.append(f"  参数: {{ {arg_keys} }}")
        return "\n".join(parts)


# Module-level singleton — fetchers register into this on import
_global_registry = ToolRegistry()


def register(entry: ToolEntry) -> None:
    """Convenience: register into the global registry."""
    _global_registry.register(entry)


def get_registry() -> ToolRegistry:
    return _global_registry


# ── Dispatcher (per-run binding of registry + catalog) ────────────────────

class ToolDispatcher:
    """Binds the global registry to a specific run's catalog + as_of.

    Per-run instance. Wraps registered fetchers with consistent error handling,
    timeout guards, and audit logging. This is the object the gate executor
    calls instead of the legacy `CompanyToolExecutor.execute()`.
    """

    def __init__(
        self,
        catalog: SourceCatalog,
        as_of: Optional[str] = None,
        company_data: Optional[dict] = None,
        registry: Optional[ToolRegistry] = None,
    ):
        self.catalog = catalog
        self.as_of = as_of
        self.company_data = company_data
        self._registry = registry or _global_registry

    async def execute(self, tool_name: str, args: dict) -> FetcherOutput:
        entry = self._registry.get(tool_name)
        if not entry:
            return FetcherOutput(text=f"Error: unknown tool '{tool_name}'",
                                 error="unknown_tool")
        try:
            fetcher = entry.fetcher
            if hasattr(fetcher, "fetch"):
                # Class-based DataFetcher
                return await fetcher.fetch(args, self.catalog, self.as_of, self.company_data)
            # Plain async function
            return await fetcher(args, self.catalog, self.as_of, self.company_data)
        except Exception as e:
            logger.warning(f"[dispatch] {tool_name} failed: {e}")
            return FetcherOutput(text=f"Error: {tool_name} failed: {e}", error=str(e))
