### Requirement: Model config CRUD via API
The system SHALL provide API endpoints to read and write the full Arena model configuration list.

#### Scenario: Read model config (has saved config)
- **WHEN** a GET request is made to `/api/index/model-config` and a saved config exists in DB
- **THEN** the response contains `{success: true, data: [...]}` with the full model config array

#### Scenario: Read model config (no saved config)
- **WHEN** a GET request is made to `/api/index/model-config` and no config is saved
- **THEN** the response contains `{success: true, data: []}` (empty array)

#### Scenario: Save model config
- **WHEN** a PUT request is made to `/api/index/model-config` with a JSON body `{models: [...]}`
- **THEN** the full model list is persisted to `AgentMemory` (category=`model_config`, agent_key=`system`) and the response contains the saved list

### Requirement: Model config schema
Each model config entry SHALL contain: provider (string), model (string), api_key (string), base_url (string, optional), temperature (number, 0-2), max_tokens (integer), enabled (boolean).

#### Scenario: Valid model config entry
- **WHEN** a model config with provider="anthropic", model="claude-sonnet-4-20250514", api_key="sk-xxx", temperature=0, max_tokens=4096, enabled=true is saved
- **THEN** the config is accepted and persisted

#### Scenario: Config with optional base_url
- **WHEN** a model config with provider="deepseek" includes base_url="https://api.deepseek.com"
- **THEN** the base_url is stored and used when creating the LLM adapter

### Requirement: Arena loads models from DB config
The Arena service SHALL load model configuration from DB as the primary source, falling back to the hardcoded `ARENA_MODELS` + env keys only when no DB config exists.

#### Scenario: DB config exists with enabled models
- **WHEN** an Arena run is triggered and the DB contains model configs with at least one enabled model
- **THEN** the Arena uses only the DB-configured models (ignoring hardcoded ARENA_MODELS)

#### Scenario: DB config empty — fallback
- **WHEN** an Arena run is triggered and no model config is saved in DB
- **THEN** the Arena falls back to hardcoded ARENA_MODELS with API keys from environment variables

#### Scenario: All DB models disabled — fallback
- **WHEN** all models in DB config have enabled=false
- **THEN** the Arena falls back to hardcoded ARENA_MODELS

### Requirement: Settings UI — Models tab
The Settings panel SHALL include a "Models" tab that displays and manages the Arena model configuration.

#### Scenario: View configured models
- **WHEN** the user navigates to Settings > Models
- **THEN** the UI displays a list of configured models, each showing provider logo, model name, enabled switch, and parameter summary

#### Scenario: Add a new model
- **WHEN** the user clicks "Add Model" and selects a provider
- **THEN** a new model entry is created with default values for that provider (model name, base_url, temperature=0, max_tokens=4096, enabled=true)

#### Scenario: Edit model parameters
- **WHEN** the user clicks on a model card to expand it
- **THEN** the user can edit provider, model name, api_key, base_url, temperature, max_tokens, and enabled

#### Scenario: Delete a model
- **WHEN** the user clicks the delete button on a model card
- **THEN** the model is removed from the list (not yet persisted until Save is clicked)

#### Scenario: Save configuration
- **WHEN** the user clicks the "Save" button
- **THEN** the entire model list is submitted to PUT /model-config, persisted to DB, and a success toast is shown

#### Scenario: API key masking
- **WHEN** a model has an api_key configured
- **THEN** the UI displays it masked (e.g., "sk-...xxxx") in the collapsed card view, but shows the full key in the edit form

### Requirement: Provider defaults
When adding a new model, the system SHALL pre-fill default values based on the selected provider.

#### Scenario: Select anthropic provider
- **WHEN** the user selects provider "anthropic" when adding a new model
- **THEN** the model name is pre-filled with "claude-sonnet-4-20250514", base_url is empty, temperature=0, max_tokens=4096
