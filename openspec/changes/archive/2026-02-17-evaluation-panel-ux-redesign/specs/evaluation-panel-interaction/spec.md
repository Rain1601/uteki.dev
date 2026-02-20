## ADDED Requirements

### Requirement: Section cards always render
The Evaluation panel SHALL always render all 6 Section card containers regardless of data availability. The panel MUST NOT display a full-page empty state that blocks all content.

#### Scenario: No arena data exists
- **WHEN** the user navigates to the Evaluation tab and no Arena runs have been performed
- **THEN** all 6 Section cards are visible with their titles, each showing its own empty-state guide

#### Scenario: Partial data exists
- **WHEN** Arena runs exist but no Counterfactual data has been generated
- **THEN** sections with data (KPI, Radar, Voting, Trend, Cost) render their charts, and the Counterfactual section shows its empty-state guide

### Requirement: Independent section loading
Each Section SHALL fetch its data independently. One section's loading or error state MUST NOT block other sections from rendering.

#### Scenario: One API is slow
- **WHEN** the voting-matrix API takes 5 seconds while other APIs respond in 500ms
- **THEN** the other 5 sections render their data immediately; the Voting Heatmap section shows a loading indicator until its data arrives

#### Scenario: One API fails
- **WHEN** the cost-analysis API returns an error while other APIs succeed
- **THEN** the other 5 sections display normally; the Cost & Latency section shows an error message with a retry button

### Requirement: Section three-state rendering
Each Section component SHALL support three visual states: loading, error, and content.

#### Scenario: Loading state
- **WHEN** a Section's API call is in progress
- **THEN** the Section card displays a loading indicator (LoadingDots) inside the card body, while the card title remains visible

#### Scenario: Error state with retry
- **WHEN** a Section's API call has failed
- **THEN** the Section card displays the error message and a "Retry" button
- **WHEN** the user clicks "Retry"
- **THEN** the Section re-fetches its data independently without affecting other sections

#### Scenario: Content state
- **WHEN** a Section's API call succeeds and returns data
- **THEN** the Section renders its chart/visualization normally

### Requirement: Empty-state guide with context
When a Section has no data (API succeeds but returns empty results), the Section SHALL display an EmptyGuide with: a one-line description of what this section shows, a hint explaining what action produces this data, and an optional action button.

#### Scenario: Voting Heatmap empty guide
- **WHEN** the voting-matrix API returns `{models: [], matrix: []}`
- **THEN** the Voting Heatmap section displays an EmptyGuide with description "Voting patterns between models", hint "Run Arena with 2+ models to generate cross-voting data", and a "Go to Arena" button

#### Scenario: Counterfactual empty guide
- **WHEN** the counterfactual-summary API returns `{models: []}`
- **THEN** the Counterfactual section displays an EmptyGuide with description "Compare adopted vs missed returns", hint "Counterfactual data is generated automatically after decisions age 7+ days", and no action button

#### Scenario: Action button navigates to Arena tab
- **WHEN** the user clicks "Go to Arena" in any EmptyGuide
- **THEN** the page switches to the Arena tab (index 0)

### Requirement: Global refresh
The Evaluation panel SHALL provide a refresh button that reloads all 6 data sources.

#### Scenario: User clicks refresh
- **WHEN** the user clicks the refresh button in the KPI Cards row
- **THEN** all 6 sections re-enter their loading state and re-fetch their data

### Requirement: Voting Heatmap uses MUI Table
The Voting Heatmap section SHALL use MUI `Table`/`TableHead`/`TableBody`/`TableCell` components instead of native HTML `<table>` elements.

#### Scenario: Heatmap renders with MUI components
- **WHEN** voting matrix data is available
- **THEN** the heatmap renders using MUI Table components with styling consistent with LeaderboardTable (same `tableCellSx` / `tableHeadSx` patterns)

### Requirement: KPI Cards render with zero values
The KPI Cards row SHALL render even when all values are zero, displaying "0" instead of hiding or showing an empty state.

#### Scenario: Zero arena runs
- **WHEN** the overview API returns `total_arena_runs: 0`
- **THEN** the KPI Cards row renders with "Arena Runs: 0", "Decisions: 0", "Best Model: —", "Avg Win Rate: 0%"
