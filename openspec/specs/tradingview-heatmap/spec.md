## ADDED Requirements

### Requirement: TradingView stock heatmap widget embedded
The system SHALL embed the TradingView stock heatmap widget with dark theme styling matching the dashboard.

#### Scenario: Default S&P 500 heatmap
- **WHEN** the user selects the Heatmap tab
- **THEN** the system SHALL render the TradingView stock heatmap widget with dataSource=SPX500, grouped by sector, sized by market_cap_basic, colored by change

#### Scenario: Switch to NASDAQ 100
- **WHEN** the user clicks the "NASDAQ 100" data source button
- **THEN** the widget SHALL reload with dataSource=NASDAQ100

### Requirement: TradingView crypto heatmap supported
The system SHALL support switching to the TradingView crypto coins heatmap widget.

#### Scenario: Switch to Crypto
- **WHEN** the user clicks the "Crypto" data source button
- **THEN** the system SHALL replace the stock heatmap with the crypto coins heatmap widget, sized by market_cap_calc, colored by 24h change

### Requirement: Heatmap fills available space
The heatmap widget container SHALL fill the available right-panel space responsively.

#### Scenario: Container sizing
- **WHEN** the Heatmap tab is active
- **THEN** the widget container SHALL have width=100% and height filling the remaining panel space (100vh minus header and tab bar)
