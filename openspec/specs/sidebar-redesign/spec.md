## ADDED Requirements

### Requirement: Sidebar toggle expand/collapse
The sidebar SHALL support a persistent expand/collapse toggle on desktop, replacing the current CSS hover slide-in mechanism.

#### Scenario: Collapsed state (default)
- **WHEN** the sidebar is collapsed
- **THEN** it SHALL render as a 54px-wide vertical rail
- **THEN** each nav item SHALL display only its icon, horizontally centered
- **THEN** hovering a nav icon SHALL show a tooltip with the item label
- **THEN** the collapsed state SHALL be the default for new users

#### Scenario: Expanded state
- **WHEN** the user clicks the expand toggle
- **THEN** the sidebar SHALL animate to 280px width over 300ms with ease timing
- **THEN** each nav item SHALL display icon + label text
- **THEN** category headers (MAIN, AGENT, TRADING) SHALL be visible

#### Scenario: Toggle button placement
- **WHEN** the sidebar renders on desktop
- **THEN** a toggle button (chevron-right when collapsed, chevron-left when expanded) SHALL appear at the bottom of the sidebar
- **THEN** the toggle button SHALL use a subtle icon style matching the sidebar theme

#### Scenario: State persistence
- **WHEN** the user toggles the sidebar state
- **THEN** the state SHALL be saved to localStorage
- **WHEN** the page reloads
- **THEN** the sidebar SHALL restore the previously saved state

#### Scenario: Layout content area adjusts
- **WHEN** the sidebar expands or collapses
- **THEN** the main content area `marginLeft` SHALL transition smoothly to match the new sidebar width
- **THEN** page content SHALL NOT jump or reflow abruptly

### Requirement: Sidebar visual refinement
The sidebar SHALL use refined styling for a cleaner, more modern appearance.

#### Scenario: Background and border
- **WHEN** the sidebar renders
- **THEN** the background SHALL be `theme.background.secondary` with no visible right border
- **THEN** a subtle box-shadow (`1px 0 3px rgba(0,0,0,0.1)`) SHALL provide depth separation instead of a border

#### Scenario: Active item indicator
- **WHEN** a nav item is active (current route)
- **THEN** it SHALL display a 3px left accent bar in `theme.brand.primary`
- **THEN** the item background SHALL be `theme.brand.primary` at 10% opacity
- **THEN** there SHALL be no visible border around the active item

#### Scenario: Nav item hover
- **WHEN** a nav item is hovered
- **THEN** the background SHALL change to `rgba(255,255,255,0.06)` (dark) or `rgba(0,0,0,0.04)` (light)
- **THEN** the transition SHALL be 150ms ease

#### Scenario: Icon sizing and font
- **WHEN** nav items render
- **THEN** icons SHALL be 20px with strokeWidth 1.75 for a lighter feel
- **THEN** label text SHALL be 13px, fontWeight 500, with `theme.text.secondary` color
- **THEN** active label text SHALL use `theme.text.primary` color and fontWeight 600

### Requirement: Mobile sidebar unchanged
The mobile sidebar SHALL continue using SwipeableDrawer without the toggle mechanism.

#### Scenario: Mobile behavior preserved
- **WHEN** the viewport is mobile or small screen
- **THEN** the sidebar SHALL use the existing SwipeableDrawer
- **THEN** the expand/collapse toggle SHALL NOT be rendered
