"""
ToolBudget — resource constraints for ReAct loops.

Prevents agents from entering infinite tool-call cycles by enforcing
hard limits on searches, rounds, and time.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class ToolBudget:
    """Per-gate resource budget for ReAct execution."""

    max_searches: int = 6
    max_rounds: int = 5
    max_tool_calls: int = 10
    timeout_seconds: int = 180

    # ── runtime counters ──
    searches_used: int = field(default=0, init=False)
    rounds_used: int = field(default=0, init=False)
    tool_calls_used: int = field(default=0, init=False)
    _start_time: float = field(default=0.0, init=False)

    def start(self):
        self._start_time = time.time()

    @property
    def elapsed_seconds(self) -> float:
        if self._start_time == 0:
            return 0.0
        return time.time() - self._start_time

    @property
    def timed_out(self) -> bool:
        return self.elapsed_seconds > self.timeout_seconds

    def can_search(self) -> bool:
        return (
            self.searches_used < self.max_searches
            and self.tool_calls_used < self.max_tool_calls
            and not self.timed_out
        )

    def can_continue_round(self) -> bool:
        return self.rounds_used < self.max_rounds and not self.timed_out

    def record_search(self):
        self.searches_used += 1
        self.tool_calls_used += 1

    def record_tool_call(self):
        self.tool_calls_used += 1

    def record_round(self):
        self.rounds_used += 1

    def summary(self) -> dict:
        return {
            "rounds": f"{self.rounds_used}/{self.max_rounds}",
            "searches": f"{self.searches_used}/{self.max_searches}",
            "tool_calls": f"{self.tool_calls_used}/{self.max_tool_calls}",
            "elapsed_s": round(self.elapsed_seconds, 1),
        }
