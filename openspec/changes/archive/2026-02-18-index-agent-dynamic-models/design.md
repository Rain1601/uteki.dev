## Context

`arena-model-config` 变更已将 Arena 的模型配置从硬编码迁移到 DB（`AgentMemory`, category=`model_config`, agent_key=`system`），并提供 Settings > Models UI 管理。但 Index Agent 的其他三个 LLM 消费方仍硬编码模型列表：

1. **Agent Chat** (`agent_service.py:121-127`) — `_get_all_adapters()` 内联 6 个 provider/model 元组
2. **Reflection** (`reflection_service.py:201-215`) — `_get_adapter()` 只尝试 Anthropic + OpenAI
3. **Backtest** (`agent_backtest_service.py:84-94`) — import `ARENA_MODELS` 查找 API key

前端 `ArenaView.tsx:46-53` 的 `KNOWN_MODELS` 常量用于 Arena 运行中的占位卡片，也是硬编码。

## Goals / Non-Goals

**Goals:**
- 上述 4 处统一从 DB model_config 加载模型列表
- 保留 env key fallback（DB 无配置时行为不变）
- Agent Chat 只使用第一个可用模型（当前逻辑不变，只是数据来源改为 DB）
- 前端 ArenaView 在开始 Arena 前从 API 获取已配置的模型列表

**Non-Goals:**
- 不改变对话 Agent（`uteki/domains/agent/`）的模型选择逻辑
- 不增加新 API endpoint（复用已有 `GET /model-config`）
- 不修改 LLMAdapter 接口

## Decisions

### D1: 抽取公共 model loader 函数

**选择**: 在 `arena_service.py` 中已有 `_load_models_from_db(session)` 是 ArenaService 实例方法。将其抽取为模块级函数 `load_models_from_db(session)` 供其他服务调用。

**理由**: 避免每个服务重复实现 DB 查询 + JSON 解析 + enabled 过滤逻辑。

### D2: Agent Chat — 从 DB 加载可用模型

**选择**: `_get_all_adapters()` 改为 async，先调 `load_models_from_db(session)` 获取模型列表，若为空则 fallback 到现有 env key 硬编码列表。

**理由**: 与 Arena 的 fallback 策略一致。Agent Chat 只取第一个成功的 adapter，所以列表顺序 = 优先级。

### D3: Reflection — 从 DB 加载

**选择**: `_get_adapter()` 改为 async，先尝试 DB 模型列表的第一个可用模型，fallback 到 env key。

### D4: Backtest — 从 DB 加载

**选择**: 删除 `from arena_service import ARENA_MODELS`，改为先从 DB 查找模型 config，fallback 到 `ARENA_MODELS`。

### D5: ArenaView — 动态加载模型列表

**选择**: 组件 mount 时调用 `fetchModelConfig()`，用返回的列表替代 `KNOWN_MODELS`。若 API 返回空则仍使用硬编码 fallback。

**理由**: Arena 进行中的占位卡片应显示实际配置的模型，而非硬编码的 6 个。

## Risks / Trade-offs

**额外 DB 查询** → Agent Chat 每次调用多一次 DB 查询。可接受：model_config 是单条小记录，查询 <1ms。

**ArenaView 首次 API 调用** → mount 时多一个 GET 请求。可接受：响应体很小，且可缓存到组件 state。
