# Deep Research Mode Specification

## ADDED Requirements

### Requirement: User can activate Deep Research mode

The system SHALL provide a dedicated Research mode button that allows users to switch between normal chat and Deep Research mode.

#### Scenario: Research mode activation
- **WHEN** user clicks the Research button in the input area
- **THEN** system activates Research mode (button shows active state)

#### Scenario: Research mode deactivation
- **WHEN** user clicks the Research button again while in Research mode
- **THEN** system deactivates Research mode and returns to normal chat

#### Scenario: Research mode visual indicator
- **WHEN** Research mode is active
- **THEN** Research button displays with active styling (highlighted background, search icon)

---

### Requirement: System decomposes user query into subtasks

The system SHALL use an LLM to analyze and decompose user research queries into multiple focused subtasks.

#### Scenario: Query decomposition
- **WHEN** user submits a research query
- **THEN** system sends query to LLM with decomposition prompt
- **AND** LLM returns 2-5 subtasks

#### Scenario: Decomposition visualization
- **WHEN** system receives subtasks from LLM
- **THEN** system displays thinking process in ThoughtProcessCard
- **AND** each subtask is shown as a separate thought item

#### Scenario: Decomposition failure
- **WHEN** LLM fails to decompose query
- **THEN** system falls back to using original query as single task
- **AND** continues research process without error

---

### Requirement: System searches web for information sources

The system SHALL search the web using configured search engines to find relevant information sources.

#### Scenario: Search with Google Custom Search
- **WHEN** GOOGLE_CUSTOM_SEARCH_API_KEY is configured
- **THEN** system uses Google Custom Search API
- **AND** searches for each subtask independently
- **AND** returns up to MAX_SEARCH_RESULTS sources

#### Scenario: Search with DuckDuckGo fallback
- **WHEN** Google API is not configured or fails
- **THEN** system automatically switches to DuckDuckGo
- **AND** performs search without requiring API key

#### Scenario: Search progress updates
- **WHEN** system completes search for each subtask
- **THEN** system emits 'sources_update' SSE event
- **AND** event contains current source count and domain distribution

#### Scenario: Search completion
- **WHEN** all subtasks have been searched
- **THEN** system emits 'sources_complete' SSE event
- **AND** event contains full list of source URLs with metadata (title, snippet, domain)

---

### Requirement: System scrapes and extracts web page content

The system SHALL fetch and extract meaningful content from discovered web pages.

#### Scenario: Content extraction with Trafilatura
- **WHEN** system receives source URLs from search
- **THEN** system attempts to extract content using Trafilatura library
- **AND** limits content to MAX_CONTENT_LENGTH characters

#### Scenario: Fallback to BeautifulSoup
- **WHEN** Trafilatura extraction fails or returns no content
- **THEN** system falls back to BeautifulSoup extraction
- **AND** extracts all text content from HTML

#### Scenario: Scraping progress indication
- **WHEN** system starts scraping each source
- **THEN** system emits 'source_read' SSE event
- **AND** event contains source title and URL

#### Scenario: Scraping timeout
- **WHEN** web request exceeds WEB_SCRAPER_TIMEOUT seconds
- **THEN** system aborts request and moves to next source
- **AND** logs timeout error without failing entire research

#### Scenario: Scraping failure handling
- **WHEN** source returns 403, 404, or 500 error
- **THEN** system skips that source and continues
- **AND** does not interrupt research process

---

### Requirement: System analyzes content and generates comprehensive response

The system SHALL use an LLM to synthesize information from scraped sources into a comprehensive answer.

#### Scenario: Content synthesis
- **WHEN** system has scraped content from all sources
- **THEN** system sends content and original query to LLM
- **AND** requests comprehensive analysis

#### Scenario: Streaming response
- **WHEN** LLM generates response
- **THEN** system emits 'content_chunk' SSE events
- **AND** each event contains incremental response text
- **AND** frontend displays text in real-time

#### Scenario: Analysis completion
- **WHEN** LLM completes response generation
- **THEN** system emits 'research_complete' SSE event
- **AND** hides progress indicators

---

### Requirement: System displays research process and sources

The system SHALL provide visual feedback about the research process and allow users to trace information sources.

#### Scenario: Thought process visualization
- **WHEN** research is in progress
- **THEN** system displays ThoughtProcessCard component
- **AND** shows query decomposition steps

#### Scenario: Research status updates
- **WHEN** system emits 'status' SSE events
- **THEN** system displays ResearchStatusCard with current status message
- **AND** updates message as research progresses

#### Scenario: Source list display
- **WHEN** research completes
- **THEN** system displays SourcesList component
- **AND** shows all scraped sources with clickable URLs
- **AND** groups sources by domain

#### Scenario: Source metadata
- **WHEN** user views source list
- **THEN** each source shows title, URL, snippet, and domain
- **AND** sources are sorted by relevance

---

### Requirement: User can cancel ongoing research

The system SHALL allow users to abort research at any time without data loss.

#### Scenario: Research cancellation
- **WHEN** user clicks cancel button during research
- **THEN** system aborts AbortController
- **AND** stops all in-progress requests

#### Scenario: Partial results preservation
- **WHEN** research is cancelled
- **THEN** system preserves partial response if any content was generated
- **AND** appends "[Research stopped by user]" marker

#### Scenario: Clean state after cancellation
- **WHEN** research is cancelled
- **THEN** system resets loading state
- **AND** hides progress indicators
- **AND** allows new research to be started

---

### Requirement: System handles errors gracefully

The system SHALL handle all error conditions without crashing and provide meaningful error messages.

#### Scenario: LLM API error
- **WHEN** LLM API returns error during decomposition or synthesis
- **THEN** system displays error message to user
- **AND** includes error type and description

#### Scenario: Search engine error
- **WHEN** both Google and DuckDuckGo fail
- **THEN** system displays "Search failed" error
- **AND** suggests retrying or checking network

#### Scenario: All scrapes failed
- **WHEN** all web scraping attempts fail
- **THEN** system falls back to using search snippets only
- **AND** continues with analysis based on available data

#### Scenario: Network timeout
- **WHEN** network request times out
- **THEN** system logs timeout error
- **AND** continues with remaining sources
- **AND** does not block user interface

---

### Requirement: Research data is persisted with message

The system SHALL store research metadata alongside the assistant's response for future reference.

#### Scenario: Research data storage
- **WHEN** research completes
- **THEN** system saves message with research_data JSONB field
- **AND** includes thoughts array, sources array, and sourceUrls array

#### Scenario: Research data retrieval
- **WHEN** user loads conversation with research messages
- **THEN** system displays ThoughtProcessCard and SourcesList
- **AND** restores full research context

#### Scenario: Research metrics
- **WHEN** research completes
- **THEN** system stores performance metrics in research_data
- **AND** includes query_decomposition, search_duration_ms, scrape_duration_ms, analysis_duration_ms
