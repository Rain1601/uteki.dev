## Why

Index Agent 的多个子服务（Agent Chat、Reflection、Backtest、Arena 前端占位卡片）仍然硬编码 LLM 模型列表。刚完成的 `arena-model-config` 变更已为 Arena 添加了 DB 模型配置和 Settings > Models UI，但其他子服务没有接入这个配置，导致用户在 Settings 中增删模型后，Agent Chat 仍用旧列表、Backtest 只识别硬编码模型、ArenaView 前端占位卡片与实际配置不一致。

## What Changes

- Agent Chat（`agent_service.py`）从 DB model_config 加载可用模型列表，不再硬编码 provider/model 列表
- Reflection（`reflection_service.py`）从 DB model_config 加载 LLM adapter，fallback 到 env keys
- Backtest（`agent_backtest_service.py`）从 DB model_config 查找模型 API key，不再依赖 `ARENA_MODELS` import
- ArenaView 前端（`ArenaView.tsx`）动态加载 DB 配置的模型列表替代硬编码 `KNOWN_MODELS`

## Capabilities

### New Capabilities
- `index-dynamic-models`: Index Agent 各子服务统一从 DB model_config 加载 LLM 模型列表，消除硬编码依赖

### Modified Capabilities
_无需修改已有 spec。_

## Impact

- **后端**: `agent_service.py` — `_get_all_adapters()` 改为从 DB 加载
- **后端**: `reflection_service.py` — `_get_adapter()` 改为从 DB 加载
- **后端**: `agent_backtest_service.py` — 查找 model API key 改为从 DB + ARENA_MODELS fallback
- **前端**: `ArenaView.tsx` — `KNOWN_MODELS` 改为调用 `fetchModelConfig()` 动态加载
