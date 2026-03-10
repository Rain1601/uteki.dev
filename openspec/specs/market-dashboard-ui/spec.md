## ADDED Requirements

### Requirement: Right panel has tab navigation
The Market Dashboard right panel SHALL display a tab bar at the top with three tabs: Charts, Treemap, Heatmap.

#### Scenario: Default tab is Charts
- **WHEN** the dashboard loads
- **THEN** the Charts tab SHALL be selected by default, showing the existing category detail view

#### Scenario: Tab switching
- **WHEN** the user clicks a tab (Charts / Treemap / Heatmap)
- **THEN** the right panel content SHALL switch to the corresponding view without page reload

#### Scenario: Tab state persists during category selection
- **WHEN** the user is on the Charts tab and selects a different category from the left panel
- **THEN** the Charts tab SHALL remain active and show the selected category's charts

### Requirement: Left panel category selection affects Charts tab only
The left panel category selection SHALL only affect the Charts tab content. Treemap and Heatmap tabs SHALL be independent of category selection.

#### Scenario: Treemap ignores category
- **WHEN** the Treemap tab is active and the user clicks a category in the left panel
- **THEN** the right panel SHALL remain on Treemap (not switch to Charts)

#### Scenario: Heatmap ignores category
- **WHEN** the Heatmap tab is active and the user clicks a category in the left panel
- **THEN** the right panel SHALL remain on Heatmap (not switch to Charts)
