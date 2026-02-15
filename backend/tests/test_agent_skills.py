"""Tests for Agent Skill Pipeline — tool call parsing, skill message building."""

import json
import pytest
from uteki.domains.index.services.agent_skills import AgentSkillRunner, SKILL_PIPELINE, TOOL_DEFINITIONS


# ════════════════════════════════════════════════════════════════
# _parse_tool_call
# ════════════════════════════════════════════════════════════════

class TestParseToolCall:
    """Test AgentSkillRunner._parse_tool_call static method."""

    def test_xml_style(self):
        text = '''Let me check the market data.
<tool_call>{"name": "get_symbol_detail", "arguments": {"symbol": "SPY"}}</tool_call>
'''
        result = AgentSkillRunner._parse_tool_call(text)
        assert result is not None
        assert result["name"] == "get_symbol_detail"
        assert result["arguments"]["symbol"] == "SPY"

    def test_code_block_style(self):
        text = '''I need to check recent news.
```tool_call
{"name": "get_recent_news", "arguments": {"limit": 5}}
```
'''
        result = AgentSkillRunner._parse_tool_call(text)
        assert result is not None
        assert result["name"] == "get_recent_news"
        assert result["arguments"]["limit"] == 5

    def test_json_with_tool_call_key(self):
        text = json.dumps({
            "tool_call": {
                "name": "read_memory",
                "arguments": {"category": "arena_learning", "limit": 3}
            }
        })
        result = AgentSkillRunner._parse_tool_call(text)
        assert result is not None
        assert result["name"] == "read_memory"
        assert result["arguments"]["category"] == "arena_learning"

    def test_no_tool_call_returns_none(self):
        text = "Here is my analysis of the market conditions. SPY is trending up."
        result = AgentSkillRunner._parse_tool_call(text)
        assert result is None

    def test_malformed_json_returns_none(self):
        text = '<tool_call>{"name": "get_symbol_detail", arguments: broken}</tool_call>'
        result = AgentSkillRunner._parse_tool_call(text)
        assert result is None

    def test_xml_style_multiline_arguments(self):
        text = '''<tool_call>
{
    "name": "calculate_position_size",
    "arguments": {
        "symbol": "QQQ",
        "current_price": 450.0,
        "budget": 10000,
        "risk_pct": 0.02
    }
}
</tool_call>'''
        result = AgentSkillRunner._parse_tool_call(text)
        assert result is not None
        assert result["name"] == "calculate_position_size"
        assert result["arguments"]["symbol"] == "QQQ"
        assert result["arguments"]["budget"] == 10000


# ════════════════════════════════════════════════════════════════
# Skill pipeline definitions
# ════════════════════════════════════════════════════════════════

class TestSkillPipelineDefinitions:
    """Test that skill definitions are consistent."""

    def test_pipeline_has_4_skills(self):
        assert len(SKILL_PIPELINE) == 4

    def test_pipeline_order(self):
        names = [s.skill_name for s in SKILL_PIPELINE]
        assert names == ["analyze_market", "analyze_macro", "recall_memory", "make_decision"]

    def test_all_skill_tools_are_defined(self):
        for skill in SKILL_PIPELINE:
            for tool_name in skill.tools:
                assert tool_name in TOOL_DEFINITIONS, (
                    f"Skill '{skill.skill_name}' references undefined tool '{tool_name}'"
                )

    def test_make_decision_has_output_schema(self):
        decision_skill = SKILL_PIPELINE[-1]
        assert decision_skill.skill_name == "make_decision"
        assert decision_skill.output_schema is not None
        assert "action" in decision_skill.output_schema.get("properties", decision_skill.output_schema)

    def test_each_skill_has_system_prompt(self):
        for skill in SKILL_PIPELINE:
            assert skill.system_prompt_template, f"Skill '{skill.skill_name}' has no system prompt"
            assert len(skill.system_prompt_template) > 20


# ════════════════════════════════════════════════════════════════
# Tool definitions
# ════════════════════════════════════════════════════════════════

class TestToolDefinitions:
    """Test that tool definitions are well-formed."""

    def test_all_tools_have_required_fields(self):
        for name, tool_def in TOOL_DEFINITIONS.items():
            assert "name" in tool_def, f"Tool '{name}' missing 'name'"
            assert "description" in tool_def, f"Tool '{name}' missing 'description'"
            assert "parameters" in tool_def, f"Tool '{name}' missing 'parameters'"

    def test_tool_names_match_keys(self):
        for key, tool_def in TOOL_DEFINITIONS.items():
            assert tool_def["name"] == key

    def test_expected_tools_exist(self):
        expected = ["get_symbol_detail", "get_recent_news", "read_memory", "calculate_position_size"]
        for name in expected:
            assert name in TOOL_DEFINITIONS
