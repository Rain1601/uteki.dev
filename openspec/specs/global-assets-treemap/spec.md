## ADDED Requirements

### Requirement: Backend scrapes global asset market cap data
The system SHALL scrape the top 200 global assets by market cap from companiesmarketcap.com and store them in the `global_asset_marketcap` table (macro schema).

#### Scenario: Successful daily sync
- **WHEN** the daily scheduler triggers at UTC 06:00
- **THEN** the system SHALL fetch, parse, and upsert the latest 200 assets with rank, name, symbol, asset_type, market_cap, price, change_today, change_30d, country, data_date

#### Scenario: Manual sync trigger
- **WHEN** a POST request is sent to `/api/macro/marketcap/sync`
- **THEN** the system SHALL immediately run the scraper and return the sync result with count of records saved

#### Scenario: Scraper target unavailable
- **WHEN** companiesmarketcap.com is unreachable or returns non-200
- **THEN** the system SHALL log a warning and return the most recent cached data without crashing

### Requirement: API returns market cap rankings
The system SHALL expose `GET /api/macro/marketcap` returning the latest asset market cap data.

#### Scenario: Fetch all assets
- **WHEN** a GET request is sent to `/api/macro/marketcap`
- **THEN** the system SHALL return up to 200 assets sorted by rank, each with rank, name, symbol, asset_type, market_cap, price, change_today, change_30d

#### Scenario: Filter by asset type
- **WHEN** a GET request includes `?asset_type=cryptocurrency`
- **THEN** the system SHALL return only assets where asset_type matches the filter

#### Scenario: Limit results
- **WHEN** a GET request includes `?limit=50`
- **THEN** the system SHALL return at most 50 assets

### Requirement: API returns market cap summary
The system SHALL expose `GET /api/macro/marketcap/summary` returning aggregated market cap by asset type.

#### Scenario: Summary response
- **WHEN** a GET request is sent to `/api/macro/marketcap/summary`
- **THEN** the system SHALL return total market cap per asset_type, total asset count, and data_date

### Requirement: Market cap data is cached
The system SHALL cache market cap query results with 1-hour TTL.

#### Scenario: Cache hit
- **WHEN** market cap data was fetched within the last hour
- **THEN** the system SHALL return cached data without querying the database

### Requirement: Treemap renders global assets by market cap
The frontend SHALL render an ECharts treemap where block size represents market_cap and block color represents change_today percentage.

#### Scenario: Treemap renders on load
- **WHEN** the user selects the Treemap tab
- **THEN** the system SHALL fetch `/api/macro/marketcap` and render a treemap with up to 200 asset blocks

#### Scenario: Color coding by change
- **WHEN** the treemap renders
- **THEN** assets with positive change_today SHALL be colored green (gradient by magnitude) and negative change SHALL be colored red (gradient by magnitude)

#### Scenario: Tooltip on hover
- **WHEN** the user hovers over a treemap block
- **THEN** a tooltip SHALL display: rank, name, symbol, asset_type, market_cap (formatted), price, and change_today percentage

#### Scenario: Filter by asset type
- **WHEN** the user selects a filter chip (All / Stocks / Crypto / Metals / ETF)
- **THEN** the treemap SHALL re-render showing only assets matching the selected type
