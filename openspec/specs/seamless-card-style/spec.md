## ADDED Requirements

### Requirement: News timeline cards use borderless feed layout
News cards on the timeline page SHALL render without visible borders, using dividers and spacing for separation.

#### Scenario: News card base styling
- **WHEN** a news card renders in the timeline feed
- **THEN** it SHALL have no `border` property
- **THEN** it SHALL have no solid `backgroundColor` (transparent or inherit)
- **THEN** it SHALL be separated from adjacent cards by a thin bottom divider (`1px solid` at 6% opacity)
- **THEN** card padding SHALL be `20px horizontal, 16px vertical`

#### Scenario: News card hover
- **WHEN** a news card is hovered
- **THEN** the background SHALL transition to `rgba(255,255,255,0.03)` (dark) or `rgba(0,0,0,0.02)` (light) over 150ms
- **THEN** there SHALL be no `translateY` transform or box-shadow on hover (keep flat)

#### Scenario: Date group headers simplified
- **WHEN** a date group header renders (e.g., "2/27")
- **THEN** it SHALL render as inline text with fontWeight 700, fontSize 14, color `theme.text.muted`
- **THEN** it SHALL have a thin top border (`1px solid` at 8% opacity) with `paddingTop: 16px`
- **THEN** it SHALL NOT have a gradient background, border, or badge/chip styling

### Requirement: News filter chips use ghost style
Filter chips in the news timeline SHALL use minimal styling without background fills.

#### Scenario: Inactive filter chip
- **WHEN** a filter chip is not selected
- **THEN** it SHALL have no background color
- **THEN** it SHALL have a thin border (`1px solid` at 10% opacity)
- **THEN** text color SHALL be `theme.text.muted`

#### Scenario: Active filter chip
- **WHEN** a filter chip is selected
- **THEN** it SHALL have background `theme.brand.primary` at 12% opacity
- **THEN** border color SHALL be `theme.brand.primary` at 30% opacity
- **THEN** text color SHALL be `theme.brand.primary`

### Requirement: News left panel styling refined
The left panel (calendar + headlines) SHALL use lighter visual weight.

#### Scenario: Headlines list items
- **WHEN** headline list items render in the left panel
- **THEN** they SHALL have no border
- **THEN** active item SHALL use left accent bar (3px `theme.brand.primary`) instead of full border
- **THEN** inactive items SHALL have transparent background

### Requirement: Agent dashboard cards use borderless style
Agent and stat cards on the dashboard page SHALL render without prominent borders.

#### Scenario: Stat overview cards
- **WHEN** stat cards render at the top of agent dashboard
- **THEN** they SHALL have no `border` property
- **THEN** they SHALL use `theme.background.secondary` as background
- **THEN** borderRadius SHALL be 12px

#### Scenario: Agent cards base styling
- **WHEN** agent cards render in the grid
- **THEN** they SHALL have no visible `border`
- **THEN** background SHALL be transparent
- **THEN** a thin bottom divider (`1px solid` at 6% opacity) SHALL separate cards

#### Scenario: Agent card hover
- **WHEN** an agent card is hovered
- **THEN** background SHALL transition to the agent's color at 6% opacity
- **THEN** there SHALL be a subtle box-shadow: `0 2px 8px rgba(0,0,0,0.08)`
- **THEN** the left border SHALL NOT appear (remove current left-accent-on-hover pattern if present)

### Requirement: AI analysis section styling
The inline AI analysis expansion in news cards SHALL use minimal visual framing.

#### Scenario: AI analysis expanded view
- **WHEN** the AI analysis section expands within a news card
- **THEN** it SHALL use a thin left accent bar (2px, purple at 40% opacity) instead of a full bordered card
- **THEN** background SHALL be transparent (remove gradient background)
- **THEN** padding-left SHALL be 16px to create visual indent from the accent bar
