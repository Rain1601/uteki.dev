# Conversation History Migration Specification

## ADDED Requirements

### Requirement: System identifies source and target databases

The migration SHALL connect to both uchu_trade SQLite and uteki.open PostgreSQL databases.

#### Scenario: SQLite connection
- **WHEN** migration script starts
- **THEN** system connects to uchu_trade SQLite database
- **AND** verifies database file exists and is readable

#### Scenario: PostgreSQL connection
- **WHEN** migration script starts
- **THEN** system connects to uteki.open PostgreSQL
- **AND** verifies agent.chat_conversations and agent.chat_messages tables exist

#### Scenario: Connection failure handling
- **WHEN** either database connection fails
- **THEN** system displays clear error message
- **AND** exits without attempting migration

---

### Requirement: Migration supports dry-run mode

The system SHALL provide a dry-run option to validate migration without modifying data.

#### Scenario: Dry-run execution
- **WHEN** migration runs with --dry-run flag
- **THEN** system performs all read operations
- **AND** validates data mappings
- **AND** reports what would be migrated
- **AND** does NOT write to PostgreSQL

#### Scenario: Dry-run report
- **WHEN** dry-run completes
- **THEN** system displays:
  - Total conversations to migrate
  - Total messages to migrate
  - Any data quality issues found
  - Estimated migration time

---

### Requirement: System backs up existing data

The migration SHALL create backups before modifying any data.

#### Scenario: SQLite backup
- **WHEN** migration starts (not in dry-run mode)
- **THEN** system creates timestamped copy of SQLite database
- **AND** verifies backup file integrity

#### Scenario: PostgreSQL backup
- **WHEN** target tables have existing data
- **THEN** system warns user about existing data
- **AND** prompts for confirmation to proceed

---

### Requirement: Conversations are migrated with metadata

The system SHALL migrate all conversation records with full metadata preservation.

#### Scenario: Conversation data mapping
- **WHEN** system migrates conversations
- **THEN** system maps SQLite fields to PostgreSQL:
  - id → id (UUID preserved or generated)
  - title → title
  - created_at → created_at
  - updated_at → updated_at
  - user_id → user_id (if exists)
  - mode → mode (chat/research/trading)

#### Scenario: Missing field handling
- **WHEN** SQLite conversation lacks a field
- **THEN** system uses sensible defaults:
  - user_id → NULL
  - mode → "chat"
  - is_archived → false

#### Scenario: Batch processing
- **WHEN** migrating large number of conversations
- **THEN** system processes in batches of 100
- **AND** displays progress percentage

---

### Requirement: Messages are migrated with content integrity

The system SHALL migrate all message records while preserving content exactly.

#### Scenario: Message data mapping
- **WHEN** system migrates messages
- **THEN** system maps SQLite fields to PostgreSQL:
  - id → id
  - conversation_id → conversation_id (foreign key)
  - role → role (user/assistant/system)
  - content → content (exact text)
  - created_at → created_at
  - llm_provider → llm_provider
  - llm_model → llm_model

#### Scenario: Content encoding preservation
- **WHEN** message contains special characters or unicode
- **THEN** system preserves exact encoding
- **AND** validates no data corruption occurred

---

### Requirement: Research-specific data is migrated

The system SHALL extract and migrate Deep Research metadata from uchu_trade messages.

#### Scenario: Research data extraction
- **WHEN** message in SQLite contains research metadata
- **THEN** system extracts thoughts, sources, and sourceUrls
- **AND** stores in research_data JSONB field

#### Scenario: Research data structure
- **WHEN** migrating research data
- **THEN** system creates JSONB object:
  ```json
  {
    "thoughts": ["string array"],
    "sources": [{"domain": "string", "count": number}],
    "sourceUrls": [{
      "title": "string",
      "url": "string",
      "snippet": "string",
      "source": "string"
    }]
  }
  ```

#### Scenario: Non-research messages
- **WHEN** message has no research data
- **THEN** system sets research_data to NULL
- **AND** continues without error

---

### Requirement: Data integrity is validated

The system SHALL verify data integrity after migration.

#### Scenario: Record count validation
- **WHEN** migration completes
- **THEN** system compares record counts:
  - SQLite conversations = PostgreSQL conversations
  - SQLite messages = PostgreSQL messages

#### Scenario: Sample data verification
- **WHEN** migration completes
- **THEN** system randomly samples 10 conversations
- **AND** verifies all messages migrated correctly
- **AND** checks content matches exactly

#### Scenario: Foreign key integrity
- **WHEN** migration completes
- **THEN** system verifies all message.conversation_id references exist
- **AND** reports any orphaned messages

---

### Requirement: Migration handles errors gracefully

The system SHALL handle errors without data corruption.

#### Scenario: Partial failure recovery
- **WHEN** migration fails mid-process
- **THEN** system rolls back PostgreSQL transaction
- **AND** leaves SQLite untouched
- **AND** logs exact error location

#### Scenario: Duplicate handling
- **WHEN** target database already contains some conversations
- **THEN** system detects duplicates by ID
- **AND** either skips or overwrites based on --force flag

#### Scenario: Error reporting
- **WHEN** any error occurs
- **THEN** system logs:
  - Error type and message
  - Source record ID
  - Timestamp
  - Stack trace (if applicable)

---

### Requirement: Migration progress is trackable

The system SHALL provide real-time progress feedback.

#### Scenario: Progress updates
- **WHEN** migration is running
- **THEN** system displays:
  - Current phase (conversations/messages)
  - Records processed / total records
  - Percentage complete
  - Estimated time remaining

#### Scenario: Completion summary
- **WHEN** migration completes successfully
- **THEN** system displays summary:
  - Total conversations migrated
  - Total messages migrated
  - Total research messages migrated
  - Time elapsed
  - Any warnings or skipped records

---

### Requirement: Migration is idempotent

The system SHALL support running migration multiple times safely.

#### Scenario: Re-run migration
- **WHEN** migration is re-run on same database
- **THEN** system detects existing records
- **AND** skips already-migrated data (unless --force)

#### Scenario: Incremental migration
- **WHEN** new conversations added to SQLite after initial migration
- **THEN** system migrates only new records
- **AND** preserves existing migrated data

---

### Requirement: Original SQLite data is preserved

The migration SHALL NOT modify or delete source SQLite database.

#### Scenario: Read-only source access
- **WHEN** migration runs
- **THEN** system opens SQLite in read-only mode
- **AND** makes no modifications to source database

#### Scenario: Post-migration verification
- **WHEN** migration completes
- **THEN** SQLite database is unchanged
- **AND** remains accessible for rollback if needed
