"""
ToolCallParser — unified tool-call extraction from LLM output.

Supports multiple formats that different LLM providers emit:
1. <tool_call>{"name":"...", "arguments":{...}}</tool_call>  (JSON in XML)
2. <tool_call><name>...</name><arguments>...</arguments></tool_call>  (full XML)
3. ```tool_call\n{...}\n```  (markdown code block)
4. {"tool_call": {...}}  (JSON wrapper)

Also detects <conclude> tags for ReAct loop termination.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ParsedToolCall:
    name: str
    arguments: dict


@dataclass
class ParsedConclusion:
    """Extracted when agent decides to stop researching."""
    text: str
    core_conclusion: Optional[str] = None
    key_findings: list[str] | None = None
    confidence: float | None = None


class ToolCallParser:
    """Stateless parser for tool calls and conclusions from LLM output."""

    # ── Conclusion detection ─────────────────────────────────────────────

    _CONCLUDE_RE = re.compile(
        r'<conclude>(.*?)</conclude>', re.DOTALL
    )
    _CORE_CONCLUSION_RE = re.compile(
        r'【核心结论】[*\s]*\n?(.*?)(?:\n\n|\n【|\Z)', re.DOTALL
    )
    _KEY_FINDINGS_RE = re.compile(
        r'【关键发现】[*\s]*\n?(.*?)(?:\n\n|\n【|\n</conclude>|\Z)', re.DOTALL
    )
    _CONFIDENCE_RE = re.compile(
        r'【置信度】[*\s]*\n?\s*([\d.]+)', re.DOTALL
    )

    def parse_conclusion(self, text: str) -> Optional[ParsedConclusion]:
        """Check if the LLM output contains a <conclude> block."""
        m = self._CONCLUDE_RE.search(text)
        if not m:
            return None

        body = m.group(1).strip()

        # Extract sub-fields
        core_m = self._CORE_CONCLUSION_RE.search(body)
        core_conclusion = core_m.group(1).strip() if core_m else None

        findings_m = self._KEY_FINDINGS_RE.search(body)
        key_findings = None
        if findings_m:
            raw_findings = findings_m.group(1).strip()
            key_findings = [
                line.lstrip("- ").strip()
                for line in raw_findings.split("\n")
                if line.strip() and line.strip() != "-"
            ]

        confidence = None
        conf_m = self._CONFIDENCE_RE.search(body)
        if conf_m:
            try:
                confidence = float(conf_m.group(1))
            except ValueError:
                pass

        return ParsedConclusion(
            text=body,
            core_conclusion=core_conclusion,
            key_findings=key_findings,
            confidence=confidence,
        )

    # ── Tool call detection ──────────────────────────────────────────────

    def parse_tool_call(self, text: str) -> Optional[ParsedToolCall]:
        """Extract a single tool call from LLM output."""
        result = self._try_xml_json(text)
        if result:
            return result

        result = self._try_xml_elements(text)
        if result:
            return result

        result = self._try_code_block(text)
        if result:
            return result

        result = self._try_json_wrapper(text)
        if result:
            return result

        return None

    def _try_xml_json(self, text: str) -> Optional[ParsedToolCall]:
        """<tool_call>{"name":"...", "arguments":{...}}</tool_call>"""
        m = re.search(r'<tool_call>(.*?)</tool_call>', text, re.DOTALL)
        if not m:
            return None
        inner = m.group(1).strip()
        try:
            data = json.loads(inner)
            if isinstance(data, dict) and "name" in data:
                return ParsedToolCall(
                    name=data["name"],
                    arguments=data.get("arguments", {}),
                )
        except (json.JSONDecodeError, ValueError):
            pass
        return None

    def _try_xml_elements(self, text: str) -> Optional[ParsedToolCall]:
        """<tool_call><name>...</name><arguments>...</arguments></tool_call>"""
        m = re.search(r'<tool_call>(.*?)</tool_call>', text, re.DOTALL)
        if not m:
            return None
        inner = m.group(1).strip()

        name_m = re.search(r'<name>(.*?)</name>', inner)
        if not name_m:
            return None
        name = name_m.group(1).strip()
        if not name:
            return None

        args: dict = {}
        # Try JSON inside <arguments>
        args_json_m = re.search(r'<arguments>\s*(\{.*?\})\s*', inner, re.DOTALL)
        if args_json_m:
            try:
                args = json.loads(args_json_m.group(1))
            except (json.JSONDecodeError, ValueError):
                pass

        # Fallback: XML value elements
        if not args:
            args_wrapper = re.search(r'<arguments>(.*?)(?:</arguments>|$)', inner, re.DOTALL)
            search_text = args_wrapper.group(1) if args_wrapper else inner
            skip_tags = {'name', 'arguments', 'tool_call'}
            for arg_m in re.finditer(r'<(\w+)>(.*?)</\1>', search_text, re.DOTALL):
                tag = arg_m.group(1)
                if tag not in skip_tags:
                    args[tag] = arg_m.group(2).strip()

        return ParsedToolCall(name=name, arguments=args)

    def _try_code_block(self, text: str) -> Optional[ParsedToolCall]:
        """```tool_call\n{...}\n```"""
        m = re.search(r'```tool_call\s*\n(\{.*?\})\s*\n```', text, re.DOTALL)
        if not m:
            return None
        try:
            data = json.loads(m.group(1))
            if isinstance(data, dict) and "name" in data:
                return ParsedToolCall(
                    name=data["name"],
                    arguments=data.get("arguments", {}),
                )
        except json.JSONDecodeError:
            pass
        return None

    def _try_json_wrapper(self, text: str) -> Optional[ParsedToolCall]:
        """{"tool_call": {"name": ..., "arguments": ...}}"""
        try:
            parsed = json.loads(text.strip())
            if isinstance(parsed, dict) and "tool_call" in parsed:
                tc = parsed["tool_call"]
                if isinstance(tc, dict) and "name" in tc:
                    return ParsedToolCall(
                        name=tc["name"],
                        arguments=tc.get("arguments", {}),
                    )
        except (json.JSONDecodeError, ValueError):
            pass
        return None
