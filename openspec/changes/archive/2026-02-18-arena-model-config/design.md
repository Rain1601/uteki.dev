## Context

Arena 模型配置当前硬编码在 `arena_service.py` 的 `ARENA_MODELS` 列表：
```python
ARENA_MODELS = [
    {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "api_key_attr": "anthropic_api_key"},
    ...
]
```
API key 从 `.env` 环境变量加载。模型参数（temperature=0, max_tokens=4096）硬编码在 pipeline 各阶段。

现有 `AgentMemory` 表用于存储 `agent_config`（JSON blob, category=`agent_config`, agent_key=`system`）。前端 Settings tab 有 Context / Schedules / Debug 三个子 tab，无模型管理。

## Goals / Non-Goals

**Goals:**
- 用户通过 Settings UI 管理 Arena 参与模型：增删改查、启用/禁用
- 每个模型可配置：provider、model、api_key、base_url、temperature、max_tokens、enabled
- 配置持久化到 DB，服务重启不丢失
- Arena 运行时优先从 DB 加载模型配置，DB 无配置时 fallback 到硬编码 `ARENA_MODELS` + env keys
- API key 在前端列表中掩码显示（`sk-...****`），编辑时可修改

**Non-Goals:**
- 不做 API key 加密存储（当前 AgentMemory.content 是明文 JSON，与 agent_config 一致）
- 不做模型在线可用性检测（ping/health check）
- 不修改 LLMAdapter 或 LLMConfig 的数据结构
- 不做 per-phase 参数配置（所有阶段统一使用模型的 temperature/max_tokens）

## Decisions

### D1: 存储方案 — AgentMemory JSON blob

**选择**: 使用现有 `AgentMemory` 表，`category="model_config"`, `agent_key="system"`，`content` 为 JSON 数组存储所有模型配置。

**理由**:
- 与 `agent_config` 存储模式完全一致，无需新建表/模型
- 单条记录存全部模型列表，CRUD 操作就是读/写整个 JSON
- AgentMemory 已有 user_id 字段，未来可扩展为多用户

**替代**: 新建 `ArenaModelConfig` 模型 — 更规范但引入迁移成本，当前模型数量 <10 个，JSON 足够。

### D2: API 设计 — 整体读写

**选择**: 两个端点：
- `GET /model-config` — 返回完整模型配置列表
- `PUT /model-config` — 整体保存（前端编辑后提交完整列表）

**理由**:
- 模型列表很短（<10 条），整体覆盖比单条 CRUD 简单得多
- 前端管理列表状态，一次性提交，减少请求数
- 与 `agent-config` 的 GET/PUT 模式完全一致

### D3: Arena 模型加载优先级

**选择**: `load_arena_models(session)` 方法：
1. 从 DB 读取 `model_config`
2. 如果有配置且至少 1 个 enabled → 使用 DB 配置
3. 否则 → fallback 到硬编码 `ARENA_MODELS` + env keys（现有逻辑）

**理由**:
- 零配置可用：首次部署不需要通过 UI 配置
- 用户配置后立即生效，无需重启
- 向后兼容

### D4: 前端 — Settings tab 新增 Models 子 tab

**选择**: 在 SettingsPanel 的 tabs 数组中新增 "Models" tab（放在 Context 之后），展示：
- 模型卡片列表（每个模型一个卡片）
- 每张卡片显示：provider logo + model name + enabled switch + 参数摘要
- 点击卡片展开/编辑
- 底部 "Add Model" 按钮
- 顶部 "Save" 按钮（提交整个列表到 PUT /model-config）

**Provider 选项**: 下拉选择，选项与 `LLMProvider` 枚举一致（anthropic / openai / deepseek / google / qwen / minimax）。选中 provider 后自动填充默认 model name 和 base_url。

### D5: 模型参数默认值

每个 provider 提供合理的默认值，用户可覆盖：

| Provider | Default Model | Default base_url | Default temperature | Default max_tokens |
|----------|---------------|-------------------|--------------------|--------------------|
| anthropic | claude-sonnet-4-20250514 | — | 0 | 4096 |
| openai | gpt-4o | — | 0 | 4096 |
| deepseek | deepseek-chat | https://api.deepseek.com | 0 | 4096 |
| google | gemini-2.5-pro-thinking | — | 0 | 4096 |
| qwen | qwen-plus | https://dashscope.aliyuncs.com/compatible-mode/v1 | 0 | 4096 |
| minimax | MiniMax-Text-01 | https://api.minimax.chat/v1 | 0 | 4096 |

## Risks / Trade-offs

**明文 API Key** → `AgentMemory.content` 中 API key 以明文 JSON 存储。可接受因为：这是单用户自部署应用，DB 只有本地访问。未来可升级为加密。

**整体覆盖** → PUT 操作覆盖整个模型列表。如果两个客户端同时编辑会丢失其中一个的修改。可接受因为：单用户应用，不会有并发编辑场景。

**API Key 掩码** → 前端显示 `sk-...****`，但 GET 接口返回完整 key。如果 GET 被拦截则暴露 key。可接受因为：本地部署，API 请求不经过公网。
