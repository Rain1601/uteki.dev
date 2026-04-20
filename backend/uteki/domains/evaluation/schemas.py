"""
Evaluation domain — Pydantic schemas.
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


class ConsistencyTestRequest(BaseModel):
    symbol: str
    num_runs: int = Field(default=3, ge=2, le=10)
    model: Optional[str] = None  # None = auto-select


class JudgeRequest(BaseModel):
    judge_model: Optional[str] = None  # None = deepseek-chat


# ─── Runner endpoints (v2 evaluation framework) ─────────────────────────────


class ConsistencyRunRequest(BaseModel):
    """Request body for POST /api/evaluation/runners/consistency."""
    skill: str = Field(
        default="company.full",
        description="Skill identifier. Currently only 'company.full' (7-gate pipeline) is supported.",
    )
    fixture: str = Field(
        ..., description="Fixture name, e.g. 'tsmc_2023'. See list endpoint.",
    )
    model: str = Field(
        default="gpt-4.1",
        description="Model name routed through the user's aggregator key.",
    )
    num_runs: int = Field(default=10, ge=2, le=30)
