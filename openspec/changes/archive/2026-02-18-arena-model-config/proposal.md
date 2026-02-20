## Why

Arena 的模型列表目前硬编码在 `arena_service.py` 的 `ARENA_MODELS` 常量中，模型参数（temperature/max_tokens）也硬编码在各个 pipeline phase 里。添加、移除、调整模型需要改代码重启服务。Settings tab 缺少模型管理 UI。需要让用户通过前端配置模型列表和参数，持久化到 DB，并在 Arena 运行时生效。

## What Changes

- 在 Settings tab 添加 **Models** 子 tab，展示当前配置的模型列表
- 支持添加/编辑/删除/启用禁用模型
- 每个模型可配置：provider、model_name、api_key（加密存储）、base_url（可选）、temperature、max_tokens、enabled
- 模型配置持久化到 `AgentMemory` 表（category=`model_config`，agent_key=`system`），与现有 agent_config 模式一致
- Arena 运行时从 DB 读取模型配置（取代硬编码的 `ARENA_MODELS`），不再需要环境变量的 API key 作为唯一来源
- 保留环境变量作为 fallback：DB 无配置时回退到 `ARENA_MODELS` + env keys

## Capabilities

### New Capabilities
- `arena-model-config`: Arena 模型的 CRUD 管理、参数配置、持久化和运行时加载

### Modified Capabilities
_无需修改已有 spec。_

## Impact

- **后端**: `arena_service.py` — 模型加载逻辑从硬编码改为优先读 DB；新增 API endpoints 用于模型 CRUD
- **后端**: `api.py` — 新增 3-4 个 model config endpoints
- **前端**: `SettingsPanel.tsx` — 新增 Models tab
- **前端**: `api/index.ts` — 新增类型和 fetch 函数
- **数据**: 复用 `AgentMemory` 表，无需新建模型
