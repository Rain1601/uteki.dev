"""
PipelineContext — structured context management for multi-gate pipelines.

Manages cross-gate information flow:
- Gate results with core conclusions, key findings, confidence
- Reflection results at checkpoints
- Downstream hints from reflections
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from uteki.domains.agent.provenance.catalog import SourceCatalog


@dataclass
class ToolAction:
    """Record of a single tool invocation."""
    tool_name: str
    tool_args: dict
    result: str                      # truncated for context-window safety (4000 chars)
    round_num: int
    search_query: str = ""          # actual search query (for web_search)
    result_length: int = 0          # chars returned by tool
    used_in_conclusion: bool = False # can be filled by Judge later
    result_full: Optional[str] = None  # un-truncated tool output for provenance/citation
    data_points: list[int] = field(default_factory=list)  # SourceCatalog IDs (β phase)


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
    tool_efficiency_score: Optional[float] = None  # ratio of useful tool calls
    tool_warnings: list[str] = field(default_factory=list)  # tool failure messages

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

    def __init__(
        self,
        company_data_text: str,
        symbol: str = "",
        catalog: Optional["SourceCatalog"] = None,
        as_of: Optional[str] = None,
    ):
        self.company_data_text = company_data_text
        self.symbol = symbol.upper()
        self.gate_results: dict[int, GateResult] = {}
        self.reflections: list[Reflection] = []
        self.downstream_hints: list[str] = []
        # Provenance: lazily constructed when first accessed if not provided
        self._catalog: Optional["SourceCatalog"] = catalog
        self.as_of: Optional[str] = as_of

    @property
    def catalog(self) -> "SourceCatalog":
        if self._catalog is None:
            from uteki.domains.agent.provenance.catalog import SourceCatalog
            self._catalog = SourceCatalog(as_of=self.as_of)
        return self._catalog

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
        failed_gates = [
            gn for gn, r in self.gate_results.items()
            if r.error or r.parse_status in ("timeout", "error")
        ]
        parts = [
            "══════════════════════════════════════════",
            "以下是6位分析师的完整研究报告，请仔细阅读后进行结构化：",
            "══════════════════════════════════════════",
        ]
        if failed_gates:
            parts.append(
                f"\n⚠️ 以下 Gate 执行失败或超时: {failed_gates}。"
                f"请基于可用数据进行最终裁决，对缺失维度标注'数据不足'。"
            )
        for gn in sorted(self.gate_results):
            r = self.gate_results[gn]
            if r.error:
                parts.append(f"\n───── Gate {gn}: {r.display_name} [❌ 失败: {r.error}] ─────")
                parts.append("(此 Gate 未能完成分析)")
            else:
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
