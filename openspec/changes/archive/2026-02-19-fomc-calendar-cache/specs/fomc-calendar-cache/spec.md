## ADDED Requirements

### Requirement: DB-first data loading for economic events
The system SHALL read economic events from the `economic_events` DB table as the primary source, only calling the FMP external API when DB data is missing or stale.

#### Scenario: DB has fresh data (within TTL)
- **WHEN** `get_monthly_events_enriched` is called for a month that has FMP events in DB with `updated_at` less than 1 hour ago
- **THEN** the system returns events from DB without calling the FMP API, and `fmp_status` is `"cached"`

#### Scenario: DB has stale data (beyond TTL)
- **WHEN** `get_monthly_events_enriched` is called for a month where DB events have `updated_at` older than 1 hour
- **THEN** the system calls the FMP API, upserts results to DB, and returns the fresh data with `fmp_status` as `"success"`

#### Scenario: DB has no data for requested month
- **WHEN** `get_monthly_events_enriched` is called for a month with no FMP events in DB
- **THEN** the system calls the FMP API, writes results to DB, and returns the data

#### Scenario: FMP API fails but DB has stale data
- **WHEN** the FMP API call fails (timeout, error) but the DB contains previously cached events for that month
- **THEN** the system returns the stale DB data with `fmp_status` as `"cached_stale"` and includes the error message

#### Scenario: FMP API fails and DB is empty
- **WHEN** the FMP API call fails and no cached data exists in DB
- **THEN** the system returns only FOMC meetings (from hardcoded list) with `fmp_status` as `"failed"`

### Requirement: FMP data persistence to economic_events table
The system SHALL persist FMP API responses to the `economic_events` table using upsert (insert or update) by event ID.

#### Scenario: New events are inserted
- **WHEN** FMP returns events that do not exist in DB (by ID)
- **THEN** the events are inserted into `economic_events` with `source='fmp'` and current timestamp for `created_at` and `updated_at`

#### Scenario: Existing events are updated
- **WHEN** FMP returns events whose IDs already exist in DB
- **THEN** the existing rows are updated with latest `actual_value`, `expected_value`, `previous_value`, `status`, `importance`, and `updated_at` is set to current timestamp

### Requirement: Force refresh parameter
The API endpoint SHALL accept an optional `refresh` query parameter to bypass the cache.

#### Scenario: refresh=true skips cache
- **WHEN** a GET request is made to `/events/monthly/{year}/{month}/enriched?refresh=true`
- **THEN** the system calls the FMP API regardless of DB freshness, upserts results, and returns fresh data

#### Scenario: Default behavior (no refresh param)
- **WHEN** a GET request is made without the `refresh` parameter
- **THEN** the system uses the DB-first caching strategy with TTL check

### Requirement: Statistics from DB
The `get_statistics` endpoint SHALL aggregate event counts from the `economic_events` table when data exists, falling back to the FOMC hardcoded list when DB is empty.

#### Scenario: DB has events
- **WHEN** `get_statistics` is called and DB contains economic events
- **THEN** the response includes counts grouped by `event_type` from DB data

#### Scenario: DB is empty
- **WHEN** `get_statistics` is called and no events exist in DB
- **THEN** the response falls back to counting FOMC meetings from the hardcoded list
