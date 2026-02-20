## ADDED Requirements

### Requirement: Index services load models from DB config
All Index Agent sub-services (Agent Chat, Reflection, Backtest) SHALL load their LLM model configuration from DB (`AgentMemory`, category=`model_config`) as the primary source, falling back to environment variable-based hardcoded lists when no DB config exists.

#### Scenario: DB config exists — Agent Chat uses DB models
- **WHEN** Agent Chat is invoked and DB model_config contains enabled models with valid API keys
- **THEN** the chat adapter is created from the first available DB-configured model

#### Scenario: DB config empty — Agent Chat falls back to env keys
- **WHEN** Agent Chat is invoked and no model_config is saved in DB
- **THEN** the chat uses the hardcoded provider list with API keys from environment variables (existing behavior)

#### Scenario: DB config exists — Reflection uses DB models
- **WHEN** Reflection is triggered and DB model_config contains enabled models
- **THEN** the reflection adapter is created from the first available DB-configured model

#### Scenario: DB config exists — Backtest resolves model from DB
- **WHEN** an agent backtest is requested for a model that exists in DB config
- **THEN** the backtest uses the API key and config from DB (not from ARENA_MODELS)

#### Scenario: Backtest model not in DB — fallback to ARENA_MODELS
- **WHEN** a backtest is requested for a model not in DB config
- **THEN** the backtest falls back to looking up the model in hardcoded ARENA_MODELS

### Requirement: Shared model loader function
The system SHALL provide a shared `load_models_from_db(session)` function that reads, parses, and filters model_config from AgentMemory, usable by all Index services.

#### Scenario: load_models_from_db returns enabled models
- **WHEN** `load_models_from_db(session)` is called and DB contains model_config with 3 enabled and 1 disabled model
- **THEN** the function returns a list of 3 model dicts (only enabled ones with valid api_key)

#### Scenario: load_models_from_db returns empty on no config
- **WHEN** `load_models_from_db(session)` is called and no model_config record exists
- **THEN** the function returns an empty list

### Requirement: ArenaView dynamic model loading
The Arena UI SHALL dynamically load the configured model list from the API instead of using a hardcoded `KNOWN_MODELS` constant.

#### Scenario: Models loaded from API
- **WHEN** ArenaView mounts and `fetchModelConfig()` returns a non-empty model list
- **THEN** the placeholder cards during Arena runs display the API-loaded models

#### Scenario: API returns empty — fallback to defaults
- **WHEN** ArenaView mounts and `fetchModelConfig()` returns an empty list
- **THEN** the placeholder cards fall back to the hardcoded default model list
