## ADDED Requirements

### Requirement: Icon library unified to Lucide React
All UI icons SHALL use lucide-react as the sole icon source. The @mui/icons-material package SHALL be completely removed from dependencies.

#### Scenario: All MUI icons replaced with Lucide equivalents
- **WHEN** the migration is complete
- **THEN** there SHALL be zero imports from `@mui/icons-material` in the codebase
- **THEN** all icons SHALL be imported from `lucide-react`
- **THEN** `@mui/icons-material` SHALL NOT appear in package.json

#### Scenario: Icon mapping covers all 45 current MUI icons
- **WHEN** building the MUI → Lucide mapping table
- **THEN** every MUI icon currently in use SHALL have a corresponding Lucide icon
- **THEN** the mapping SHALL prioritize semantic equivalence (e.g. `SmartToy` → `Bot`, `Casino` → `Dices`)

### Requirement: Icon visual consistency
All Lucide icons SHALL render with consistent default properties across the application.

#### Scenario: Default icon sizing and stroke
- **WHEN** a Lucide icon is rendered without explicit size props
- **THEN** it SHALL display at 24x24 pixels with strokeWidth of 2
- **THEN** it SHALL inherit the current text color via `currentColor`

#### Scenario: Icons in MUI components (IconButton, ListItemIcon, etc.)
- **WHEN** a Lucide icon is used inside a MUI component that previously contained a MUI icon
- **THEN** it SHALL render at the same visual size and alignment as the original MUI icon
- **THEN** the `size` prop SHALL be set explicitly where MUI components expect specific icon dimensions (e.g. `fontSize="small"` → `size={20}`)

### Requirement: Sidebar navigation icons
The HoverSidebar component SHALL use Lucide icons for all navigation items with refined sizing for the new collapsed state.

#### Scenario: Sidebar icon mapping
- **WHEN** the sidebar renders navigation items
- **THEN** each nav item SHALL display the corresponding Lucide icon:
  - Arena → `Dices`
  - Market Dashboard → `LayoutDashboard`
  - FOMC Calendar → `Calendar`
  - News → `Newspaper`
  - Index Agent → `Bot`
  - Trading → `TrendingUp`
  - Admin/Settings → `Settings`
  - Market Data → `Database`
  - Agent Chat → `MessageSquare`
  - Agent Dashboard → `Activity`

#### Scenario: Collapsed sidebar icon presentation
- **WHEN** the sidebar is in collapsed (icon-only) state
- **THEN** icons SHALL render at 20px size
- **THEN** icons SHALL be horizontally and vertically centered within the 54px rail
- **THEN** strokeWidth SHALL be 1.75 for a lighter, more refined appearance
