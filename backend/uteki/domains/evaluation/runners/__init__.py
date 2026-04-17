"""
Evaluation Runners — dimension-specific evaluators that produce EvalReport fragments.

Each runner consumes:
  - a skill_name (e.g. "company.full" for the 7-gate pipeline)
  - a fixture (loaded from tests/fixtures/companies/*.yaml)
  - a model identifier
  - the requesting user_id (so the aggregator key resolves correctly)

And produces an EvalReport with exactly one of its dimension fields populated
(consistency / credibility / logic / effectiveness). A top-level orchestrator
can compose multiple runners into a full EvalReport if desired.

See docs/ADR-evaluation-framework.md for the design rationale.
"""
from uteki.domains.evaluation.runners.base import BaseRunner
from uteki.domains.evaluation.runners.consistency import ConsistencyRunner

__all__ = ["BaseRunner", "ConsistencyRunner"]
