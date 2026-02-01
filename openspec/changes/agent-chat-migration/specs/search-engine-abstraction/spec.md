# Search Engine Abstraction Specification

## ADDED Requirements

### Requirement: System provides unified search interface

The system SHALL expose a single search method regardless of underlying engine.

#### Scenario: Unified search API
- **WHEN** code calls SearchEngine.search(query, max_results)
- **THEN** system returns List[SearchResult] with consistent format
- **AND** format is independent of search engine used

#### Scenario: SearchResult structure
- **WHEN** system returns search results
- **THEN** each SearchResult contains:
  - title: str
  - url: str
  - snippet: str
  - source: str (domain name)

---

### Requirement: Google Custom Search integration works when configured

The system SHALL use Google Custom Search API when credentials are available.

#### Scenario: Google API initialization
- **WHEN** GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID are set
- **THEN** system initializes Google search strategy
- **AND** uses Google API for all searches

#### Scenario: Google search execution
- **WHEN** system performs Google search
- **THEN** system calls Google Custom Search API
- **AND** requests up to max_results items
- **AND** specifies region parameter (default: us-en)

#### Scenario: Google result parsing
- **WHEN** Google API returns results
- **THEN** system extracts:
  - title from item.title
  - url from item.link
  - snippet from item.snippet
  - source from parsed domain

#### Scenario: Google API quota exceeded
- **WHEN** Google API returns quota exceeded error
- **THEN** system logs warning
- **AND** automatically falls back to DuckDuckGo
- **AND** continues search without user intervention

---

### Requirement: DuckDuckGo search works without configuration

The system SHALL use DuckDuckGo when Google is unavailable or unconfigured.

#### Scenario: DuckDuckGo initialization
- **WHEN** Google API is not configured
- **THEN** system initializes DuckDuckGo search strategy
- **AND** requires no API key

#### Scenario: DuckDuckGo search execution
- **WHEN** system performs DuckDuckGo search
- **THEN** system uses duckduckgo-search library
- **AND** requests up to max_results items
- **AND** specifies region parameter (default: us-en)

#### Scenario: DuckDuckGo result parsing
- **WHEN** DuckDuckGo returns results
- **THEN** system extracts:
  - title from result['title']
  - url from result['href']
  - snippet from result['body']
  - source from parsed URL domain

#### Scenario: DuckDuckGo rate limiting
- **WHEN** DuckDuckGo rate limits requests
- **THEN** system waits and retries with exponential backoff
- **AND** retries up to 3 times
- **AND** returns partial results if available

---

### Requirement: Search engine selection is configurable

The system SHALL allow configuration of preferred search engine.

#### Scenario: Configuration via environment variable
- **WHEN** DEFAULT_SEARCH_ENGINE is set to "google"
- **THEN** system attempts to use Google (if configured)

#### Scenario: Configuration fallback
- **WHEN** DEFAULT_SEARCH_ENGINE is "google" but API not configured
- **THEN** system logs warning
- **AND** falls back to DuckDuckGo

#### Scenario: DuckDuckGo as default
- **WHEN** DEFAULT_SEARCH_ENGINE is "duckduckgo" or not set
- **THEN** system uses DuckDuckGo regardless of Google configuration

---

### Requirement: Search results are deduplicated

The system SHALL remove duplicate URLs from search results.

#### Scenario: URL deduplication
- **WHEN** search returns multiple results with same URL
- **THEN** system keeps only first occurrence
- **AND** removes duplicates from final result list

#### Scenario: Domain normalization
- **WHEN** URLs have different protocols or www prefixes
- **THEN** system normalizes for comparison:
  - http://example.com = https://example.com
  - www.example.com = example.com

---

### Requirement: Search results are aggregated by source

The system SHALL provide source domain statistics.

#### Scenario: Source aggregation
- **WHEN** system calls aggregate_sources(results)
- **THEN** system returns Dict[domain, count]
- **AND** groups results by source domain

#### Scenario: Source ranking
- **WHEN** displaying source statistics
- **THEN** system sorts sources by count (descending)
- **AND** shows most frequent sources first

---

### Requirement: Search handles regional preferences

The system SHALL support region-specific searches.

#### Scenario: US region search
- **WHEN** region parameter is "us-en"
- **THEN** system prioritizes US-based results
- **AND** uses English language preference

#### Scenario: Region parameter passthrough
- **WHEN** code specifies custom region
- **THEN** system passes region to underlying search engine
- **AND** respects regional preferences

---

### Requirement: Search errors are handled gracefully

The system SHALL handle search failures without crashing.

#### Scenario: Network timeout
- **WHEN** search request times out
- **THEN** system logs timeout error
- **AND** returns empty list
- **AND** does not crash application

#### Scenario: API authentication failure
- **WHEN** Google API key is invalid
- **THEN** system logs authentication error
- **AND** falls back to DuckDuckGo
- **AND** continues without user intervention

#### Scenario: Malformed response
- **WHEN** search engine returns unexpected format
- **THEN** system logs parsing error
- **AND** returns partial results if parseable
- **AND** returns empty list if completely invalid

---

### Requirement: Search performance is optimized

The system SHALL implement performance optimizations for searches.

#### Scenario: Concurrent searches
- **WHEN** multiple subtasks need searching
- **THEN** system executes searches concurrently
- **AND** uses asyncio for parallel execution

#### Scenario: Early termination
- **WHEN** max_results is reached
- **THEN** system stops fetching additional results
- **AND** returns immediately

---

### Requirement: Search activity is logged

The system SHALL log search operations for debugging and monitoring.

#### Scenario: Search initiation logging
- **WHEN** search starts
- **THEN** system logs:
  - Search query
  - Search engine used
  - Max results requested

#### Scenario: Search completion logging
- **WHEN** search completes
- **THEN** system logs:
  - Number of results returned
  - Time elapsed
  - Any errors encountered

#### Scenario: Engine fallback logging
- **WHEN** system falls back to different engine
- **THEN** system logs:
  - Original engine name
  - Fallback engine name
  - Reason for fallback
