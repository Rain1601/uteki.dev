"""Tests for Arena voting logic — parse, prompt build, plan map, tally scoring."""

import json
import string
import pytest
from uteki.domains.index.services.arena_service import ArenaService


# ── Fixtures ──

def make_model_io(io_id: str, provider: str, model: str, action: str = "BUY",
                  confidence: float = 0.8, allocations=None):
    """Helper to create a mock model IO dict."""
    return {
        "id": io_id,
        "model_provider": provider,
        "model_name": model,
        "status": "success",
        "output_structured": {
            "action": action,
            "allocations": allocations or [{"etf": "SPY", "amount": 100, "percentage": 50}],
            "confidence": confidence,
            "reasoning": f"Test reasoning from {model}",
        },
        "created_at": "2026-02-01T00:00:00",
    }


# ════════════════════════════════════════════════════════════════
# _parse_vote_output
# ════════════════════════════════════════════════════════════════

class TestParseVoteOutput:
    """Test ArenaService._parse_vote_output static method."""

    def test_json_block(self):
        raw = '''Some preamble text.
```json
{
    "approve_1": "Plan_A",
    "approve_2": "Plan_C",
    "reject": "Plan_B",
    "reasoning": "Plan A has better risk-adjusted returns"
}
```
'''
        result = ArenaService._parse_vote_output(raw)
        assert result is not None
        assert result["approve_1"] == "Plan_A"
        assert result["approve_2"] == "Plan_C"
        assert result["reject"] == "Plan_B"
        assert "risk-adjusted" in result["reasoning"]

    def test_direct_json(self):
        raw = json.dumps({
            "approve_1": "Plan_B",
            "approve_2": "Plan_A",
            "reject": None,
            "reasoning": "Both plans are solid",
        })
        result = ArenaService._parse_vote_output(raw)
        assert result is not None
        assert result["approve_1"] == "Plan_B"
        assert result["approve_2"] == "Plan_A"

    def test_regex_fallback(self):
        raw = '''I vote as follows:
"approve_1": "Plan_A"
"approve_2": "Plan_D"
"reject": "Plan_C"
"reasoning": "Plan C is too risky"
'''
        result = ArenaService._parse_vote_output(raw)
        assert result is not None
        assert result["approve_1"] == "Plan_A"
        assert result["approve_2"] == "Plan_D"
        assert result["reject"] == "Plan_C"

    def test_missing_approve1_returns_none(self):
        raw = '{"approve_2": "Plan_B", "reject": "Plan_A"}'
        result = ArenaService._parse_vote_output(raw)
        assert result is None

    def test_garbage_returns_none(self):
        result = ArenaService._parse_vote_output("This is just random text with no votes")
        assert result is None

    def test_json_with_null_reject(self):
        raw = json.dumps({
            "approve_1": "Plan_A",
            "approve_2": "Plan_B",
            "reject": None,
            "reasoning": "No plan deserves rejection",
        })
        result = ArenaService._parse_vote_output(raw)
        assert result is not None
        assert result["approve_1"] == "Plan_A"
        assert result.get("reject") is None

    def test_json_block_with_extra_whitespace(self):
        raw = '''```json

    {"approve_1": "Plan_C", "approve_2": "Plan_A", "reject": "Plan_B", "reasoning": "ok"}

```'''
        result = ArenaService._parse_vote_output(raw)
        assert result is not None
        assert result["approve_1"] == "Plan_C"


# ════════════════════════════════════════════════════════════════
# _build_vote_prompt / _build_plan_map
# ════════════════════════════════════════════════════════════════

class TestBuildVotePrompt:
    """Test vote prompt construction and plan mapping."""

    def setup_method(self):
        self.ios = [
            make_model_io("id_1", "anthropic", "claude-sonnet", "BUY", 0.9),
            make_model_io("id_2", "openai", "gpt-4o", "SELL", 0.7),
            make_model_io("id_3", "deepseek", "deepseek-chat", "HOLD", 0.5),
        ]

    def test_prompt_excludes_voter(self):
        prompt = ArenaService._build_vote_prompt("id_1", self.ios)
        assert prompt is not None
        # Voter's model name should NOT appear in the prompt (anonymized)
        assert "claude-sonnet" not in prompt
        assert "anthropic" not in prompt
        # Other plans should appear anonymized
        assert "Plan_A" in prompt
        assert "Plan_B" in prompt
        # Only 2 plans for the voter (3 total minus self)
        assert "Plan_C" not in prompt

    def test_prompt_shows_action_and_confidence(self):
        prompt = ArenaService._build_vote_prompt("id_1", self.ios)
        assert "SELL" in prompt
        assert "HOLD" in prompt

    def test_plan_map_matches_prompt(self):
        plan_map = ArenaService._build_plan_map("id_1", self.ios)
        assert plan_map["Plan_A"] == "id_2"
        assert plan_map["Plan_B"] == "id_3"
        assert len(plan_map) == 2  # Excludes voter

    def test_single_other_plan(self):
        ios = self.ios[:2]
        prompt = ArenaService._build_vote_prompt("id_1", ios)
        assert prompt is not None
        assert "Plan_A" in prompt
        assert "Plan_B" not in prompt

    def test_only_self_returns_none(self):
        prompt = ArenaService._build_vote_prompt("id_1", [self.ios[0]])
        assert prompt is None

    def test_plan_map_preserves_order(self):
        plan_map = ArenaService._build_plan_map("id_2", self.ios)
        # id_2 is voter, so Plan_A -> id_1, Plan_B -> id_3
        assert plan_map["Plan_A"] == "id_1"
        assert plan_map["Plan_B"] == "id_3"


# ════════════════════════════════════════════════════════════════
# _format_final_decision
# ════════════════════════════════════════════════════════════════

class TestFormatFinalDecision:
    """Test final decision formatting."""

    def test_format_with_votes(self):
        winner = make_model_io("id_1", "anthropic", "claude-sonnet", "BUY")
        score_map = {
            "id_1": {"approve": 3, "reject": 0},
            "id_2": {"approve": 1, "reject": 2},
            "id_3": {"approve": 1, "reject": 1},
        }
        result = ArenaService._format_final_decision(winner, 3, 3, 0, score_map)

        assert result["winner_model_io_id"] == "id_1"
        assert result["winner_model_provider"] == "anthropic"
        assert result["winner_model_name"] == "claude-sonnet"
        assert result["winner_action"] == "BUY"
        assert result["net_score"] == 3
        assert result["total_approve"] == 3
        assert result["total_reject"] == 0
        assert result["vote_summary"]["id_1"]["net"] == 3
        assert result["vote_summary"]["id_2"]["net"] == -1

    def test_format_no_votes(self):
        winner = make_model_io("id_1", "openai", "gpt-4o", "HOLD")
        result = ArenaService._format_final_decision(winner, 0, 0, 0, {})
        assert result["winner_model_io_id"] == "id_1"
        assert result["winner_action"] == "HOLD"
        assert result["vote_summary"] == {}


# ════════════════════════════════════════════════════════════════
# Tally scoring logic (sort_key verification)
# ════════════════════════════════════════════════════════════════

class TestTallyScoring:
    """Test the tally ranking logic (4-layer tiebreak) without DB."""

    def _rank(self, ios, score_map, historical_scores=None):
        """Simulate the sort_key logic from _run_phase3_tally."""
        if historical_scores is None:
            historical_scores = {}

        def sort_key(io):
            io_id = io["id"]
            scores = score_map.get(io_id, {"approve": 0, "reject": 0})
            net = scores["approve"] - scores["reject"]
            provider = io.get("model_provider", "")
            model = io.get("model_name", "")
            hist_key = f"{provider}:{model}"
            hist_score = historical_scores.get(hist_key, 0)
            confidence = (io.get("output_structured") or {}).get("confidence", 0) or 0
            created = io.get("created_at", "")
            return (-net, -hist_score, -confidence, created)

        return sorted(ios, key=sort_key)

    def test_highest_net_score_wins(self):
        ios = [
            make_model_io("a", "openai", "gpt-4o", "BUY", 0.5),
            make_model_io("b", "anthropic", "claude", "SELL", 0.9),
        ]
        score_map = {
            "a": {"approve": 3, "reject": 0},  # net = 3
            "b": {"approve": 1, "reject": 2},  # net = -1
        }
        ranked = self._rank(ios, score_map)
        assert ranked[0]["id"] == "a"

    def test_tiebreak_by_historical_score(self):
        ios = [
            make_model_io("a", "openai", "gpt-4o", "BUY", 0.5),
            make_model_io("b", "anthropic", "claude", "BUY", 0.5),
        ]
        score_map = {
            "a": {"approve": 2, "reject": 0},  # net = 2
            "b": {"approve": 2, "reject": 0},  # net = 2
        }
        historical = {"anthropic:claude": 10, "openai:gpt-4o": 3}
        ranked = self._rank(ios, score_map, historical)
        assert ranked[0]["id"] == "b"  # Higher historical score

    def test_tiebreak_by_confidence(self):
        ios = [
            make_model_io("a", "openai", "gpt-4o", "BUY", 0.5),
            make_model_io("b", "anthropic", "claude", "BUY", 0.9),
        ]
        score_map = {
            "a": {"approve": 2, "reject": 0},
            "b": {"approve": 2, "reject": 0},
        }
        ranked = self._rank(ios, score_map)
        assert ranked[0]["id"] == "b"  # Higher confidence

    def test_tiebreak_by_created_at(self):
        ios = [
            make_model_io("a", "openai", "gpt-4o", "BUY", 0.5),
            make_model_io("b", "anthropic", "claude", "BUY", 0.5),
        ]
        ios[0]["created_at"] = "2026-02-01T00:00:02"
        ios[1]["created_at"] = "2026-02-01T00:00:01"
        score_map = {
            "a": {"approve": 2, "reject": 0},
            "b": {"approve": 2, "reject": 0},
        }
        ranked = self._rank(ios, score_map)
        assert ranked[0]["id"] == "b"  # Earlier timestamp wins
