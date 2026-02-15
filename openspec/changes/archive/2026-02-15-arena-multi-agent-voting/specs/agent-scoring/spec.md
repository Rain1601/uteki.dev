## ADDED Requirements

### Requirement: ModelScore tracks rejection count and evaluation metrics
The `model_score` table SHALL include: `rejection_count` (integer, default 0), `simulated_return_pct` (float, nullable), `decision_accuracy` (float, nullable), `confidence_calibration` (float, nullable).

#### Scenario: Model receives reject votes
- **WHEN** a model receives 2 reject votes in a voting round
- **THEN** that model's rejection_count is incremented by 2

### Requirement: Model score computed as adoption minus rejection
The system SHALL compute `model_score = adoption_count - rejection_count` for leaderboard ranking and tiebreaking.

#### Scenario: Leaderboard displays model score
- **WHEN** user views the leaderboard
- **THEN** each entry shows adoption_count, rejection_count, model_score, simulated_return_pct, decision_accuracy
- **THEN** models are ranked by model_score descending

### Requirement: Update scores after each voting round
After voting completes: increment winner's `adoption_count`, increment each rejected model's `rejection_count` by their reject vote count, increment all participants' `total_decisions`.

#### Scenario: Winner model scores updated
- **WHEN** Model B wins with 3 approves and 0 rejects
- **THEN** Model B's adoption_count += 1, rejection_count unchanged

#### Scenario: All participants counted
- **WHEN** 5 models participate
- **THEN** all 5 models' total_decisions += 1

### Requirement: Historical model score used for tiebreaking
When proposals tie by net_score, the system SHALL use the proposing model's historical `model_score` as first tiebreaker.

#### Scenario: Tiebreak by historical score
- **WHEN** Plan B (model score 5) and Plan D (model score 2) tie at net_score=2
- **THEN** Plan B wins

### Requirement: Independent agent backtest
The system SHALL support backtesting a single Agent independently: given a date range and frequency, construct historical harnesses, run the Agent's skill pipeline (without voting), record decisions, and evaluate against actual subsequent prices.

#### Scenario: Run single agent backtest
- **WHEN** user requests backtest for Claude over 2025-01-01 to 2025-06-01, monthly frequency
- **THEN** the system constructs 6 historical harnesses (one per month)
- **THEN** Claude's skill pipeline runs on each harness independently
- **THEN** each decision is evaluated: BUY accuracy (price rose within 20 days), SELL accuracy (price fell), HOLD accuracy (price stable)
- **THEN** returns cumulative return curve, accuracy rate, Sharpe ratio, max drawdown

#### Scenario: Backtest includes benchmark comparison
- **WHEN** a backtest completes
- **THEN** the result includes a parallel "pure DCA" benchmark curve for comparison

### Requirement: Decision accuracy definition
Decision accuracy SHALL be computed as: BUY is correct if price rises within 20 trading days, SELL is correct if price falls within 20 trading days, HOLD is correct if price change is within ±2% over 20 trading days.

#### Scenario: BUY decision evaluated
- **WHEN** Agent decided BUY on 2025-03-01 and price rose 5% by 2025-03-28
- **THEN** this decision is marked as correct

#### Scenario: HOLD decision evaluated
- **WHEN** Agent decided HOLD on 2025-03-01 and price changed -1.5% by 2025-03-28
- **THEN** this decision is marked as correct (within ±2%)

### Requirement: Benchmark DCA decision logged for comparison
After each voting round, the system SHALL create a benchmark DecisionLog with `user_action = "benchmark_dca"` that equally distributes the budget across all watchlist ETFs. This serves as a control group.

#### Scenario: Benchmark recorded alongside vote winner
- **WHEN** voting produces a winner and budget is $1000 with 5 ETFs in watchlist
- **THEN** a benchmark DecisionLog is created with $200 allocated to each ETF

### Requirement: Risk guard pluggable interface
The system SHALL include a `RiskGuard` interface that runs before final adoption. The interface accepts a decision and portfolio state, returns approved/modified/blocked status. Rule implementations are pluggable; initial deployment uses a pass-through (always approved).

#### Scenario: Risk guard pass-through (initial implementation)
- **WHEN** Phase 3 runs the risk guard check
- **THEN** the decision passes through unmodified (all rules return approved)

#### Scenario: Future risk rule blocks a decision
- **WHEN** a MaxPositionSizeRule is implemented and the decision exceeds 20% of portfolio
- **THEN** the rule returns blocked with reason, and the decision is modified or rejected

## MODIFIED Requirements

### Requirement: Arena history list endpoint
The backend SHALL provide a `GET /api/index/arena/history` endpoint that returns a paginated list of past Arena runs, ordered by creation time descending. Each item SHALL include `harness_id`, `harness_type`, `created_at`, `budget`, `model_count`, `vote_winner_model` (provider and name of voting winner), and `vote_winner_action` (the winning action).

#### Scenario: Fetch arena history with defaults
- **WHEN** client sends `GET /api/index/arena/history`
- **THEN** the system returns up to 20 items sorted by `created_at` descending, each containing `harness_id`, `harness_type`, `created_at`, `budget`, `model_count`, `vote_winner_model`, and `vote_winner_action`

#### Scenario: Fetch arena history with pagination
- **WHEN** client sends `GET /api/index/arena/history?limit=10&offset=10`
- **THEN** the system returns the second page of 10 items

#### Scenario: No arena history exists
- **WHEN** client sends `GET /api/index/arena/history` and no runs have been performed
- **THEN** the system returns `{"success": true, "data": []}`
