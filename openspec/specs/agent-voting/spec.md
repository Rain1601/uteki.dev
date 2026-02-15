## ADDED Requirements

### Requirement: ArenaVote data model
The system SHALL store each individual vote in an `arena_vote` table with fields: `id` (UUID), `harness_id` (FK to DecisionHarness), `voter_model_io_id` (FK to ModelIO — who voted), `target_model_io_id` (FK to ModelIO — who received the vote), `vote_type` ("approve" or "reject"), `reasoning` (text), `created_at` (timestamp).

#### Scenario: Record approve vote
- **WHEN** Model A votes to approve Plan B's proposal
- **THEN** an ArenaVote record is created with voter_model_io_id = Model A's ModelIO id, target_model_io_id = Model B's ModelIO id, vote_type = "approve"

#### Scenario: Record reject vote
- **WHEN** Model A votes to reject Plan C's proposal
- **THEN** an ArenaVote record is created with vote_type = "reject" and reasoning containing the rejection rationale

#### Scenario: Abstention on reject vote
- **WHEN** Model A chooses not to cast a reject vote (null)
- **THEN** no reject ArenaVote record is created for that voter

### Requirement: Vote tallying produces net scores
The system SHALL compute `net_score` for each candidate proposal as: `approve_count - reject_count`. The candidate with the highest net_score SHALL be declared the winner.

#### Scenario: Clear winner by net score
- **WHEN** Plan B has net_score=3 and all other plans have lower net_scores
- **THEN** Plan B is declared the winner

#### Scenario: Tie in net score — fallback to historical model score
- **WHEN** Plan B and Plan D both have the highest net_score
- **THEN** the system compares the historical model_score (adoption_count - rejection_count) of Plan B's model vs Plan D's model
- **THEN** the plan from the model with higher historical model_score wins

#### Scenario: Tie in net score and historical score — fallback to confidence
- **WHEN** Plan B and Plan D are tied in both net_score and historical model_score
- **THEN** the system compares the confidence value from each plan's output_structured
- **THEN** the plan with higher confidence wins

#### Scenario: All fallbacks exhausted — deterministic tiebreak
- **WHEN** two plans are tied across all three criteria
- **THEN** the plan whose ModelIO was created earliest (lowest created_at) wins

### Requirement: Vote results stored on DecisionLog
After tallying, the system SHALL automatically create a `DecisionLog` record with `user_action = "auto_voted"`, `adopted_model_io_id` set to the winner's ModelIO id, and `original_allocations` set to the winner's proposed allocations.

#### Scenario: Auto-adopt after voting
- **WHEN** voting completes and a winner is determined
- **THEN** a DecisionLog record is created with user_action="auto_voted" and the winning model's allocations
- **THEN** the DecisionLog is available for human review before actual execution

### Requirement: API returns combined pipeline result
The `POST /api/index/arena/run` response SHALL include a `final_decision` object containing: `winner_model_io_id`, `winner_model_provider`, `winner_model_name`, `winner_action`, `net_score`, `total_approve`, `total_reject`, and `vote_summary` (per-candidate breakdown).

#### Scenario: Successful pipeline response
- **WHEN** the full pipeline completes
- **THEN** the response JSON contains `models` (array of ModelIO summaries), `votes` (array of ArenaVote records), and `final_decision` with the winner details

#### Scenario: Voting skipped response
- **WHEN** fewer than 2 models succeed in Phase 1
- **THEN** `votes` is an empty array and `final_decision.winner_model_io_id` is set to the single successful model (or null if none)
