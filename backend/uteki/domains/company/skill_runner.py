"""
Company Investment Analysis — 7-Gate Decision Tree Pipeline

Architecture:
- Gates 1-6: 自然语言分析（无 JSON 约束，质量优先）
- Gate 7:    读取全部 6 份分析报告 → 投资裁决 + 全量结构化 JSON

Supports:
- Tool-use loop (web_search) for gates 2-6
- on_progress callback for SSE streaming
- Progressive context accumulation between gates
"""
from __future__ import annotations
import asyncio
import json
import logging
import re
import time
from typing import Any, Callable, Dict, List, Optional

from uteki.domains.agent.llm_adapter import (
    LLMAdapterFactory, LLMProvider, LLMConfig, LLMMessage,
)
from uteki.common.config import settings
from .skills import COMPANY_SKILL_PIPELINE, CompanySkill
from .schemas import CompanyFullReport, PositionHoldingOutput
from .output_parser import parse_skill_output
from .financials import format_company_data_for_prompt

logger = logging.getLogger(__name__)

SKILL_TIMEOUT = 120       # seconds per skill (including tool rounds)
SKILL_TIMEOUT_GATE7 = 300  # Gate 7 reads all 6 reports + generates structured JSON
MAX_TOOL_ROUNDS = 3   # max tool-use cycles per skill
TOOL_TIMEOUT = 15     # seconds per tool execution

# ── Provider Map ───────────────────────────────────────────────────────────

_PROVIDER_MAP = {
    "anthropic": LLMProvider.ANTHROPIC,
    "openai":    LLMProvider.OPENAI,
    "deepseek":  LLMProvider.DEEPSEEK,
    "google":    LLMProvider.GOOGLE,
    "qwen":      LLMProvider.QWEN,
    "minimax":   LLMProvider.MINIMAX,
    "doubao":    LLMProvider.DOUBAO,
}


# ── Tool Executor ──────────────────────────────────────────────────────────

class CompanyToolExecutor:
    """Executes tools available to the company analysis pipeline."""

    def __init__(self):
        self._web_search = None

    def _get_web_search(self):
        if self._web_search is None:
            from uteki.domains.agent.research.web_search import get_web_search_service
            self._web_search = get_web_search_service()
        return self._web_search

    async def execute(self, tool_name: str, args: dict) -> str:
        if tool_name == "web_search":
            query = args.get("query", "")
            if not query:
                return "Error: empty search query"
            try:
                svc = self._get_web_search()
                if not svc.available:
                    return "Error: web search service not configured (missing API keys)"
                results = await asyncio.wait_for(
                    svc.search(query, max_results=5),
                    timeout=TOOL_TIMEOUT,
                )
                if not results:
                    return f"No results found for: {query}"
                lines = []
                for r in results:
                    lines.append(f"- {r['title']}: {r['snippet']} ({r['url']})")
                return "\n".join(lines)
            except asyncio.TimeoutError:
                return f"Error: search timeout for: {query}"
            except Exception as e:
                logger.warning(f"[company_tools] web_search failed: {e}")
                return f"Error: search failed: {e}"
        return f"Error: unknown tool '{tool_name}'"


# ── Tool Call Parser ───────────────────────────────────────────────────────

def _parse_tool_call(text: str) -> Optional[Dict[str, Any]]:
    """Parse tool call from model output.

    Handles many formats models use:
    - <tool_call>{"name":"...", "arguments":{...}}</tool_call>  (JSON inside XML)
    - <tool_call><name>...</name><arguments><query>...</query></arguments></tool_call>  (full XML)
    - <tool_call><name>...</name><query>...</query></tool_call>  (XML, no <arguments> wrapper)
    - <tool_call><name>...</name><arguments><query>...</query></tool_call>  (unclosed <arguments>)
    - ```tool_call\n{...}\n```  (markdown code block)
    """
    # Find <tool_call>...</tool_call> block
    m = re.search(r'<tool_call>(.*?)</tool_call>', text, re.DOTALL)
    if m:
        inner = m.group(1).strip()

        # Try JSON body first
        try:
            return json.loads(inner)
        except (json.JSONDecodeError, ValueError):
            pass

        # XML elements — extract <name> and all other elements as arguments
        name_m = re.search(r'<name>(.*?)</name>', inner)
        if name_m:
            name = name_m.group(1).strip()
            args: Dict[str, Any] = {}
            # Check for JSON inside <arguments>
            args_json_m = re.search(r'<arguments>\s*(\{.*?\})\s*', inner, re.DOTALL)
            if args_json_m:
                try:
                    args = json.loads(args_json_m.group(1))
                except (json.JSONDecodeError, ValueError):
                    pass
            # Fallback: find XML value elements inside <arguments> or entire block
            if not args:
                # If <arguments> wrapper exists, search inside it; otherwise search entire block
                args_wrapper = re.search(r'<arguments>(.*?)(?:</arguments>|$)', inner, re.DOTALL)
                search_text = args_wrapper.group(1) if args_wrapper else inner
                skip_tags = {'name', 'arguments', 'tool_call'}
                for arg_m in re.finditer(r'<(\w+)>(.*?)</\1>', search_text, re.DOTALL):
                    tag = arg_m.group(1)
                    if tag not in skip_tags:
                        args[tag] = arg_m.group(2).strip()
            if name:
                return {"name": name, "arguments": args}

    # Code block ```tool_call\n...\n```
    m = re.search(r'```tool_call\s*\n(\{.*?\})\s*\n```', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # JSON with tool_call key
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "tool_call" in parsed:
            return parsed["tool_call"]
    except (json.JSONDecodeError, ValueError):
        pass

    return None


# ── Skill Runner ───────────────────────────────────────────────────────────

class CompanySkillRunner:
    def __init__(
        self,
        model_config: dict,
        company_data: dict,
        on_progress: Optional[Callable[[dict], Any]] = None,
    ):
        self.model_config = model_config
        self.company_data = company_data
        self.on_progress = on_progress
        self._adapter = None
        self._data_context = format_company_data_for_prompt(company_data)
        self._tool_executor = CompanyToolExecutor()

    def _emit(self, event: dict):
        if self.on_progress:
            try:
                self.on_progress(event)
            except Exception as e:
                logger.warning(f"[company_pipeline] progress emit error: {e}")

    def _get_adapter(self):
        if self._adapter is None:
            provider_name = self.model_config["provider"]
            provider = _PROVIDER_MAP.get(provider_name)
            if not provider:
                raise ValueError(f"Unsupported provider: {provider_name}")

            base_url = self.model_config.get("base_url")
            if provider_name == "google" and not base_url:
                base_url = getattr(settings, "google_api_base_url", None)

            self._adapter = LLMAdapterFactory.create_adapter(
                provider=provider,
                api_key=self.model_config["api_key"],
                model=self.model_config["model"],
                config=LLMConfig(temperature=0, max_tokens=8192),
                base_url=base_url,
            )
        return self._adapter

    def _build_user_message(self, skill: CompanySkill, accumulated: list[dict]) -> str:
        """Build user message with data context + progressive context from prior gates.

        - Gates 1-6: data context + brief summaries from prior gates
        - Gate 7:    data context + FULL raw text from all 6 prior gates
        """
        parts = [
            f"请对以下公司进行【{skill.display_name}】分析。\n",
            "以下是这家公司的财务数据和业务信息：\n",
            "【重要提示】标记为 [数据缺失] 的部分表示无法获取，请基于已有数据分析，"
            "明确标注哪些结论缺乏数据支持。不要对缺失数据进行猜测或编造。\n",
            self._data_context,
        ]

        if accumulated:
            if skill.gate_number == 7:
                # Gate 7: full raw text from all 6 prior analyses
                parts.append("\n\n══════════════════════════════════════════")
                parts.append("以下是6位分析师的完整研究报告，请仔细阅读后进行结构化：")
                parts.append("══════════════════════════════════════════")
                for prev in accumulated:
                    parts.append(f"\n\n───── Gate {prev['gate']}: {prev['display_name']} ─────")
                    parts.append(prev.get("raw", "(no output)"))
            else:
                # Gates 2-6: brief summaries from prior gates
                parts.append("\n\n══ 前序分析结论（请在此基础上深化而非重复）══")
                for prev in accumulated:
                    parts.append(f"\n【Gate {prev['gate']}: {prev['display_name']}】")
                    summary = prev.get("summary", "")
                    parts.append(f"结论: {summary}")

        return "\n".join(parts)

    async def _execute_skill_with_tools(
        self,
        skill: CompanySkill,
        messages: list[LLMMessage],
        is_anthropic_json: bool = False,
    ) -> tuple[str, list[dict]]:
        """Execute a single skill, supporting tool-use loop.

        is_anthropic_json: True only for Gate 7 with Anthropic provider (JSON prefill).

        Returns: (final_output_text, tool_calls_record)
        """
        adapter = self._get_adapter()
        has_tools = bool(skill.tools)
        tool_calls_record: list[dict] = []
        # Track whether the first round used Anthropic prefill
        first_round_prefilled = (
            is_anthropic_json
            and len(messages) > 0
            and messages[-1].role == "assistant"
            and messages[-1].content == "{"
        )

        # Buffering threshold for gate_text streaming events
        _STREAM_CHUNK_SIZE = 80

        for round_num in range(MAX_TOOL_ROUNDS + 1):
            raw = ""
            _pending_text = ""  # buffer for gate_text emission

            async def _collect():
                nonlocal raw, _pending_text
                async for chunk in adapter.chat(messages, stream=True):
                    raw += chunk
                    _pending_text += chunk
                    if len(_pending_text) >= _STREAM_CHUNK_SIZE:
                        self._emit({
                            "type": "gate_text",
                            "gate": skill.gate_number,
                            "skill": skill.skill_name,
                            "text": _pending_text,
                        })
                        _pending_text = ""
                # Flush remaining buffer
                if _pending_text:
                    self._emit({
                        "type": "gate_text",
                        "gate": skill.gate_number,
                        "skill": skill.skill_name,
                        "text": _pending_text,
                    })
                    _pending_text = ""

            skill_timeout = SKILL_TIMEOUT_GATE7 if skill.gate_number == 7 else SKILL_TIMEOUT
            await asyncio.wait_for(_collect(), timeout=skill_timeout)

            # Restore prefilled "{" only on first round
            if round_num == 0 and first_round_prefilled and raw and not raw.strip().startswith("{"):
                raw = "{" + raw

            # If no tools or last round, return the output
            if not has_tools or round_num >= MAX_TOOL_ROUNDS:
                return raw, tool_calls_record

            # Check for tool call in output
            tool_call = _parse_tool_call(raw)
            if not tool_call:
                # No tool call found — model gave final answer
                return raw, tool_calls_record

            tool_name = tool_call.get("name", "")
            tool_args = tool_call.get("arguments", {})
            logger.info(
                f"[company_pipeline] {skill.skill_name} round {round_num + 1}: "
                f"{tool_name}({tool_args})"
            )

            # Emit tool_call event
            self._emit({
                "type": "tool_call",
                "gate": skill.gate_number,
                "skill": skill.skill_name,
                "tool_name": tool_name,
                "tool_args": tool_args,
                "round": round_num + 1,
            })

            # Execute tool
            tool_result = await self._tool_executor.execute(tool_name, tool_args)

            tool_calls_record.append({
                "skill": skill.skill_name,
                "round": round_num + 1,
                "tool_name": tool_name,
                "tool_args": tool_args,
                "tool_result": tool_result[:500],
            })

            # Remove the prefill assistant message before appending real conversation
            if round_num == 0 and first_round_prefilled:
                messages.pop()  # remove prefill "{"

            # Append assistant output + tool result to conversation
            messages.append(LLMMessage(role="assistant", content=raw))
            messages.append(LLMMessage(
                role="user",
                content=f"工具 {tool_name} 的执行结果:\n{tool_result}\n\n"
                        f"请基于此结果继续分析。如果信息充分，请直接输出最终分析结果。",
            ))

            # Reset raw for next round
            raw = ""

        return raw, tool_calls_record

    async def run_pipeline(self) -> dict:
        accumulated: list[dict] = []
        results: dict[str, Any] = {}
        all_tool_calls: list[dict] = []
        total_start = time.time()

        for skill in COMPANY_SKILL_PIPELINE:
            skill_start = time.time()
            logger.info(
                f"[company_pipeline] gate={skill.gate_number} skill={skill.skill_name} "
                f"model={self.model_config['model']}"
            )

            # Emit gate_start
            self._emit({
                "type": "gate_start",
                "gate": skill.gate_number,
                "skill": skill.skill_name,
                "display_name": skill.display_name,
                "has_tools": bool(skill.tools),
            })

            raw = ""
            tool_calls: list[dict] = []
            error_detail: Optional[str] = None

            try:
                user_message = self._build_user_message(skill, accumulated)
                is_anthropic = self.model_config.get("provider") == "anthropic"

                messages = [
                    LLMMessage(role="system", content=skill.system_prompt),
                    LLMMessage(role="user", content=user_message),
                ]

                # Anthropic prefill trick: only for Gate 7 (JSON output)
                is_anthropic_json = is_anthropic and skill.gate_number == 7
                if is_anthropic_json:
                    messages.append(LLMMessage(role="assistant", content="{"))

                raw, tool_calls = await self._execute_skill_with_tools(
                    skill, messages, is_anthropic_json=is_anthropic_json,
                )

                if tool_calls:
                    all_tool_calls.extend(tool_calls)

                # Gate 7: parse comprehensive JSON with CompanyFullReport
                if skill.gate_number == 7:
                    parsed, parse_status = parse_skill_output(raw, CompanyFullReport)
                else:
                    # Gates 1-6: natural language, no JSON parsing
                    parsed = None
                    parse_status = "text"

            except asyncio.TimeoutError:
                actual_timeout = SKILL_TIMEOUT_GATE7 if skill.gate_number == 7 else SKILL_TIMEOUT
                logger.error(f"[company_pipeline] TIMEOUT: {skill.skill_name} after {actual_timeout}s")
                parsed, parse_status = None, "timeout"
                error_detail = f"timeout after {actual_timeout}s"
            except Exception as e:
                logger.error(f"[company_pipeline] ERROR: {skill.skill_name}: {e}", exc_info=True)
                parsed, parse_status = None, "error"
                error_detail = str(e)

            latency_ms = int((time.time() - skill_start) * 1000)
            parsed_dict = parsed.model_dump() if parsed else {}

            skill_result: dict[str, Any] = {
                "gate": skill.gate_number,
                "display_name": skill.display_name,
                "parsed": parsed_dict,
                "raw": raw,
                "parse_status": parse_status,
                "latency_ms": latency_ms,
            }
            if error_detail:
                skill_result["error"] = error_detail
            if tool_calls:
                skill_result["tool_calls"] = tool_calls
            results[skill.skill_name] = skill_result

            # Accumulate context for next gates
            summary = raw[:400] if raw else "(no output)"
            accumulated.append({
                "gate": skill.gate_number,
                "skill": skill.skill_name,
                "display_name": skill.display_name,
                "raw": raw,        # full text for Gate 7
                "summary": summary, # brief for Gates 2-6
            })

            # Emit gate_complete — include raw text for all gates
            gate_event: dict[str, Any] = {
                "type": "gate_complete",
                "gate": skill.gate_number,
                "skill": skill.skill_name,
                "display_name": skill.display_name,
                "parse_status": parse_status,
                "latency_ms": latency_ms,
                "parsed": parsed_dict,
                "raw": raw,
            }
            if error_detail:
                gate_event["error"] = error_detail
            self._emit(gate_event)

            logger.info(
                f"[company_pipeline] gate={skill.gate_number} {skill.skill_name} done "
                f"status={parse_status} latency={latency_ms}ms"
            )

        total_latency_ms = int((time.time() - total_start) * 1000)

        # ── Post-pipeline: populate all gate results from Gate 7's structured output ──
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

        # Extract verdict from Gate 7's position_holding section
        verdict_dict = gate7_parsed.get("position_holding", {})
        verdict = PositionHoldingOutput(**verdict_dict) if verdict_dict else PositionHoldingOutput()

        # Also put position_holding parsed data into the final_verdict result
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
            trace.append(entry)

        return {
            "skills": results,
            "verdict": verdict.model_dump(),
            "total_latency_ms": total_latency_ms,
            "trace": trace,
            "tool_calls": all_tool_calls or None,
        }
