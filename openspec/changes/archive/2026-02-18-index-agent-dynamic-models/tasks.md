## 1. Backend: 抽取公共 model loader

- [x] 1.1 在 `arena_service.py` 将 `ArenaService._load_models_from_db()` 抽取为模块级函数 `load_models_from_db(session)`，ArenaService 内部改为调用该函数
- [x] 1.2 更新 `__init__.py` 或直接 import，确保其他服务可以 `from arena_service import load_models_from_db`

## 2. Backend: Agent Chat 从 DB 加载模型

- [x] 2.1 修改 `agent_service.py` 的 `chat()` 方法接收 `session` 参数
- [x] 2.2 修改 `_get_all_adapters()` 为 async，先调用 `load_models_from_db(session)` 获取 DB 模型列表
- [x] 2.3 DB 模型列表非空时从中创建 adapters（使用 model 的 api_key、base_url、temperature、max_tokens）；为空时 fallback 到现有 env key 硬编码列表
- [x] 2.4 更新 `api.py` 中 agent chat endpoint 传入 session

## 3. Backend: Reflection 从 DB 加载模型

- [x] 3.1 修改 `reflection_service.py` 的 `_get_adapter()` 为 async，接收 session 参数
- [x] 3.2 先调用 `load_models_from_db(session)` 取第一个可用模型创建 adapter；为空时 fallback 到现有 Anthropic/OpenAI env key 逻辑

## 4. Backend: Backtest 从 DB 加载模型

- [x] 4.1 修改 `agent_backtest_service.py` 查找模型 API key 的逻辑：先从 `load_models_from_db(session)` 查找匹配的 provider+model
- [x] 4.2 未在 DB 找到时 fallback 到 `ARENA_MODELS` 查找

## 5. Frontend: ArenaView 动态加载模型列表

- [x] 5.1 在 `ArenaView.tsx` 组件 mount 时调用 `fetchModelConfig()` 获取已配置模型列表
- [x] 5.2 用 API 返回的列表替代硬编码 `KNOWN_MODELS`（API 返回空时保留硬编码 fallback）

## 6. Verification

- [ ] 6.1 在 Settings > Models 配置 3 个模型 → Agent Chat 使用 DB 配置的第一个模型
- [ ] 6.2 DB 无配置时 → Agent Chat 使用 env key fallback（行为不变）
- [ ] 6.3 ArenaView 占位卡片数量与 DB 配置的模型数量一致
- [x] 6.4 TypeScript 编译无新增错误
