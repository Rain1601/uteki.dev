"""
Company Agent — Pydantic schemas for 7-gate decision tree pipeline.

Pipeline: 业务解析 → 成长质量(Fisher) → 护城河(Buffett) → 管理层 → 逆向检验(Munger) → 估值 → 仓位
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Literal, Optional


# ── Gate 1: 业务解析 ──────────────────────────────────────────────────────

class RevenueStream(BaseModel):
    name: str = ""
    percentage: float = 0.0
    growth_trend: str = ""

class BusinessAnalysisOutput(BaseModel):
    business_description: str = ""
    revenue_streams: list[RevenueStream] = Field(default_factory=list)
    profit_logic: str = ""
    is_good_business: bool = False
    business_quality: Literal["excellent", "good", "mediocre", "poor"] = "good"
    quality_reasons: list[str] = Field(default_factory=list)
    sustainability_score: float = 5.0
    sustainability_reasoning: str = ""
    key_metrics: dict = Field(default_factory=dict)
    summary: str = ""


# ── Gate 2: 成长质量分析 (Fisher 15问 QA) ─────────────────────────────────

class FisherQuestion(BaseModel):
    id: str = ""
    question: str = ""
    answer: str = ""
    score: float = 5.0
    data_confidence: Literal["high", "medium", "low"] = "medium"

class FisherQAOutput(BaseModel):
    questions: list[FisherQuestion] = Field(default_factory=list)
    total_score: float = 0.0
    growth_verdict: Literal["compounder", "cyclical", "declining", "turnaround"] = "cyclical"
    radar_data: dict = Field(default_factory=lambda: {
        "market_potential": 5, "innovation": 5, "profitability": 5,
        "management": 5, "competitive_edge": 5,
    })
    green_flags: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    summary: str = ""


# ── Gate 3: 护城河评估 (Buffett) ──────────────────────────────────────────

class MoatType(BaseModel):
    type: str = ""
    strength: Literal["strong", "moderate", "weak"] = "moderate"
    evidence: str = ""

class MoatAssessmentOutput(BaseModel):
    moat_types: list[MoatType] = Field(default_factory=list)
    moat_width: Literal["wide", "narrow", "none"] = "narrow"
    moat_trend: Literal["strengthening", "stable", "eroding"] = "stable"
    moat_durability_years: int = 0
    competitive_position: str = ""
    market_share_trend: str = ""
    moat_evidence: list[str] = Field(default_factory=list)
    moat_threats: list[str] = Field(default_factory=list)
    owner_earnings_quality: str = ""
    summary: str = ""


# ── Gate 4: 管理层评估 (Fisher + Munger) ──────────────────────────────────

class ManagementAssessmentOutput(BaseModel):
    integrity_score: float = 5.0
    integrity_evidence: str = ""
    capital_allocation_score: float = 5.0
    capital_allocation_detail: str = ""
    shareholder_orientation_score: float = 5.0
    shareholder_orientation_detail: str = ""
    succession_risk: Literal["low", "medium", "high"] = "medium"
    succession_detail: str = ""
    insider_signal: str = ""
    key_person_risk: str = ""
    compensation_assessment: str = ""
    management_score: float = 5.0
    summary: str = ""


# ── Gate 5: 逆向检验 (Munger) ─────────────────────────────────────────────

class DestructionScenario(BaseModel):
    scenario: str = ""
    probability: float = 0.0
    impact: float = 5.0
    timeline: str = ""
    reasoning: str = ""

class RedFlag(BaseModel):
    flag: str = ""
    triggered: bool = False
    detail: str = ""

class ReverseTestOutput(BaseModel):
    destruction_scenarios: list[DestructionScenario] = Field(default_factory=list)
    red_flags: list[RedFlag] = Field(default_factory=list)
    resilience_score: float = 5.0
    resilience_reasoning: str = ""
    cognitive_biases: list[str] = Field(default_factory=list)
    worst_case_narrative: str = ""
    summary: str = ""


# ── Gate 6: 估值与时机 (Buffett) ──────────────────────────────────────────

class ValuationOutput(BaseModel):
    price_assessment: Literal["cheap", "fair", "expensive", "bubble"] = "fair"
    price_reasoning: str = ""
    safety_margin: Literal["large", "moderate", "thin", "negative"] = "moderate"
    safety_margin_detail: str = ""
    market_sentiment: Literal["fear", "neutral", "greed", "euphoria"] = "neutral"
    sentiment_detail: str = ""
    comparable_assessment: str = ""
    buy_confidence: float = 5.0
    price_vs_quality: str = ""
    summary: str = ""


# ── Gate 7: 仓位与持有 ───────────────────────────────────────────────────

class PositionHoldingOutput(BaseModel):
    action: Literal["BUY", "WATCH", "AVOID"] = "WATCH"
    conviction: float = 0.5
    quality_verdict: Literal["EXCELLENT", "GOOD", "MEDIOCRE", "POOR"] = "GOOD"
    position_size_pct: float = 0.0
    position_reasoning: str = ""
    sell_triggers: list[str] = Field(default_factory=list)
    add_triggers: list[str] = Field(default_factory=list)
    hold_horizon: str = "5-10yr"
    philosophy_scores: dict = Field(default_factory=lambda: {
        "buffett": 5, "fisher": 5, "munger": 5,
    })
    buffett_comment: str = ""
    fisher_comment: str = ""
    munger_comment: str = ""
    one_sentence: str = ""
    summary: str = ""


# ── API Request / Response ─────────────────────────────────────────────────

class CompanyFullReport(BaseModel):
    """Gate 7 comprehensive output — all 7 sections structured from natural language analyses."""
    business_analysis: BusinessAnalysisOutput = Field(default_factory=BusinessAnalysisOutput)
    fisher_qa: FisherQAOutput = Field(default_factory=FisherQAOutput)
    moat_assessment: MoatAssessmentOutput = Field(default_factory=MoatAssessmentOutput)
    management_assessment: ManagementAssessmentOutput = Field(default_factory=ManagementAssessmentOutput)
    reverse_test: ReverseTestOutput = Field(default_factory=ReverseTestOutput)
    valuation: ValuationOutput = Field(default_factory=ValuationOutput)
    position_holding: PositionHoldingOutput = Field(default_factory=PositionHoldingOutput)


class CompanyAnalyzeRequest(BaseModel):
    symbol: str
    question: Optional[str] = None
    investment_horizon: str = "5-10yr"
    provider: Optional[str] = None
    model: Optional[str] = None


# ── Prompt Management ────────────────────────────────────────────────────

class PromptVersionCreate(BaseModel):
    gate_number: int = Field(ge=1, le=7)
    system_prompt: str
    description: str = ""


class PromptVersionResponse(BaseModel):
    id: str
    gate_number: int
    skill_name: str
    version: int
    system_prompt: str
    description: str
    is_active: bool
    eval_scores: Optional[dict] = None
    created_at: str


class ABTestRequest(BaseModel):
    symbol: str
    gate_number: int = Field(ge=1, le=7)
    version_a_id: str
    version_b_id: str
    runs_per_version: int = Field(default=3, ge=1, le=5)
    judge_model: str = "deepseek-chat"


# ── Cross-Model Comparison ───────────────────────────────────────────────

class CompareRequest(BaseModel):
    symbol: str
    models: list[str] = Field(min_length=2, max_length=5)


# ── Share ─────────────────────────────────────────────────────────────────

class ShareResponse(BaseModel):
    share_url: str
    expires_at: str
