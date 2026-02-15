## ADDED Requirements

### Requirement: Per-agent private memory namespace
The `agent_memory` table SHALL support an `agent_key` field that distinguishes shared memory (`agent_key = "shared"`) from per-agent private memory (`agent_key = "{provider}:{model_name}"`). Memory queries SHALL filter by agent_key.

#### Scenario: Write per-agent private memory
- **WHEN** the system writes a memory entry for Claude's voting reasoning
- **THEN** the record is created with `agent_key = "anthropic:claude-sonnet-4-20250514"`

#### Scenario: Query memory for a specific agent
- **WHEN** HarnessBuilder constructs memory for Claude's harness
- **THEN** the memory_summary includes entries where `agent_key = "shared"` AND `agent_key = "anthropic:claude-sonnet-4-20250514"`
- **THEN** other agents' private memories are NOT included

### Requirement: Write winning decision to shared memory after voting
After the voting pipeline completes, the system SHALL write the winning decision to shared memory (`agent_key = "shared"`, category = `arena_learning`). Content includes winning action, allocations, reasoning, net_score, model name, and date.

#### Scenario: Learning memory written after successful vote
- **WHEN** the voting pipeline produces a winner
- **THEN** a new agent_memory record is created with agent_key="shared", category="arena_learning"

#### Scenario: No memory written when pipeline fails
- **WHEN** all models failed and no winner exists
- **THEN** no arena_learning memory record is created

### Requirement: Write vote reasoning to per-agent private memory
Each model's voting reasoning SHALL be written to its private memory namespace with category `arena_vote_reasoning`. This enables each Agent to learn from its own voting history independently.

#### Scenario: Vote reasoning stored in private memory
- **WHEN** Claude casts votes with reasoning "Plan B has better risk management..."
- **THEN** an agent_memory record is created with agent_key="anthropic:claude-sonnet-4-20250514", category="arena_vote_reasoning"

### Requirement: Memory included in future harness with per-agent context
HarnessBuilder SHALL construct three memory sections per Agent: (1) shared memory, (2) that Agent's private memory, (3) recent 3 voting winners from shared arena_learning memory.

#### Scenario: Agent receives personalized memory context
- **WHEN** a new Arena run is triggered for Claude
- **THEN** Claude's harness memory includes shared memories, Claude's own private memories, and recent voting winners
- **THEN** GPT-4o's harness memory includes shared memories, GPT-4o's own private memories, and the same recent voting winners

### Requirement: Execution results update shared learning memory
When a voted decision is approved and executed, the execution results (profit/loss) SHALL be appended to the corresponding arena_learning memory's metadata.

#### Scenario: Execution result recorded
- **WHEN** a human approves and executes the auto_voted decision
- **THEN** the corresponding arena_learning memory's metadata is updated with execution_results
