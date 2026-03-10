## ADDED Requirements

### Requirement: Timeline data API
The backend SHALL provide a `GET /api/index/arena/timeline` endpoint that returns a chronologically ordered array of timeline data points. Each data point SHALL include: `harness_id`, `created_at`, `account_total` (from DecisionHarness.account_state.total), `action` (from the adopted model's structured output, or null), `harness_type`, `model_count`, `prompt_version`, and `budget`.

#### Scenario: Timeline with arena history
- **WHEN** the client calls `GET /api/index/arena/timeline?limit=50`
- **THEN** the server returns up to 50 data points sorted by `created_at` ascending, each containing `harness_id`, `created_at`, `account_total`, `action`, `harness_type`, `model_count`, `prompt_version`, `budget`

#### Scenario: Timeline with no data
- **WHEN** the client calls `GET /api/index/arena/timeline` and no arena runs exist
- **THEN** the server returns `{"success": true, "data": []}`

### Requirement: Left-right split layout
ArenaView SHALL render as a left-right dual-panel layout. The left panel (approx 40% width) SHALL contain the timeline chart. The right panel (approx 60% width) SHALL contain the model results cards. On screens narrower than 900px, the layout SHALL stack vertically (chart on top, cards below).

#### Scenario: Desktop layout
- **WHEN** the viewport is 1200px wide
- **THEN** the chart panel renders on the left (~40%) and model cards on the right (~60%)

#### Scenario: Mobile layout
- **WHEN** the viewport is less than 900px wide
- **THEN** the chart renders above and model cards render below in a single column

### Requirement: Timeline chart visualization
The left panel SHALL display a recharts LineChart showing account total asset value over time. Each data point SHALL be rendered as a clickable dot, color-coded by action: green for BUY, red for SELL, orange for HOLD, gray for unknown/null.

#### Scenario: Chart with multiple data points
- **WHEN** the timeline has 10 arena runs with varying account_total values
- **THEN** the chart renders a line connecting the 10 points with colored dots at each point

#### Scenario: Data point tooltip
- **WHEN** the user hovers over a chart data point
- **THEN** a tooltip displays the date, account total, action, and harness type

### Requirement: Chart-to-detail interaction
Clicking a data point on the timeline chart SHALL load the corresponding arena's model results in the right panel. The clicked data point SHALL be visually highlighted.

#### Scenario: Click chart point loads detail
- **WHEN** the user clicks a data point with harness_id "abc-123" on the chart
- **THEN** the right panel loads and displays all model results for harness "abc-123"
- **AND** the clicked point is visually highlighted (larger size or ring)

### Requirement: Default selection
On initial load, the right panel SHALL default to showing the latest arena run's model results. The corresponding data point on the chart SHALL be highlighted.

#### Scenario: Initial load with history
- **WHEN** ArenaView loads and there are 5 arena runs in history
- **THEN** the right panel shows model cards for the most recent run
- **AND** the rightmost data point on the chart is highlighted

#### Scenario: Initial load with no history
- **WHEN** ArenaView loads and there are no arena runs
- **THEN** the chart area shows an empty state message
- **AND** the right panel shows the Arena introduction text
