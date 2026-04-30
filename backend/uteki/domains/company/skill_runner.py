"""
Company Investment Analysis — 7-Gate Decision Tree Pipeline (ReAct Architecture)

Architecture:
- Gates 1-6: ReAct loop (Think → Act → Observe → Conclude) with tool budget
- Gate 7:    读取全部 6 份分析报告 → 投资裁决 + 全量结构化 JSON
- Orchestrator: manages gate flow, reflection checkpoints, context accumulation

Supports:
- Dynamic tool use with budget constraints
- <conclude> tag for agent-driven termination
- Cross-gate reflection at checkpoints (Gate 3, Gate 5)
- on_progress callback for SSE streaming
- Backward-compatible output format
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import Callable
from typing import Any

from uteki.common.config import settings
from uteki.domains.agent.core.budget import ToolBudget
from uteki.domains.agent.core.context import (
    GateResult,
    PipelineContext,
    Reflection,
    ToolAction,
)
from uteki.domains.agent.core.tool_parser import ToolCallParser
from uteki.domains.agent.llm_adapter import (
    LLMAdapterFactory,
    LLMConfig,
    LLMMessage,
    LLMProvider,
)

from .financials import format_company_data_for_prompt
from .output_parser import parse_skill_output
from .schemas import (
    BusinessAnalysisOutput,
    CompanyFullReport,
    FisherQAOutput,
    ManagementAssessmentOutput,
    MoatAssessmentOutput,
    PositionHoldingOutput,
    ReverseTestOutput,
    ValuationOutput,
)
from .skills import (
    COMPANY_SKILL_PIPELINE,
    GATE_TOOLS,
    REFLECTION_CHECKPOINTS,
    CompanySkill,
)

# Per-gate schema mapping for instant structuring
_GATE_SCHEMAS: dict[str, type] = {
    "business_analysis": BusinessAnalysisOutput,
    "fisher_qa": FisherQAOutput,
    "moat_assessment": MoatAssessmentOutput,
    "management_assessment": ManagementAssessmentOutput,
    "reverse_test": ReverseTestOutput,
    "valuation": ValuationOutput,
}

_STRUCTURIZE_PROMPT = """你是一个数据结构化专家。从以下分析文本中提取关键信息，输出一个 JSON 对象。

分析文本：
{raw_text}

要求输出的 JSON schema（所有字段都需要填写，缺失数据用默认值）：
{schema_hint}

规则：
1. 直接输出 JSON，不要加任何解释
2. 所有字符串值使用中文
3. 从原文中提取数据，不要编造
4. 以 {{ 开始，以 }} 结束"""

logger = logging.getLogger(__name__)

_THINKING_RE = re.compile(r'<thinking>.*?</thinking>', re.DOTALL | re.IGNORECASE)


def _strip_thinking(text: str) -> str:
    """Remove <thinking>...</thinking> blocks that DeepSeek/Qwen models emit."""
    return _THINKING_RE.sub('', text).strip()


def _check_gate7_quality(parsed_dict: dict) -> tuple[bool, list[str]]:
    """Check if Gate 7 structured output meets minimum quality standards.

    Returns (passed, issues) — issues is empty when passed=True.
    """
    issues: list[str] = []

    # Fisher QA: must have all 15 questions
    fisher = parsed_dict.get("fisher_qa", {})
    q_count = len(fisher.get("questions", []))
    if q_count < 15:
        issues.append(f"fisher_qa.questions 只有 {q_count} 题，必须包含完整15题（Q1-Q15）")

    # Reverse test: need meaningful destruction scenarios and red flags
    reverse = parsed_dict.get("reverse_test", {})
    scenario_count = len(reverse.get("destruction_scenarios", []))
    if scenario_count < 2:
        issues.append(f"reverse_test.destruction_scenarios 只有 {scenario_count} 个，需要至少3个毁灭场景")
    flag_count = len(reverse.get("red_flags", []))
    if flag_count < 5:
        issues.append(f"reverse_test.red_flags 只有 {flag_count} 个，需要至少8个红旗检查项")

    # Business analysis: revenue streams must be non-empty
    ba = parsed_dict.get("business_analysis", {})
    if not ba.get("revenue_streams"):
        issues.append("business_analysis.revenue_streams 为空，需列出主要收入来源")

    # Moat: must have at least one moat type with evidence
    moat = parsed_dict.get("moat_assessment", {})
    moat_types = moat.get("moat_types", [])
    if not moat_types:
        issues.append("moat_assessment.moat_types 为空，需评估各类护城河")

    # Position holding: action and substance checks
    pos = parsed_dict.get("position_holding", {})
    if pos.get("action") not in ("BUY", "WATCH", "AVOID"):
        issues.append("position_holding.action 缺失或无效，必须是 BUY/WATCH/AVOID")
    one_sentence = pos.get("one_sentence", "")
    if len(one_sentence) < 20:
        issues.append("position_holding.one_sentence 过短，需是有实质内容的一句话结论")

    # Key string fields must have substance
    checks = [
        ("business_analysis", "business_description", 30),
        ("valuation", "price_reasoning", 40),
        ("moat_assessment", "competitive_position", 20),
    ]
    for section, field, min_len in checks:
        val = parsed_dict.get(section, {}).get(field, "")
        if len(val) < min_len:
            issues.append(f"{section}.{field} 内容过短（{len(val)}字），需要更具体的描述")

    return len(issues) == 0, issues


# ── Constants ─────────────────────────────────────────────────────────────

GATE_TIMEOUT = 180          # seconds per gate (ReAct loop budget)
GATE_TIMEOUT_GATE7 = 300    # Gate 7 reads all 6 reports + generates JSON
REFLECTION_TIMEOUT = 60     # seconds per reflection checkpoint
TOOL_TIMEOUT = 15           # seconds per tool execution

# ReAct budget defaults per gate
DEFAULT_BUDGET = ToolBudget(max_searches=6, max_rounds=5, max_tool_calls=10, timeout_seconds=GATE_TIMEOUT)
GATE7_BUDGET = ToolBudget(max_searches=0, max_rounds=1, max_tool_calls=0, timeout_seconds=GATE_TIMEOUT_GATE7)

_STREAM_CHUNK_SIZE = 80     # chars before emitting gate_text SSE event

# ── Provider Map ──────────────────────────────────────────────────────────

_PROVIDER_MAP = {
    "anthropic": LLMProvider.ANTHROPIC,
    "openai":    LLMProvider.OPENAI,
    "deepseek":  LLMProvider.DEEPSEEK,
    "google":    LLMProvider.GOOGLE,
    "qwen":      LLMProvider.QWEN,
    "minimax":   LLMProvider.MINIMAX,
    "doubao":    LLMProvider.DOUBAO,
}


# ── Tool Executor ─────────────────────────────────────────────────────────

class CompanyToolExecutor:
    """Executes tools available to the company analysis pipeline.

    When a SourceCatalog is provided (Phase β+), every web_search hit is
    registered as a DataPoint and the LLM-visible result lines carry
    `[src:N]` markers, enabling citation parsing downstream.
    """

    def __init__(self, company_data: dict | None = None, catalog=None):
        self._web_search = None
        self._company_data = company_data or {}
        self._catalog = catalog  # SourceCatalog or None

    def _get_web_search(self):
        if self._web_search is None:
            from uteki.domains.agent.research.web_search import get_web_search_service
            self._web_search = get_web_search_service()
        return self._web_search

    async def execute(self, tool_name: str, args: dict) -> str:
        if tool_name == "web_search":
            return await self._exec_web_search(args)
        if tool_name == "compare_peers":
            return await self._exec_compare_peers(args)
        return f"Error: unknown tool '{tool_name}'"

    async def _exec_web_search(self, args: dict) -> str:
        query = args.get("query", "")
        # Optional: time_window like "d7" (last 7 days), "m6" (6 months), "y2" (2 years).
        # Maps to Google CSE dateRestrict. Inactive when None — Phase γ will derive
        # this from the run's as_of date.
        time_window = args.get("time_window") or args.get("date_restrict")
        if not query:
            return "Error: empty search query"
        try:
            svc = self._get_web_search()
            if not svc.available:
                return "Error: web search service not configured (missing API keys)"
            results = await asyncio.wait_for(
                svc.search(query, max_results=5, date_restrict=time_window),
                timeout=TOOL_TIMEOUT,
            )
            if not results:
                return f"No results found for: {query}"
            return self._format_search_results(query, results)
        except asyncio.TimeoutError:
            return f"Error: search timeout for: {query}"
        except Exception as e:
            logger.warning(f"[company_tools] web_search failed: {e}")
            return f"Error: search failed: {e}"

    def _format_search_results(self, query: str, results: list[dict]) -> str:
        """Format search hits with optional [src:N] markers from the catalog.

        If a catalog is bound, each hit is registered as a DataPoint and its
        catalog id is prefixed inline so the LLM can cite it. Without a
        catalog (legacy path), falls back to plain markdown formatting.
        """
        from datetime import datetime, timezone
        from urllib.parse import urlparse
        fetched_at = datetime.now(timezone.utc).isoformat()
        lines = []
        for r in results:
            url = r.get("url", "")
            pub = r.get("published_at")
            pub_tag = f" [发布: {pub[:10]}]" if pub else ""
            title = r.get("title", "")
            snippet = r.get("snippet", "")
            src_prefix = ""
            if self._catalog is not None:
                domain = (r.get("source") or urlparse(url).netloc or "unknown").lower()
                # Confidence: high for authoritative domains, medium with date, low without
                _AUTH = {"sec.gov", "data.sec.gov", "reuters.com", "bloomberg.com",
                         "ft.com", "wsj.com", "abc.xyz"}
                bare = domain[4:] if domain.startswith("www.") else domain
                conf = ("high" if bare in _AUTH or bare.endswith(".sec.gov")
                        else "medium" if pub else "low")
                sid = self._catalog.add({
                    "key": f"web_hit:{query[:48]}",
                    "value": {"title": title, "url": url, "snippet": snippet},
                    "source_type": "google_cse",
                    "source_url": url,
                    "publisher": domain,
                    "published_at": pub,
                    "fetched_at": fetched_at,
                    "confidence": conf,
                    "excerpt": snippet[:400],
                })
                if sid > 0:
                    src_prefix = f"[src:{sid}] "
            lines.append(f"- {src_prefix}{title}{pub_tag}: {snippet} ({url})")
        return "\n".join(lines)

    async def _exec_compare_peers(self, args: dict) -> str:
        """Compare the target company with industry peers on key metrics."""
        metrics = args.get("metrics", ["roe", "gross_margin", "revenue_growth"])
        # LLMs sometimes pass metrics as a JSON string instead of a list
        if isinstance(metrics, str):
            try:
                metrics = json.loads(metrics)
            except (json.JSONDecodeError, ValueError):
                metrics = [m.strip().strip("'\"") for m in metrics.strip("[]").split(",") if m.strip()]
        if not metrics:
            return "Error: no metrics specified"

        profile = self._company_data.get("profile", {})
        symbol = profile.get("symbol", "")
        industry = profile.get("industry", "Unknown")

        # Gather target company data
        profitability = self._company_data.get("profitability", {})
        growth = self._company_data.get("growth", {})
        balance = self._company_data.get("balance", {})
        derived = self._company_data.get("derived", {})
        price_data = self._company_data.get("price_data", {})

        metric_map = {
            "roe": ("ROE", profitability.get("roe")),
            "roa": ("ROA", profitability.get("roa")),
            "gross_margin": ("毛利率", profitability.get("gross_margin")),
            "operating_margin": ("营业利润率", profitability.get("operating_margin")),
            "net_margin": ("净利率", profitability.get("profit_margin")),
            "revenue_growth": ("营收增速", growth.get("revenue_growth_yoy")),
            "debt_to_equity": ("资产负债率", balance.get("debt_equity")),
            "current_ratio": ("流动比率", balance.get("current_ratio")),
            "fcf_margin": ("FCF利润率", None),
            "pe_ratio": ("PE", None),
        }

        # Calculate FCF margin
        fcf = derived.get("free_cashflow")
        # Try to get revenue from income history
        income_history = self._company_data.get("income_history", [])
        latest_revenue = None
        if income_history:
            latest = income_history[-1] if isinstance(income_history, list) else None
            if latest and isinstance(latest, dict):
                latest_revenue = latest.get("revenue")
        if fcf and latest_revenue and latest_revenue > 0:
            metric_map["fcf_margin"] = ("FCF利润率", fcf / latest_revenue)

        # Build target company metrics
        lines = [f"## {symbol} ({industry}) 关键指标"]
        target_values = {}
        for m in metrics:
            label, val = metric_map.get(m, (m, None))
            target_values[m] = val
            if val is not None:
                if m in ("roe", "roa", "gross_margin", "operating_margin", "net_margin",
                         "revenue_growth", "fcf_margin"):
                    lines.append(f"- {label}: {val:.1%}")
                else:
                    lines.append(f"- {label}: {val:.2f}")
            else:
                lines.append(f"- {label}: [数据缺失]")

        # Try to fetch peer data via yfinance
        try:
            import yfinance as yf
            ticker = yf.Ticker(symbol)
            # Some tickers don't have industry peers — search by industry instead
            peers = []
            # Try getting recommendations/peers if available
            try:
                # yfinance may or may not have peer info depending on version
                raw_peers = getattr(ticker, 'recommendations', None)
                if hasattr(ticker, 'get_recommendations'):
                    pass  # Not all versions support this
            except Exception:
                pass

            # Fallback: use sector/industry to find 3-5 comparable companies
            # We'll use web search as the primary peer discovery method
            svc = self._get_web_search()
            if svc.available:
                search_results = await asyncio.wait_for(
                    svc.search(f"{symbol} competitors peer companies {industry}", max_results=3),
                    timeout=TOOL_TIMEOUT,
                )
                if search_results:
                    lines.append("\n## 行业竞争对手参考")
                    for r in search_results:
                        lines.append(f"- {r['title']}: {r['snippet']}")

        except Exception as e:
            logger.warning(f"[compare_peers] peer lookup failed: {e}")
            lines.append(f"\n(同行对比数据获取失败: {e})")

        return "\n".join(lines)


# ── Gate Executor (ReAct Loop) ────────────────────────────────────────────

class GateExecutor:
    """Executes a single gate using the ReAct pattern.

    Think → Act → Observe → (repeat or Conclude)
    """

    def __init__(
        self,
        model_config: dict,
        tool_executor: CompanyToolExecutor,
        tool_parser: ToolCallParser,
    ):
        self.model_config = model_config
        self.tool_executor = tool_executor
        self.tool_parser = tool_parser
        self._adapter = None

    def _get_adapter(self, max_tokens: int = 8192, json_mode: bool = False):
        provider_name = self.model_config["provider"]
        provider = _PROVIDER_MAP.get(provider_name)
        if not provider:
            raise ValueError(f"Unsupported provider: {provider_name}")

        base_url = self.model_config.get("base_url")
        if provider_name == "google" and not base_url:
            base_url = getattr(settings, "google_api_base_url", None)

        # json_mode: supported by OpenAI-compatible providers (not Anthropic)
        use_json_mode = json_mode and provider_name != "anthropic"

        return LLMAdapterFactory.create_adapter(
            provider=provider,
            api_key=self.model_config["api_key"],
            model=self.model_config["model"],
            config=LLMConfig(
                temperature=0, max_tokens=max_tokens, json_mode=use_json_mode
            ),
            base_url=base_url,
        )

    async def execute(
        self,
        skill: CompanySkill,
        context: PipelineContext,
        budget: ToolBudget,
        on_progress: Callable[[dict], Any] | None = None,
    ) -> GateResult:
        """Execute a gate with ReAct loop."""
        budget.start()
        start_time = time.time()

        if skill.gate_number == 7:
            return await self._execute_gate7(skill, context, budget, on_progress)

        return await self._execute_react(skill, context, budget, on_progress, start_time)

    async def _execute_react(
        self,
        skill: CompanySkill,
        context: PipelineContext,
        budget: ToolBudget,
        on_progress: Callable | None,
        start_time: float,
    ) -> GateResult:
        """ReAct loop for gates 1-6."""
        adapter = self._get_adapter()
        user_msg = self._build_user_message(skill, context)
        messages = [
            LLMMessage(role="system", content=skill.system_prompt),
            LLMMessage(role="user", content=user_msg),
        ]
        actions: list[ToolAction] = []
        tool_warnings: list[str] = []
        # Accumulate all non-tool-call text across rounds for richer output
        all_analysis_text: list[str] = []
        # β.17: track whether we already asked the model to fix orphan citations
        # so we don't loop indefinitely on stubborn fabrication
        _citation_retry_done = False

        while budget.can_continue_round():
            budget.record_round()
            raw = ""
            _pending_text = ""

            async def _collect():
                nonlocal raw, _pending_text
                async for chunk in adapter.chat(messages, stream=True):
                    raw += chunk
                    _pending_text += chunk
                    if on_progress and len(_pending_text) >= _STREAM_CHUNK_SIZE:
                        on_progress({
                            "type": "gate_text",
                            "gate": skill.gate_number,
                            "skill": skill.skill_name,
                            "text": _pending_text,
                        })
                        _pending_text = ""
                if on_progress and _pending_text:
                    on_progress({
                        "type": "gate_text",
                        "gate": skill.gate_number,
                        "skill": skill.skill_name,
                        "text": _pending_text,
                    })
                    _pending_text = ""

            remaining = budget.timeout_seconds - budget.elapsed_seconds
            if remaining <= 0:
                break
            await asyncio.wait_for(_collect(), timeout=max(remaining, 5))

            # Check for conclusion
            conclusion = self.tool_parser.parse_conclusion(raw)
            if conclusion:
                # β.17: Before accepting <conclude>, validate citations.
                # If model fabricated src IDs (typical when it skipped tools and
                # synthesized blindly), reject and ask it to redo with correct
                # IDs. Allow at most 1 retry per gate to avoid loops.
                catalog = getattr(self.tool_executor, "_catalog", None)
                if catalog is not None and not _citation_retry_done:
                    from uteki.domains.agent.provenance import extract_citations
                    valid = {dp.id for dp in catalog}
                    ext = extract_citations(conclusion.text, valid_ids=valid)
                    if ext.orphan_ids:
                        max_id = max(valid) if valid else 0
                        sample = ext.orphan_ids[:8]
                        logger.warning(
                            f"[citation] gate {skill.gate_number} {skill.skill_name}: "
                            f"conclude rejected — {len(ext.orphan_ids)} orphan IDs "
                            f"({sample}{'…' if len(ext.orphan_ids) > 8 else ''}). Retrying."
                        )
                        if on_progress:
                            on_progress({
                                "type": "tool_warning",
                                "gate": skill.gate_number,
                                "skill": skill.skill_name,
                                "tool_name": "citation_check",
                                "warning": f"模型引用了 {len(ext.orphan_ids)} 个不存在的 src ID，要求重写",
                                "round": budget.rounds_used,
                            })
                        messages.append(LLMMessage(role="assistant", content=raw))
                        messages.append(LLMMessage(
                            role="user",
                            content=(
                                f"⚠️ 你的结论引用了 {len(ext.orphan_ids)} 个不存在的 src 编号（如 "
                                f"{sample}），合法 src ID 范围严格限定为 [1..{max_id}]。\n"
                                f"请基于已有数据来源目录重写结论：\n"
                                f"- 删除所有 ID > {max_id} 的引用\n"
                                f"- 没有具体来源支持的判断改用 [src:none] 标注\n"
                                f"- 保留原始分析逻辑，仅修正引用编号\n"
                                f"再次用 <conclude> 标签包裹完整输出。"
                            ),
                        ))
                        # Mark retry done so we don't loop forever
                        _citation_retry_done = True
                        # Reset raw and let outer loop re-collect
                        raw = ""
                        continue

                latency = int((time.time() - start_time) * 1000)
                eff = round(sum(1 for a in actions if a.result_length > 100) / len(actions), 2) if actions else None
                return GateResult(
                    gate_number=skill.gate_number,
                    skill_name=skill.skill_name,
                    display_name=skill.display_name,
                    raw=conclusion.text,
                    core_conclusion=conclusion.core_conclusion,
                    key_findings=conclusion.key_findings or [],
                    confidence=conclusion.confidence,
                    actions=actions,
                    rounds=budget.rounds_used,
                    latency_ms=latency,
                    parse_status="text",
                    tool_efficiency_score=eff,
                    tool_warnings=tool_warnings,
                )

            # Check for tool call
            tool_call = self.tool_parser.parse_tool_call(raw)
            if not tool_call:
                # No tool call and no conclude tag — treat as implicit conclusion
                # Use the last round's full text as the primary output
                all_analysis_text.append(_strip_thinking(raw))
                break

            # Strip tool_call XML and thinking blocks before accumulating analysis content
            analysis_before_tool = re.sub(
                r'<tool_call>.*?</tool_call>', '', raw, flags=re.DOTALL
            ).strip()
            analysis_before_tool = _strip_thinking(analysis_before_tool)
            if analysis_before_tool:
                all_analysis_text.append(analysis_before_tool)

            # Validate tool is allowed for this gate
            if tool_call.name not in GATE_TOOLS.get(skill.gate_number, []):
                logger.warning(
                    f"[gate_executor] gate {skill.gate_number} tried disallowed tool: {tool_call.name}"
                )
                break

            # Check budget
            if tool_call.name == "web_search" and not budget.can_search():
                logger.info(f"[gate_executor] search budget exhausted for gate {skill.gate_number}")
                messages.append(LLMMessage(role="assistant", content=raw))
                messages.append(LLMMessage(
                    role="user",
                    content="工具调用预算已用完，请基于已有信息直接得出结论。请用 <conclude> 标签包裹你的最终分析。",
                ))
                continue

            # Execute tool
            logger.info(
                f"[gate_executor] gate={skill.gate_number} round={budget.rounds_used} "
                f"{tool_call.name}({tool_call.arguments})"
            )
            if on_progress:
                on_progress({
                    "type": "tool_call",
                    "gate": skill.gate_number,
                    "skill": skill.skill_name,
                    "tool_name": tool_call.name,
                    "tool_args": tool_call.arguments,
                    "round": budget.rounds_used,
                })

            tool_result = await self.tool_executor.execute(tool_call.name, tool_call.arguments)
            tool_failed = tool_result.startswith("Error:") or tool_result.startswith("No results")

            if tool_failed and on_progress:
                on_progress({
                    "type": "tool_warning",
                    "gate": skill.gate_number,
                    "skill": skill.skill_name,
                    "tool_name": tool_call.name,
                    "warning": tool_result[:200],
                    "round": budget.rounds_used,
                })
            if tool_failed:
                tool_warnings.append(
                    f"Gate {skill.gate_number} {tool_call.name}: {tool_result[:100]}"
                )

            if tool_call.name == "web_search":
                budget.record_search()
            else:
                budget.record_tool_call()

            actions.append(ToolAction(
                tool_name=tool_call.name,
                tool_args=tool_call.arguments,
                result=tool_result[:4000],   # increased from 500 — preserves URL+snippet for ~5 results
                result_full=tool_result,     # un-truncated for provenance / citation extraction
                round_num=budget.rounds_used,
                search_query=tool_call.arguments.get("query", ""),
                result_length=len(tool_result),
            ))

            # Append conversation turn and continue.
            # Remind the model of the current valid src id range so it doesn't
            # fabricate IDs beyond catalog.len() (β.13 mitigation).
            try:
                catalog_len = len(self.tool_executor._catalog) if getattr(self.tool_executor, "_catalog", None) else 0
            except Exception:
                catalog_len = 0
            range_hint = (
                f"\n\n⚠️ 当前合法 src ID 范围已扩展至 [1..{catalog_len}]。"
                f"在 [src:N] 中只能使用此范围内的编号，不允许编造更大的 ID。"
            ) if catalog_len > 0 else ""
            messages.append(LLMMessage(role="assistant", content=raw))
            messages.append(LLMMessage(
                role="user",
                content=(
                    f"工具 {tool_call.name} 的执行结果:\n{tool_result}{range_hint}\n\n"
                    f"请基于此结果继续分析。如果信息充分，请用 <conclude> 标签包裹最终分析。"
                    f"如果还需要更多信息，继续调用工具。"
                ),
            ))

        # Budget exhausted or implicit conclusion — extract what we can
        full_raw = "\n\n".join(all_analysis_text) if all_analysis_text else ""

        if not full_raw or len(full_raw) < 200:
            # Output too short — force one more call asking for a proper conclusion
            messages.append(LLMMessage(
                role="user",
                content="请基于已有数据和搜索结果，直接输出完整的最终分析结论。请用 <conclude> 标签包裹。",
            ))
            raw = ""
            _pending_text = ""

            async def _force():
                nonlocal raw, _pending_text
                async for chunk in adapter.chat(messages, stream=True):
                    raw += chunk
                    _pending_text += chunk
                    if on_progress and len(_pending_text) >= _STREAM_CHUNK_SIZE:
                        on_progress({
                            "type": "gate_text",
                            "gate": skill.gate_number,
                            "skill": skill.skill_name,
                            "text": _pending_text,
                        })
                        _pending_text = ""
                if on_progress and _pending_text:
                    on_progress({
                        "type": "gate_text",
                        "gate": skill.gate_number,
                        "skill": skill.skill_name,
                        "text": _pending_text,
                    })

            remaining = budget.timeout_seconds - budget.elapsed_seconds
            try:
                await asyncio.wait_for(_force(), timeout=max(remaining, 10))
            except asyncio.TimeoutError:
                pass

            conclusion = self.tool_parser.parse_conclusion(raw)
            if conclusion:
                full_raw = conclusion.text
            elif raw:
                # Append forced conclusion to accumulated text
                full_raw = (full_raw + "\n\n" + raw).strip() if full_raw else raw

        # β.17: Final-pass orphan citation check — covers implicit-conclusion
        # path that the inline check inside the while loop doesn't reach.
        # If full_raw contains fabricated src IDs, force one corrective rewrite.
        catalog = getattr(self.tool_executor, "_catalog", None)
        if catalog is not None and not _citation_retry_done and full_raw:
            try:
                from uteki.domains.agent.provenance import extract_citations
                valid_ids = {dp.id for dp in catalog}
                ext = extract_citations(full_raw, valid_ids=valid_ids)
                if ext.orphan_ids and valid_ids:
                    max_id = max(valid_ids)
                    sample = ext.orphan_ids[:8]
                    logger.warning(
                        f"[citation] gate {skill.gate_number} {skill.skill_name}: "
                        f"final-pass found {len(ext.orphan_ids)} orphan IDs "
                        f"({sample}{'…' if len(ext.orphan_ids) > 8 else ''}). "
                        f"Forcing rewrite."
                    )
                    if on_progress:
                        on_progress({
                            "type": "tool_warning",
                            "gate": skill.gate_number,
                            "skill": skill.skill_name,
                            "tool_name": "citation_check",
                            "warning": f"输出含 {len(ext.orphan_ids)} 个伪造 src ID，要求重写",
                            "round": budget.rounds_used,
                        })
                    messages.append(LLMMessage(role="assistant", content=full_raw))
                    messages.append(LLMMessage(
                        role="user",
                        content=(
                            f"⚠️ 你的输出引用了 {len(ext.orphan_ids)} 个不存在的 src 编号"
                            f"（如 {sample}）。合法 src ID 范围严格限定为 [1..{max_id}]。\n"
                            f"请基于已有数据来源目录重写完整结论：\n"
                            f"- 删除所有 ID > {max_id} 的引用\n"
                            f"- 没有具体来源支持的判断改用 [src:none]\n"
                            f"- 保留原始分析逻辑和【关键发现】、【核心结论】、【置信度】结构\n"
                            f"输出整段重写后的内容（无需 <conclude> 标签包裹）。"
                        ),
                    ))
                    retry_raw = ""
                    remaining = budget.timeout_seconds - budget.elapsed_seconds
                    try:
                        async def _retry_collect():
                            nonlocal retry_raw
                            async for chunk in adapter.chat(messages, stream=True):
                                retry_raw += chunk
                        await asyncio.wait_for(_retry_collect(), timeout=max(remaining, 30))
                    except asyncio.TimeoutError:
                        logger.warning("[citation] retry timed out")
                        retry_raw = ""

                    if retry_raw:
                        retry_clean = _strip_thinking(retry_raw)
                        retry_ext = extract_citations(retry_clean, valid_ids=valid_ids)
                        if len(retry_ext.orphan_ids) < len(ext.orphan_ids):
                            logger.info(
                                f"[citation] retry improved orphans "
                                f"{len(ext.orphan_ids)} → {len(retry_ext.orphan_ids)}"
                            )
                            full_raw = retry_clean
                    _citation_retry_done = True
            except Exception as e:
                logger.debug(f"[citation] final-pass check failed: {e}")

        latency = int((time.time() - start_time) * 1000)
        # Extract core conclusion from raw if not from conclude tag
        core_conclusion = self._extract_core_conclusion(full_raw)
        key_findings = self._extract_key_findings(full_raw)
        confidence = self._extract_confidence(full_raw)
        eff = round(sum(1 for a in actions if a.result_length > 100) / len(actions), 2) if actions else None

        return GateResult(
            gate_number=skill.gate_number,
            skill_name=skill.skill_name,
            display_name=skill.display_name,
            raw=full_raw,
            core_conclusion=core_conclusion,
            key_findings=key_findings,
            confidence=confidence,
            actions=actions,
            rounds=budget.rounds_used,
            latency_ms=latency,
            parse_status="text",
            tool_efficiency_score=eff,
            tool_warnings=tool_warnings,
        )

    async def _execute_gate7(
        self,
        skill: CompanySkill,
        context: PipelineContext,
        budget: ToolBudget,
        on_progress: Callable | None,
    ) -> GateResult:
        """Gate 7: synthesis — no ReAct, just structured JSON output."""
        start_time = time.time()

        # Gate 7 max_tokens: model-specific limits
        model_name = self.model_config.get("model", "")
        gate7_tokens = 16384  # default high — Gate 7 JSON is large, never truncate
        if "claude-haiku" in model_name:
            gate7_tokens = 8192  # Haiku has lower practical limit
        adapter = self._get_adapter(max_tokens=gate7_tokens, json_mode=True)

        cross_gate_context = context.get_context_for_gate(7)
        user_msg = self._build_gate7_user_message(skill, context, cross_gate_context)

        messages = [
            LLMMessage(role="system", content=skill.system_prompt),
            LLMMessage(role="user", content=user_msg),
        ]

        raw = ""
        _pending_text = ""

        async def _collect():
            nonlocal raw, _pending_text
            async for chunk in adapter.chat(messages, stream=True):
                raw += chunk
                _pending_text += chunk
                if on_progress and len(_pending_text) >= _STREAM_CHUNK_SIZE:
                    on_progress({
                        "type": "gate_text",
                        "gate": 7,
                        "skill": skill.skill_name,
                        "text": _pending_text,
                    })
                    _pending_text = ""
            if on_progress and _pending_text:
                on_progress({
                    "type": "gate_text",
                    "gate": 7,
                    "skill": skill.skill_name,
                    "text": _pending_text,
                })

        await asyncio.wait_for(_collect(), timeout=budget.timeout_seconds)

        parsed, parse_status = parse_skill_output(raw, CompanyFullReport)

        # JSON repair fallback: if primary parse failed, try fast model to fix JSON
        if parse_status == "raw_only" and raw.strip():
            logger.warning("[gate7] primary parse failed, attempting JSON repair")
            try:
                repaired_raw = await self._repair_json(raw)
                if repaired_raw:
                    parsed, parse_status = parse_skill_output(repaired_raw, CompanyFullReport)
                    if parse_status != "raw_only":
                        raw = repaired_raw
                        logger.info("[gate7] JSON repair succeeded")
            except Exception as e:
                logger.warning(f"[gate7] JSON repair failed: {e}")

        # Quality check + retry: even if JSON parsed, verify content completeness
        if parse_status != "raw_only" and parsed:
            quality_ok, issues = _check_gate7_quality(parsed.model_dump())
            if not quality_ok:
                logger.warning(f"[gate7] quality check failed ({len(issues)} issues): {issues}")
                remaining_timeout = max(
                    GATE_TIMEOUT_GATE7 - int(time.time() - start_time), 60
                )
                retry_raw = await self._gate7_quality_retry(
                    skill, context, user_msg, issues, remaining_timeout, on_progress
                )
                if retry_raw:
                    retry_parsed, retry_status = parse_skill_output(retry_raw, CompanyFullReport)
                    if retry_status != "raw_only" and retry_parsed:
                        retry_ok, retry_issues = _check_gate7_quality(retry_parsed.model_dump())
                        if retry_ok or len(retry_issues) < len(issues):
                            logger.info(
                                f"[gate7] quality retry improved: {len(issues)} → {len(retry_issues)} issues"
                            )
                            raw, parsed, parse_status = retry_raw, retry_parsed, retry_status
                        else:
                            logger.warning("[gate7] quality retry did not improve, keeping original")
                    else:
                        logger.warning("[gate7] quality retry parse failed, keeping original")

        latency = int((time.time() - start_time) * 1000)

        return GateResult(
            gate_number=7,
            skill_name=skill.skill_name,
            display_name=skill.display_name,
            raw=raw,
            core_conclusion=None,
            rounds=1,
            latency_ms=latency,
            parse_status=parse_status,
        )

    def _build_user_message(self, skill: CompanySkill, context: PipelineContext) -> str:
        """Build user message for gates 1-6."""
        parts = [
            f"请对以下公司进行【{skill.display_name}】分析。\n",
            "以下是这家公司的财务数据和业务信息：\n",
            "【重要提示】标记为 [数据缺失] 的部分表示无法获取，请基于已有数据分析，"
            "明确标注哪些结论缺乏数据支持。不要对缺失数据进行猜测或编造。\n",
            context.company_data_text,
        ]

        # Provenance: include catalog index (yfinance pre-seed + accumulated tool hits)
        catalog_block = self._render_catalog_for_prompt(context)
        if catalog_block:
            parts.append(catalog_block)

        cross_gate = context.get_context_for_gate(skill.gate_number)
        if cross_gate:
            parts.append("\n\n══ 前序分析结论（请在此基础上深化而非重复）══")
            parts.append(cross_gate)

        return "\n".join(parts)

    def _build_gate7_user_message(
        self, skill: CompanySkill, context: PipelineContext, cross_gate_context: str,
    ) -> str:
        """Build user message for Gate 7."""
        parts = [
            f"请对以下公司进行【{skill.display_name}】。\n",
            "以下是这家公司的财务数据和业务信息：\n",
            "【重要提示】标记为 [数据缺失] 的部分表示无法获取，请基于已有数据分析，"
            "明确标注哪些结论缺乏数据支持。不要对缺失数据进行猜测或编造。\n",
            context.company_data_text,
        ]
        catalog_block = self._render_catalog_for_prompt(context)
        if catalog_block:
            parts.append(catalog_block)
        parts.append("\n\n")
        parts.append(cross_gate_context)
        return "\n".join(parts)

    def _render_catalog_for_prompt(self, context: PipelineContext) -> str:
        """Render a compact source catalog summary for the LLM prompt.

        Goal: let the model know which claims it can support with [src:N]
        markers. Keeps the listing short — only catalog ids + key + value.
        Tool results in tool_result themselves include richer text per hit.

        β.13/β.14 mitigations:
        - Prefix the block with the explicit valid id range "[1..N]" so the
          model has a hard upper bound to clamp against (prevents the
          "increment past max" fabrication seen in GOOGL/claude β).
        - Truncate excerpts to 80 chars (down from 120) to reduce token
          weight as the catalog grows.
        - Add a hard rule reminder right next to the listing.
        """
        try:
            cat = context.catalog
        except Exception:
            return ""
        n = len(cat)
        if n == 0:
            return ""
        block = cat.to_llm_block(max_excerpt=80)
        if not block:
            return ""
        return (
            f"\n\n══ 数据来源目录（合法 src ID 范围: [1..{n}]）══\n"
            "请在你的【关键发现】每条末尾用 [src:N] 引用支持来源。\n"
            f"⚠️ src ID 必须 ≥1 且 ≤{n}，**不允许**编造任何超出此范围的编号。\n"
            "⚠️ 不允许在 [src:...] 中使用未在下方目录列出的 ID。\n"
            "无来源支持的纯推理用 [src:none] 标注。\n\n"
            f"{block}\n"
            "══════════════════════════════════════════════════"
        )

    # ── Extraction helpers ────────────────────────────────────────────────

    _CORE_CONCLUSION_RE = re.compile(
        r'【核心结论】[*\s]*\n?(.*?)(?:\n\n|\n【|\Z)', re.DOTALL
    )
    _KEY_FINDINGS_RE = re.compile(
        r'【关键发现】[*\s]*\n?(.*?)(?:\n\n|\n【|\Z)', re.DOTALL
    )
    _CONFIDENCE_RE = re.compile(
        r'【置信度】[*\s]*\n?\s*([\d.]+)', re.DOTALL
    )

    async def _gate7_quality_retry(
        self,
        skill: CompanySkill,
        context: PipelineContext,
        user_msg: str,
        issues: list[str],
        timeout: int,
        on_progress: Callable | None,
    ) -> str | None:
        """Retry Gate 7 once with targeted correction prompts for specific quality issues."""
        model_name = self.model_config.get("model", "")
        gate7_tokens = 16384 if ("claude" in model_name or "gpt-4" in model_name) else 8192
        adapter = self._get_adapter(max_tokens=gate7_tokens, json_mode=True)

        issues_text = "\n".join(f"  - {issue}" for issue in issues)
        correction_note = (
            f"\n\n【质量修正要求】上一次输出存在以下问题，本次必须修正：\n{issues_text}\n"
            "请重新生成完整的 JSON，确保以上所有问题都得到修正。"
            "特别注意：fisher_qa.questions 必须包含 Q1 到 Q15 完整15题，每题需有实质性答案。"
        )

        messages = [
            LLMMessage(role="system", content=skill.system_prompt),
            LLMMessage(role="user", content=user_msg + correction_note),
        ]

        retry_raw = ""
        _pending = ""

        async def _collect_retry():
            nonlocal retry_raw, _pending
            async for chunk in adapter.chat(messages, stream=True):
                retry_raw += chunk
                _pending += chunk
                if on_progress and len(_pending) >= _STREAM_CHUNK_SIZE:
                    on_progress({
                        "type": "gate_text",
                        "gate": 7,
                        "skill": skill.skill_name,
                        "text": _pending,
                    })
                    _pending = ""
            if on_progress and _pending:
                on_progress({
                    "type": "gate_text",
                    "gate": 7,
                    "skill": skill.skill_name,
                    "text": _pending,
                })

        try:
            await asyncio.wait_for(_collect_retry(), timeout=timeout)
            return retry_raw if retry_raw.strip() else None
        except asyncio.TimeoutError:
            logger.warning("[gate7] quality retry timed out")
            return None
        except Exception as e:
            logger.warning(f"[gate7] quality retry error: {e}")
            return None

    async def _repair_json(self, broken_json: str) -> str | None:
        """Use a fast/cheap model to repair malformed JSON from Gate 7.

        Reuses the same api_key/base_url already resolved for this pipeline run
        (which is user-scoped via _resolve_model upstream).
        """
        try:
            from openai import AsyncOpenAI
            aihub_key = self.model_config.get("api_key")
            aihub_url = self.model_config.get("base_url") or "https://aihubmix.com/v1"
            if not aihub_key:
                return None

            # Truncate if extremely long, keep enough for repair
            text = broken_json[:12000]
            prompt = (
                "以下是一段损坏的 JSON 输出（可能包含多余文字、截断、或格式错误）。\n"
                "请修复它，输出一个合法的 JSON 对象。只输出 JSON，不要加任何解释。\n\n"
                f"{text}"
            )

            client = AsyncOpenAI(api_key=aihub_key, base_url=aihub_url)
            resp = await asyncio.wait_for(
                client.chat.completions.create(
                    model="gpt-4.1-nano",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=8000,
                    temperature=0,
                    response_format={"type": "json_object"},
                ),
                timeout=30,
            )
            return resp.choices[0].message.content
        except Exception as e:
            logger.warning(f"[gate7] _repair_json error: {e}")
            return None

    def _extract_core_conclusion(self, raw: str) -> str | None:
        m = self._CORE_CONCLUSION_RE.search(raw)
        return m.group(1).strip() if m else None

    def _extract_key_findings(self, raw: str) -> list[str]:
        m = self._KEY_FINDINGS_RE.search(raw)
        if not m:
            return []
        return [
            line.lstrip("- ").strip()
            for line in m.group(1).strip().split("\n")
            if line.strip() and line.strip() != "-"
        ]

    def _extract_confidence(self, raw: str) -> float | None:
        m = self._CONFIDENCE_RE.search(raw)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                pass
        return None


# ── Pipeline Orchestrator ─────────────────────────────────────────────────

class PipelineOrchestrator:
    """Manages the 7-gate pipeline execution with reflection checkpoints.

    Responsibilities:
    1. Execute gates sequentially via GateExecutor
    2. Manage cross-gate context (PipelineContext)
    3. Trigger reflection at checkpoints (after Gate 3, after Gate 5)
    4. Build backward-compatible output format
    """

    def __init__(
        self,
        gate_executor: GateExecutor,
        context: PipelineContext,
        on_progress: Callable[[dict], Any] | None = None,
        model_config: dict | None = None,
        prompt_overrides: dict[int, str] | None = None,
    ):
        self.gate_executor = gate_executor
        self.context = context
        self.on_progress = on_progress
        self.model_config = model_config or {}
        self.prompt_overrides = prompt_overrides or {}

    def _emit(self, event: dict):
        if self.on_progress:
            try:
                self.on_progress(event)
            except Exception as e:
                logger.warning(f"[orchestrator] progress emit error: {e}")

    async def _get_gate_cache_key(self, skill: CompanySkill) -> str | None:
        """Build a cache key for a gate result. None if caching disabled."""
        symbol = self.context.symbol
        if not symbol:
            return None  # no symbol → skip caching to avoid cross-contamination
        import hashlib
        prompt_hash = hashlib.md5(
            skill.system_prompt[:200].encode()
        ).hexdigest()[:8]
        model = self.model_config.get("model", "unknown")
        return f"company:gate:{symbol}:{model}:{skill.gate_number}:{prompt_hash}"

    async def run(self) -> dict:
        """Execute the full 7-gate pipeline."""
        results: dict[str, Any] = {}
        all_tool_calls: list[dict] = []
        total_start = time.time()

        # Gate cache service (optional, non-blocking)
        try:
            from uteki.common.cache import get_cache_service
            cache = get_cache_service()
        except Exception:
            cache = None

        for skill in COMPANY_SKILL_PIPELINE:
            # Apply prompt override if provided (for A/B testing)
            if skill.gate_number in self.prompt_overrides:
                from dataclasses import replace
                skill = replace(
                    skill,
                    system_prompt=self.prompt_overrides[skill.gate_number],
                )

            logger.info(
                f"[orchestrator] gate={skill.gate_number} skill={skill.skill_name} "
                f"model={self.model_config.get('model', '?')}"
            )

            # Emit gate_start
            self._emit({
                "type": "gate_start",
                "gate": skill.gate_number,
                "skill": skill.skill_name,
                "display_name": skill.display_name,
                "has_tools": bool(skill.tools),
            })

            # Build budget for this gate
            if skill.gate_number == 7:
                budget = ToolBudget(
                    max_searches=0, max_rounds=1, max_tool_calls=0,
                    timeout_seconds=GATE_TIMEOUT_GATE7,
                )
            else:
                budget = ToolBudget(
                    max_searches=6, max_rounds=5, max_tool_calls=10,
                    timeout_seconds=GATE_TIMEOUT,
                )

            # Check gate cache (gates 1-6 only, skip Gate 7 which synthesizes)
            cached_result = None
            cache_key = None
            if cache and skill.gate_number < 7:
                try:
                    cache_key = await self._get_gate_cache_key(skill)
                    cached_result = await cache.get(cache_key)
                except Exception:
                    pass

            if cached_result:
                logger.info(f"[orchestrator] gate={skill.gate_number} CACHE HIT")
                gate_result = GateResult(
                    gate_number=skill.gate_number,
                    skill_name=skill.skill_name,
                    display_name=skill.display_name,
                    raw=cached_result.get("raw", ""),
                    core_conclusion=cached_result.get("core_conclusion"),
                    parse_status="cached",
                    latency_ms=0,
                )
            else:
                pass  # fall through to execute

            # Execute gate (if not cached)
            if not cached_result:
                try:
                    gate_result = await self.gate_executor.execute(
                        skill, self.context, budget, self.on_progress,
                    )
                    # Cache successful gate results (gates 1-6, 24h TTL)
                    if cache and cache_key and skill.gate_number < 7 and not gate_result.error:
                        try:
                            await cache.set(cache_key, {
                                "raw": gate_result.raw,
                                "core_conclusion": gate_result.core_conclusion,
                            }, ttl=86400)
                        except Exception:
                            pass
                except asyncio.TimeoutError:
                    timeout = GATE_TIMEOUT_GATE7 if skill.gate_number == 7 else GATE_TIMEOUT
                    logger.error(f"[orchestrator] TIMEOUT: {skill.skill_name} after {timeout}s")
                    gate_result = GateResult(
                        gate_number=skill.gate_number,
                        skill_name=skill.skill_name,
                        display_name=skill.display_name,
                        raw="",
                        parse_status="timeout",
                        error=f"timeout after {timeout}s",
                    )
                except Exception as e:
                    logger.error(f"[orchestrator] ERROR: {skill.skill_name}: {e}", exc_info=True)
                    gate_result = GateResult(
                        gate_number=skill.gate_number,
                        skill_name=skill.skill_name,
                        display_name=skill.display_name,
                        raw="",
                        parse_status="error",
                        error=str(e),
                    )

            # Add to context
            self.context.add_gate_result(gate_result)

            # ── Per-gate structuring ──
            parsed = None
            parse_status = gate_result.parse_status
            if skill.gate_number == 7 and gate_result.raw:
                parsed, parse_status = parse_skill_output(gate_result.raw, CompanyFullReport)
            elif skill.skill_name in _GATE_SCHEMAS and gate_result.raw and not gate_result.error:
                # Fire-and-forget async structuring (non-blocking)
                _skill_name = skill.skill_name
                _gate_num = skill.gate_number
                _raw = gate_result.raw

                async def _async_structurize(sn=_skill_name, gn=_gate_num, raw=_raw):
                    try:
                        p, ps = await self._structurize_gate(sn, raw)
                        if p:
                            pd = p.model_dump()
                            results[sn]["parsed"] = pd
                            results[sn]["parse_status"] = ps
                            self._emit({
                                "type": "gate_structured",
                                "gate": gn,
                                "skill": sn,
                                "parsed": pd,
                                "parse_status": ps,
                            })
                    except Exception as e:
                        logger.warning(f"[orchestrator] async structurize {sn} failed: {e}")

                asyncio.create_task(_async_structurize())

            parsed_dict = parsed.model_dump() if parsed else {}
            skill_result: dict[str, Any] = {
                "gate": skill.gate_number,
                "display_name": skill.display_name,
                "parsed": parsed_dict,
                "raw": gate_result.raw,
                "parse_status": parse_status,
                "latency_ms": gate_result.latency_ms,
            }
            if gate_result.error:
                skill_result["error"] = gate_result.error

            # Include ReAct metadata
            if gate_result.actions:
                tool_records = []
                for a in gate_result.actions:
                    record = {
                        "skill": skill.skill_name,
                        "round": a.round_num,
                        "tool_name": a.tool_name,
                        "tool_args": a.tool_args,
                        "tool_result": a.result,           # truncated (4000 chars) — fits in JSON
                        "tool_result_full": a.result_full, # full untruncated text — provenance source
                        "result_length": a.result_length,
                    }
                    tool_records.append(record)
                    all_tool_calls.append(record)
                skill_result["tool_calls"] = tool_records

            if gate_result.rounds > 0:
                skill_result["react_rounds"] = gate_result.rounds
            if gate_result.confidence is not None:
                skill_result["confidence"] = gate_result.confidence
            if gate_result.key_findings:
                skill_result["key_findings"] = gate_result.key_findings

            # Provenance: extract citation markers from raw output.
            # When orphan ids (model-fabricated) are detected, scrub them from
            # the stored raw — replace [src:99] with [src:none] so the UI
            # doesn't render misleading red chips, while keeping a count of
            # how many were stripped for audit / quality scoring.
            try:
                from uteki.domains.agent.provenance import CitationParser
                parser = CitationParser(self.context.catalog)
                ext = parser.parse(gate_result.raw or "")
                skill_result["citations"] = sorted(ext.all_cited_ids())
                if ext.orphan_ids:
                    skill_result["citation_orphans"] = ext.orphan_ids
                    logger.warning(
                        f"[citation] {skill.skill_name}: stripped "
                        f"{len(ext.orphan_ids)} orphan src ids from raw output: "
                        f"{ext.orphan_ids[:10]}{'…' if len(ext.orphan_ids) > 10 else ''}"
                    )
                    # Scrub orphans from raw before storing — the citation parser
                    # already counted them, but visible report should be clean.
                    cleaned_raw = ext.cleaned(parser.valid_ids)
                    skill_result["raw"] = cleaned_raw
                if ext.no_source_count > 0:
                    skill_result["citation_no_source"] = ext.no_source_count
            except Exception as e:
                logger.debug(f"[citation] parse failed for {skill.skill_name}: {e}")

            results[skill.skill_name] = skill_result

            # Emit gate_complete
            gate_event: dict[str, Any] = {
                "type": "gate_complete",
                "gate": skill.gate_number,
                "skill": skill.skill_name,
                "display_name": skill.display_name,
                "parse_status": parse_status,
                "latency_ms": gate_result.latency_ms,
                "parsed": parsed_dict,
                "raw": gate_result.raw,
            }
            if gate_result.error:
                gate_event["error"] = gate_result.error
            if gate_result.tool_warnings:
                gate_event["tool_warnings"] = gate_result.tool_warnings
            self._emit(gate_event)

            logger.info(
                f"[orchestrator] gate={skill.gate_number} {skill.skill_name} done "
                f"status={parse_status} rounds={gate_result.rounds} "
                f"tools={len(gate_result.actions)} latency={gate_result.latency_ms}ms"
            )

            # ── Reflection checkpoint ─────────────────────────────────────
            if skill.gate_number in REFLECTION_CHECKPOINTS:
                await self._run_reflection(skill.gate_number)

        total_latency_ms = int((time.time() - total_start) * 1000)

        # ── Post-pipeline: populate gate results from Gate 7 ──────────────
        return self._build_output(results, all_tool_calls, total_latency_ms)

    async def _structurize_gate(self, skill_name: str, raw_text: str):
        """Use a fast/cheap model to extract structured JSON from a gate's raw text."""
        schema_class = _GATE_SCHEMAS.get(skill_name)
        if not schema_class:
            return None, "text"

        # Build schema hint from Pydantic model fields
        schema_fields = {}
        for name, field_info in schema_class.model_fields.items():
            schema_fields[name] = str(field_info.annotation).replace("typing.", "")
        schema_hint = json.dumps(schema_fields, indent=2, ensure_ascii=False)

        prompt = _STRUCTURIZE_PROMPT.format(
            raw_text=raw_text[:3000],  # truncate to save tokens
            schema_hint=schema_hint,
        )

        try:
            from openai import AsyncOpenAI
            # Reuse the resolved (user-scoped) aggregator key from this run.
            aihub_key = self.model_config.get("api_key")
            aihub_url = self.model_config.get("base_url") or "https://aihubmix.com/v1"

            if not aihub_key:
                return None, "text"

            client = AsyncOpenAI(api_key=aihub_key, base_url=aihub_url)
            resp = await asyncio.wait_for(
                client.chat.completions.create(
                    model="gpt-4.1-nano",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=2000,
                    temperature=0,
                ),
                timeout=30,
            )

            result_text = resp.choices[0].message.content or ""
            parsed, status = parse_skill_output(result_text, schema_class)
            if parsed:
                logger.info(f"[orchestrator] structurize {skill_name}: {status}")
                return parsed, status
        except asyncio.TimeoutError:
            logger.warning(f"[orchestrator] structurize {skill_name} timeout")
        except Exception as e:
            logger.warning(f"[orchestrator] structurize {skill_name} error: {e}")

        return None, "text"

    async def _run_reflection(self, after_gate: int):
        """Run a reflection checkpoint."""
        prompt_template = REFLECTION_CHECKPOINTS.get(after_gate)
        if not prompt_template:
            return

        self._emit({
            "type": "reflection_start",
            "after_gate": after_gate,
        })

        # Build gate conclusions for the prompt
        conclusions_parts = []
        for gn in sorted(self.context.gate_results):
            if gn > after_gate:
                break
            r = self.context.gate_results[gn]
            conclusions_parts.append(f"Gate {gn} ({r.display_name}):")
            conclusions_parts.append(f"  核心结论: {r.summary}")
            if r.key_findings:
                conclusions_parts.append(f"  关键发现: {'; '.join(r.key_findings[:5])}")
            if r.confidence is not None:
                conclusions_parts.append(f"  置信度: {r.confidence}/10")
            conclusions_parts.append("")

        prompt = prompt_template.format(gate_conclusions="\n".join(conclusions_parts))

        try:
            adapter = self.gate_executor._get_adapter(max_tokens=2048)
            messages = [
                LLMMessage(role="system", content="你是一名投资分析审计员。请以JSON格式输出。"),
                LLMMessage(role="user", content=prompt),
            ]

            raw = ""
            async for chunk in adapter.chat(messages, stream=False):
                raw += chunk

            # Parse reflection JSON
            reflection = self._parse_reflection(after_gate, raw)
            self.context.add_reflection(reflection)

            self._emit({
                "type": "reflection_complete",
                "after_gate": after_gate,
                "contradictions": reflection.contradictions,
                "downstream_hints": reflection.downstream_hints,
                "has_contradiction": reflection.has_contradiction,
            })

            if reflection.has_contradiction:
                logger.warning(
                    f"[orchestrator] reflection after gate {after_gate} found contradictions: "
                    f"{reflection.contradictions}"
                )

        except Exception as e:
            logger.warning(f"[orchestrator] reflection after gate {after_gate} failed: {e}")
            self._emit({
                "type": "reflection_complete",
                "after_gate": after_gate,
                "contradictions": [],
                "downstream_hints": [],
                "has_contradiction": False,
                "error": str(e),
            })

    def _parse_reflection(self, after_gate: int, raw: str) -> Reflection:
        """Parse reflection JSON output."""
        try:
            # Try to extract JSON from the response
            json_match = re.search(r'\{[\s\S]*\}', raw)
            if json_match:
                data = json.loads(json_match.group(0))
                return Reflection(
                    after_gate=after_gate,
                    contradictions=data.get("contradictions", []),
                    downstream_hints=data.get("downstream_hints", []),
                    needs_revisit=data.get("needs_revisit"),
                    raw=raw,
                )
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"[orchestrator] reflection parse failed: {e}")

        return Reflection(after_gate=after_gate, raw=raw)

    def _build_output(
        self,
        results: dict[str, Any],
        all_tool_calls: list[dict],
        total_latency_ms: int,
    ) -> dict:
        """Build backward-compatible pipeline output."""
        gate7_result = results.get("final_verdict", {})
        gate7_parsed = gate7_result.get("parsed", {})

        # Map Gate 7's structured sections back to each gate's result
        gate_skill_names = [
            "business_analysis", "fisher_qa", "moat_assessment",
            "management_assessment", "reverse_test", "valuation",
        ]
        for skill_name in gate_skill_names:
            gate_data = gate7_parsed.get(skill_name)
            if gate_data and isinstance(gate_data, dict) and skill_name in results:
                results[skill_name]["parsed"] = gate_data
                results[skill_name]["parse_status"] = "structured"

        # Extract verdict
        verdict_dict = gate7_parsed.get("position_holding", {})
        verdict = PositionHoldingOutput(**verdict_dict) if verdict_dict else PositionHoldingOutput()

        if verdict_dict:
            results["final_verdict"]["parsed"] = gate7_parsed

        # Build trace
        trace = []
        for skill in COMPANY_SKILL_PIPELINE:
            r = results.get(skill.skill_name, {})
            entry = {
                "gate": skill.gate_number,
                "skill": skill.skill_name,
                "display_name": skill.display_name,
                "status": r.get("parse_status", "unknown"),
                "latency_ms": r.get("latency_ms", 0),
            }
            if r.get("error"):
                entry["error"] = r["error"]
            if r.get("react_rounds"):
                entry["react_rounds"] = r["react_rounds"]
            if r.get("confidence") is not None:
                entry["confidence"] = r["confidence"]
            trace.append(entry)

        # Provenance: serialize catalog (may be empty for legacy/failure cases)
        try:
            source_catalog = self.context.catalog.to_dict()
        except Exception as e:
            logger.warning(f"[orchestrator] failed to serialize catalog: {e}")
            source_catalog = {}

        return {
            "skills": results,
            "verdict": verdict.model_dump(),
            "total_latency_ms": total_latency_ms,
            "trace": trace,
            "tool_calls": all_tool_calls or None,
            "source_catalog": source_catalog,
            "as_of": self.context.as_of,
        }


# ── Public Interface (backward-compatible) ────────────────────────────────

class CompanySkillRunner:
    """Public API — drop-in replacement for the previous CompanySkillRunner.

    Usage:
        runner = CompanySkillRunner(model_config, company_data, on_progress=emit)
        result = await runner.run_pipeline()

        # With prompt overrides (for A/B testing):
        runner = CompanySkillRunner(model_config, company_data,
                                   prompt_overrides={1: "new gate 1 prompt"})
    """

    def __init__(
        self,
        model_config: dict,
        company_data: dict,
        on_progress: Callable[[dict], Any] | None = None,
        prompt_overrides: dict[int, str] | None = None,
        as_of: str | None = None,
    ):
        self.model_config = model_config
        self.company_data = company_data
        self.on_progress = on_progress
        self.prompt_overrides = prompt_overrides
        self.as_of = as_of

    async def run_pipeline(self) -> dict:
        data_text = format_company_data_for_prompt(self.company_data)
        symbol = self.company_data.get("profile", {}).get("symbol", "")

        # ── Provenance: build catalog and seed authoritative sources ──
        # yfinance gives metric snapshots (no filing date); FMP adds
        # period-anchored statements (with filing date); EDGAR registers
        # the actual SEC filings as canonical landmarks.
        from uteki.domains.agent.provenance.catalog import SourceCatalog
        from uteki.domains.agent.provenance.fetchers import (
            seed_from_company_data,
            seed_from_fmp,
            seed_from_edgar,
        )
        catalog = SourceCatalog(as_of=self.as_of)
        try:
            yf_seeded = seed_from_company_data(catalog, self.company_data, as_of=self.as_of)
            logger.info(f"[runner] seeded {len(yf_seeded)} yfinance DataPoints")
        except Exception as e:
            logger.warning(f"[runner] yfinance seed failed: {e}")
        try:
            fmp_seeded = await seed_from_fmp(catalog, symbol, as_of=self.as_of)
            logger.info(f"[runner] seeded {len(fmp_seeded)} FMP DataPoints")
        except Exception as e:
            logger.warning(f"[runner] FMP seed failed: {e}")
        try:
            edgar_seeded = await seed_from_edgar(catalog, symbol, as_of=self.as_of)
            logger.info(f"[runner] seeded {len(edgar_seeded)} SEC EDGAR DataPoints")
        except Exception as e:
            logger.warning(f"[runner] EDGAR seed failed: {e}")

        context = PipelineContext(
            company_data_text=data_text,
            symbol=symbol,
            catalog=catalog,
            as_of=self.as_of,
        )

        # Pass catalog to tool executor so search hits become DataPoints with [src:N] markers
        tool_executor = CompanyToolExecutor(
            company_data=self.company_data,
            catalog=catalog,
        )
        tool_parser = ToolCallParser()
        gate_executor = GateExecutor(self.model_config, tool_executor, tool_parser)

        orchestrator = PipelineOrchestrator(
            gate_executor=gate_executor,
            context=context,
            on_progress=self.on_progress,
            model_config=self.model_config,
            prompt_overrides=self.prompt_overrides,
        )

        return await orchestrator.run()
