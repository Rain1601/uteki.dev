# Web Content Extraction Specification

## ADDED Requirements

### Requirement: System fetches web page HTML

The system SHALL retrieve HTML content from URLs with proper error handling.

#### Scenario: HTTP GET request
- **WHEN** system scrapes a URL
- **THEN** system sends GET request with custom User-Agent
- **AND** sets timeout to WEB_SCRAPER_TIMEOUT seconds

#### Scenario: User-Agent configuration
- **WHEN** system sends HTTP request
- **THEN** system uses realistic browser User-Agent
- **AND** User-Agent identifies as modern browser (Chrome/Firefox/Safari)

#### Scenario: Timeout handling
- **WHEN** request exceeds timeout
- **THEN** system aborts request
- **AND** logs timeout error
- **AND** returns None without crashing

#### Scenario: HTTP error codes
- **WHEN** server returns 403, 404, 500, or 503
- **THEN** system logs error code
- **AND** returns None
- **AND** does not retry

---

### Requirement: Content extraction uses primary strategy (Trafilatura)

The system SHALL attempt content extraction with Trafilatura first.

#### Scenario: Trafilatura extraction
- **WHEN** system receives HTML content
- **THEN** system calls trafilatura.extract(html)
- **AND** configures extraction for main content only

#### Scenario: Successful Trafilatura extraction
- **WHEN** Trafilatura returns non-empty content
- **THEN** system uses extracted content
- **AND** sets extraction_method to "trafilatura"

#### Scenario: Trafilatura failure
- **WHEN** Trafilatura returns None or empty string
- **THEN** system falls back to BeautifulSoup strategy
- **AND** logs fallback event

---

### Requirement: Content extraction uses fallback strategy (BeautifulSoup)

The system SHALL use BeautifulSoup when Trafilatura fails.

#### Scenario: BeautifulSoup extraction
- **WHEN** Trafilatura fails
- **THEN** system parses HTML with BeautifulSoup
- **AND** extracts all text content with get_text()

#### Scenario: BeautifulSoup cleaning
- **WHEN** extracting with BeautifulSoup
- **THEN** system removes script and style tags
- **AND** strips excessive whitespace
- **AND** normalizes line breaks

#### Scenario: BeautifulSoup success
- **WHEN** BeautifulSoup returns content
- **THEN** system uses extracted text
- **AND** sets extraction_method to "beautifulsoup"

---

### Requirement: Extracted content is cleaned and normalized

The system SHALL clean extracted content for LLM consumption.

#### Scenario: Content length limiting
- **WHEN** extracted content exceeds MAX_CONTENT_LENGTH
- **THEN** system truncates to MAX_CONTENT_LENGTH characters
- **AND** appends "[Content truncated]" marker

#### Scenario: Whitespace normalization
- **WHEN** content contains excessive whitespace
- **THEN** system collapses multiple spaces to single space
- **AND** removes leading/trailing whitespace
- **AND** normalizes line breaks to single newlines

#### Scenario: Special character handling
- **WHEN** content contains HTML entities
- **THEN** system decodes entities to Unicode characters
- **AND** removes null bytes and control characters

---

### Requirement: Extraction results include metadata

The system SHALL return structured extraction results.

#### Scenario: ScrapedContent structure
- **WHEN** system completes extraction
- **THEN** system returns ScrapedContent object with:
  - url: str (original URL)
  - content: str (extracted text)
  - title: Optional[str] (page title)
  - extraction_method: str (trafilatura/beautifulsoup)
  - timestamp: datetime (when scraped)

#### Scenario: Title extraction
- **WHEN** HTML contains <title> tag
- **THEN** system extracts and includes title
- **AND** cleans title of extra whitespace

#### Scenario: Missing title
- **WHEN** HTML has no <title> tag
- **THEN** system sets title to None
- **AND** continues without error

---

### Requirement: Multiple pages can be scraped concurrently

The system SHALL support concurrent scraping for performance.

#### Scenario: Parallel scraping
- **WHEN** system receives list of URLs
- **THEN** system scrapes up to MAX_CONCURRENT_SCRAPES concurrently
- **AND** uses asyncio.gather() for parallel execution

#### Scenario: Progress tracking
- **WHEN** scraping multiple URLs
- **THEN** system emits progress event after each completion
- **AND** includes current count and total count

---

### Requirement: Scraping respects robots.txt (optional)

The system SHALL optionally check robots.txt before scraping.

#### Scenario: Robots.txt checking enabled
- **WHEN** RESPECT_ROBOTS_TXT is True
- **THEN** system fetches and parses robots.txt
- **AND** skips disallowed URLs

#### Scenario: Robots.txt checking disabled
- **WHEN** RESPECT_ROBOTS_TXT is False (default)
- **THEN** system scrapes all URLs regardless of robots.txt

---

### Requirement: Scraping errors are logged and handled

The system SHALL handle all scraping errors gracefully.

#### Scenario: Connection error
- **WHEN** network connection fails
- **THEN** system logs connection error
- **AND** returns None for that URL
- **AND** continues with remaining URLs

#### Scenario: SSL/TLS error
- **WHEN** SSL certificate validation fails
- **THEN** system logs SSL error
- **AND** optionally retries with verify=False (if configured)
- **AND** returns None if retry fails

#### Scenario: Encoding error
- **WHEN** HTML has invalid encoding
- **THEN** system attempts detection with chardet
- **AND** falls back to 'utf-8' with errors='ignore'

#### Scenario: Extraction failure
- **WHEN** both Trafilatura and BeautifulSoup fail
- **THEN** system logs extraction failure
- **AND** returns ScrapedContent with empty content
- **AND** continues without crashing

---

### Requirement: Scraped content is cached (optional)

The system SHALL optionally cache scraped content to avoid re-fetching.

#### Scenario: Cache hit
- **WHEN** URL has been scraped within cache TTL
- **THEN** system returns cached content
- **AND** does not make new HTTP request

#### Scenario: Cache miss
- **WHEN** URL not in cache or cache expired
- **THEN** system fetches and extracts content
- **AND** stores in cache with TTL

#### Scenario: Cache disabled
- **WHEN** ENABLE_CONTENT_CACHE is False (default)
- **THEN** system always fetches fresh content

---

### Requirement: Scraping statistics are collected

The system SHALL track scraping performance metrics.

#### Scenario: Success rate tracking
- **WHEN** scraping completes
- **THEN** system tracks:
  - Total URLs attempted
  - Successful extractions
  - Failed extractions
  - Success rate percentage

#### Scenario: Performance metrics
- **WHEN** scraping completes
- **THEN** system tracks:
  - Average time per URL
  - Total time elapsed
  - Fastest/slowest URL

#### Scenario: Method distribution
- **WHEN** scraping completes
- **THEN** system tracks:
  - Trafilatura successes
  - BeautifulSoup fallbacks
  - Total failures

---

### Requirement: Scraper configuration is flexible

The system SHALL support configuration via environment variables.

#### Scenario: Timeout configuration
- **WHEN** WEB_SCRAPER_TIMEOUT is set
- **THEN** system uses specified timeout value
- **AND** applies to all HTTP requests

#### Scenario: Content length configuration
- **WHEN** MAX_CONTENT_LENGTH is set
- **THEN** system truncates content to specified length

#### Scenario: Concurrent limit configuration
- **WHEN** MAX_CONCURRENT_SCRAPES is set
- **THEN** system limits parallel scrapes to specified value

#### Scenario: Default configuration
- **WHEN** environment variables not set
- **THEN** system uses sensible defaults:
  - WEB_SCRAPER_TIMEOUT = 10 seconds
  - MAX_CONTENT_LENGTH = 3000 characters
  - MAX_CONCURRENT_SCRAPES = 5
