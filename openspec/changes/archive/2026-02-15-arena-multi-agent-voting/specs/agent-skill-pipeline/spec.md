## ADDED Requirements

### Requirement: Agent executes a structured skill pipeline
Each Agent SHALL execute a 4-step skill pipeline instead of a single-shot prompt: (1) AnalyzeMarket, (2) AnalyzeMacro, (3) RecallMemory, (4) MakeDecision. Each step is a separate LLM call. Intermediate results accumulate and pass to the next step.

#### Scenario: Full pipeline execution
- **WHEN** an Agent runs the skill pipeline with a complete harness
- **THEN** the Agent executes 4 sequential LLM calls
- **THEN** each step's input includes the outputs of all previous steps
- **THEN** the final MakeDecision step produces the structured decision (action, allocations, confidence, reasoning)

#### Scenario: Pipeline step failure triggers single-shot fallback
- **WHEN** any skill step fails or times out
- **THEN** the Agent falls back to single-shot mode (current logic: entire harness in one prompt)
- **THEN** the fallback attempt is recorded in ModelIO with metadata indicating fallback was used

### Requirement: Tool-use support within skills
Agents SHALL be able to invoke predefined tools during skill execution: `get_symbol_detail(symbol)`, `get_recent_news(symbol)`, `read_memory(category)`, `calculate_position_size(symbol, action)`. Tool-use is limited to a maximum of 3 rounds per skill step with a 5-second timeout per tool execution.

#### Scenario: Agent invokes a tool during analysis
- **WHEN** the LLM returns a tool_call for `get_symbol_detail("QQQ")` during AnalyzeMarket
- **THEN** the system executes the tool, returns the result to the LLM, and the LLM continues its analysis
- **THEN** the tool call and result are recorded in ModelIO.tool_calls

#### Scenario: Tool-use exceeds maximum rounds
- **WHEN** the LLM requests more than 3 tool calls within a single skill step
- **THEN** the system stops tool execution after the 3rd round and forces the LLM to produce output with available data

#### Scenario: Tool execution times out
- **WHEN** a tool call takes longer than 5 seconds
- **THEN** the system returns a timeout error to the LLM
- **THEN** the LLM continues with available data

### Requirement: DecisionHarness includes expanded data schema
The `market_snapshot` JSON in DecisionHarness SHALL include three new top-level sections: `valuations` (PE ratio, CAPE, dividend yield, equity risk premium per symbol), `macro` (Fed rate, CPI, GDP, unemployment, PMI, VIX, DXY, yield curve), and `sentiment` (Fear & Greed index, AAII survey, put/call ratio, news sentiment). Fields without data sources SHALL be set to null.

#### Scenario: Harness built with partial data availability
- **WHEN** HarnessBuilder constructs a harness and macro data sources are not yet connected
- **THEN** the `macro` section contains all defined fields with null values
- **THEN** the serialized prompt marks null fields as `[数据暂不可用]`

#### Scenario: Harness built with full data availability
- **WHEN** all data sources are connected and return valid data
- **THEN** the `valuations`, `macro`, and `sentiment` sections contain populated values

### Requirement: Pipeline phase tracking for recovery
DecisionHarness SHALL include a `pipeline_state` JSON field tracking completion of each phase. The `run()` method SHALL check this state before execution and resume from the last incomplete phase.

#### Scenario: Pipeline interrupted after Phase 1
- **WHEN** a previous run completed Phase 1 (decisions) but crashed before Phase 2 (voting)
- **THEN** calling `run()` again with the same harness_id skips Phase 1 and resumes from Phase 2

#### Scenario: Idempotent re-run of completed pipeline
- **WHEN** `run()` is called with a harness_id that has all phases completed
- **THEN** the system returns the existing results without re-executing any phase

### Requirement: Arena run executes multi-phase pipeline
The `ArenaService.run()` method SHALL execute a 3-phase pipeline: Phase 1 (parallel Agent skill pipelines) → Phase 2 (parallel voting) → Phase 3 (tally, risk check, adopt). All phases execute within a single API call.

#### Scenario: Successful full pipeline
- **WHEN** client calls `POST /api/index/arena/run`
- **THEN** the response contains `models` (decisions), `votes` (voting details), `final_decision` (winner), and `pipeline_phases` (per-phase timing)

#### Scenario: All models fail in Phase 1
- **WHEN** all models fail in the decision phase
- **THEN** Phase 2 is skipped, `final_decision` is null

#### Scenario: Only one model succeeds
- **WHEN** only one model produces a valid decision
- **THEN** Phase 2 is skipped, that model is automatically adopted
