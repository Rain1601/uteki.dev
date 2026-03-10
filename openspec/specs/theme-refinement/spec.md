## ADDED Requirements

### Requirement: Dark theme background color refinement
The dark theme SHALL use a deeper, more sophisticated background color palette based on the Slate color scale.

#### Scenario: Dark theme background levels updated
- **WHEN** the dark theme is active
- **THEN** the primary background SHALL be #0F172A (Slate 900)
- **THEN** the secondary background (cards, surfaces) SHALL be #1E293B (Slate 800)
- **THEN** the tertiary background (elevated elements) SHALL be #334155 (Slate 700)
- **THEN** all existing components using the old background colors (#212121, #2a2a2a, #303030) SHALL render with the new values

### Requirement: Glass morphism utility class
The system SHALL provide a reusable glass-morphism CSS class for overlay elements.

#### Scenario: Glass card styling applied
- **WHEN** an element has the `glass-card` class (Tailwind) or `glassCard` sx prop pattern
- **THEN** it SHALL render with `backdrop-filter: blur(12px)`, semi-transparent background (`rgba(255, 255, 255, 0.05)`), subtle border (`rgba(255, 255, 255, 0.08)`), and `border-radius: 16px`

#### Scenario: Glass effect on command palette or modal overlays
- **WHEN** a modal or overlay is displayed
- **THEN** the backdrop SHALL use the glass-morphism effect for a modern frosted appearance

### Requirement: Focus glow effect
Interactive elements SHALL support a subtle glow effect on focus and active states.

#### Scenario: Glow on focused input fields
- **WHEN** a text input or select element receives focus
- **THEN** it SHALL display a subtle glow: `box-shadow: 0 0 0 2px rgba(100, 149, 237, 0.3)` (matching primary color)
- **THEN** the glow SHALL animate in over 150ms

#### Scenario: Glow on primary action buttons
- **WHEN** a primary button is hovered
- **THEN** it SHALL display a glow: `box-shadow: 0 0 20px rgba(100, 149, 237, 0.2)`

### Requirement: Consistent spacing and border radius
Cards and containers SHALL use unified spacing and border radius values.

#### Scenario: Card border radius standardized
- **WHEN** any Card or Paper component renders
- **THEN** it SHALL use border-radius of 12px

#### Scenario: Section spacing standardized
- **WHEN** content sections are laid out on a page
- **THEN** the gap between major sections SHALL be 20px
- **THEN** internal card padding SHALL be 20px (mobile: 16px)

#### Scenario: Default Card/Paper border removed
- **WHEN** a MUI Card or Paper component renders with default theme styling
- **THEN** it SHALL NOT have a visible border by default
- **THEN** pages that need borders SHALL explicitly add them

### Requirement: Theme refinements respect both modes
All color, spacing, and effect changes SHALL apply correctly to both dark and light themes.

#### Scenario: Light theme compatibility
- **WHEN** the light theme is active
- **THEN** glass-morphism effects SHALL use `rgba(0, 0, 0, 0.03)` background instead of white-based transparency
- **THEN** glow effects SHALL use the same primary color but with adjusted opacity for light backgrounds
- **THEN** background colors SHALL use the existing light Slate scale (Slate 50/100/200)

### Requirement: Border token for dividers
The theme SHALL provide a dedicated divider token for the new borderless card pattern.

#### Scenario: Divider token values
- **WHEN** dark mode is active
- **THEN** `theme.border.divider` SHALL resolve to `rgba(255, 255, 255, 0.06)`
- **WHEN** light mode is active
- **THEN** `theme.border.divider` SHALL resolve to `rgba(0, 0, 0, 0.06)`

#### Scenario: Divider usage pattern
- **WHEN** cards in a feed/list need visual separation
- **THEN** they SHALL use `borderBottom: 1px solid ${theme.border.divider}` instead of full borders
