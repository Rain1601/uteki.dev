"""
PipelineContext — structured context management for multi-gate pipelines.

Manages cross-gate information flow:
- Gate results with core conclusions, key findings, confidence
- Reflection results at checkpoints
- Downstream hints from reflections
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ToolAction:
    """Record of a single tool invocation."""
    tool_name: str
    tool_args: dict
    result: str
    round_num: int


@dataclass
class GateResult:
    """Output of a single gate's ReAct execution."""
    gate_number: int
    skill_name: str
    display_name: str
    raw: str
    core_conclusion: Optional[str] = None
    key_findings: list[str] = field(default_factory=list)
    confidence: Optional[float] = None
    actions: list[ToolAction] = field(default_factory=list)
    rounds: int = 0
    latency_ms: int = 0
    parse_status: str = "text"
    error: Optional[str] = None

    @property
    def summary(self) -> str:
        """Short summary for passing to subsequent gates."""
        return self.core_conclusion or (self.raw[:800] if self.raw else "(no output)")


@dataclass
class Reflection:
    """Result of a cross-gate reflection checkpoint."""
    after_gate: int
    contradictions: list[str] = field(default_factory=list)
    downstream_hints: list[str] = field(default_factory=list)
    needs_revisit: Optional[int] = None
    raw: str = ""

    @property
    def has_contradiction(self) -> bool:
        return len(self.contradictions) > 0


class PipelineContext:
    """Cross-gate shared context container.

    Manages what information flows between gates:
    - Gates 2-6: receive core conclusions + key findings from prior gates
    - Gate 7: receives full raw text from all prior gates
    - Downstream hints from reflections are injected into subsequent gates
    """

    def __init__(self, company_data_text: str):
        self.company_data_text = company_data_text
        self.gate_results: dict[int, GateResult] = {}
        self.reflections: list[Reflection] = []
        self.downstream_hints: list[str] = []

    def add_gate_result(self, result: GateResult):
        self.gate_results[result.gate_number] = result

    def add_reflection(self, reflection: Reflection):
        self.reflections.append(reflection)
        self.downstream_hints.extend(reflection.downstream_hints)

    def get_context_for_gate(self, gate_number: int) -> str:
        """Build cross-gate context for a specific gate.

        Gates 2-6: core conclusions + key findings (concise)
        Gate 7: full raw text (comprehensive)
        """
        if gate_number == 7:
            return self._full_context()
        return self._summary_context(gate_number)

    def _summary_context(self, gate_number: int) -> str:
        """Concise context for gates 2-6."""
        parts = []
        for gn in sorted(self.gate_results):
            if gn >= gate_number:
                break
            r = self.gate_results[gn]
            parts.append(f"【Gate {gn}: {r.display_name}】")
            parts.append(f"核心结论: {r.summary}")
            if r.key_findings:
                parts.append(f"关键发现: {'; '.join(r.key_findings[:5])}")
            if r.confidence is not None:
                parts.append(f"置信度: {r.confidence:.1f}/10")

        if self.downstream_hints:
            parts.append(f"\n【前序分析提醒】")
            for hint in self.downstream_hints:
                parts.append(f"- {hint}")

        return "\n".join(parts) if parts else ""

    def _full_context(self) -> str:
        """Full raw text context for Gate 7 synthesis."""
        parts = [
            "══════════════════════════════════════════",
            "以下是6位分析师的完整研究报告，请仔细阅读后进行结构化：",
            "══════════════════════════════════════════",
        ]
        for gn in sorted(self.gate_results):
            r = self.gate_results[gn]
            parts.append(f"\n───── Gate {gn}: {r.display_name} ─────")
            parts.append(r.raw or "(no output)")

        # Append reflection findings for Gate 7 to consider
        if self.reflections:
            parts.append("\n\n═══ 反思检查结果 ═══")
            for ref in self.reflections:
                parts.append(f"\n[Gate {ref.after_gate} 后反思]")
                if ref.contradictions:
                    parts.append(f"发现矛盾: {'; '.join(ref.contradictions)}")
                if ref.downstream_hints:
                    parts.append(f"注意事项: {'; '.join(ref.downstream_hints)}")

        return "\n".join(parts)

    def to_accumulated_list(self) -> list[dict]:
        """Convert to the legacy accumulated format for backward compat."""
        result = []
        for gn in sorted(self.gate_results):
            r = self.gate_results[gn]
            result.append({
                "gate": r.gate_number,
                "skill": r.skill_name,
                "display_name": r.display_name,
                "raw": r.raw,
                "summary": r.summary,
                "core_conclusion": r.core_conclusion,
                "key_findings": r.key_findings,
                "confidence": r.confidence,
            })
        return result
