## 1. Backend: Model Config API Endpoints

- [x] 1.1 在 `api.py` 添加 `GET /model-config` endpoint：从 AgentMemory (category=`model_config`, agent_key=`system`) 读取 JSON 列表，无记录时返回空数组
- [x] 1.2 在 `api.py` 添加 `PUT /model-config` endpoint：接收 `{models: [...]}` body，覆盖写入 AgentMemory，返回保存后的列表
- [x] 1.3 在 `schemas.py` 添加 `ModelConfigUpdateRequest` schema（包含 models 数组字段）

## 2. Backend: Arena 从 DB 加载模型配置

- [x] 2.1 在 `arena_service.py` 添加 `_load_models_from_db(session)` 方法：读取 model_config AgentMemory → 解析 JSON → 返回 enabled=true 的模型列表
- [x] 2.2 修改 `arena_service.run()` 方法：在确定 active_models 前，优先调用 `_load_models_from_db`。若返回非空则使用 DB 配置；否则 fallback 到原有 ARENA_MODELS + env keys
- [x] 2.3 DB 配置中的模型使用 `api_key` 字段（而非 `api_key_attr` + env lookup），适配 LLMAdapterFactory 创建逻辑

## 3. Frontend: API Types & Fetch Functions

- [x] 3.1 在 `api/index.ts` 添加 `ModelConfig` 接口（provider, model, api_key, base_url?, temperature, max_tokens, enabled）
- [x] 3.2 添加 `fetchModelConfig()` 和 `saveModelConfig(models)` fetch 函数

## 4. Frontend: Models Tab in SettingsPanel

- [x] 4.1 在 SettingsPanel 的 tabs 数组中添加 "Models" tab（放在 Context 和 Schedules 之间）
- [x] 4.2 创建 Models tab 内容区：加载时调用 fetchModelConfig，渲染模型卡片列表
- [x] 4.3 每个模型卡片 collapsed 视图：provider logo (ModelLogo) + model name + enabled Switch + api_key 掩码 + 参数摘要（temp/max_tokens）
- [x] 4.4 模型卡片 expanded 视图：可编辑的表单字段 — provider Select、model TextField、api_key TextField、base_url TextField、temperature Slider/TextField、max_tokens TextField、Delete 按钮
- [x] 4.5 "Add Model" 按钮：弹出 provider 选择，选择后用 PROVIDER_DEFAULTS 填充新模型条目并追加到列表
- [x] 4.6 "Save" 按钮：调用 saveModelConfig 提交完整列表，显示 toast 反馈
- [x] 4.7 Provider 默认值常量 PROVIDER_DEFAULTS：6 个 provider 各自的默认 model、base_url、temperature、max_tokens

## 5. Verification

- [x] 5.1 GET /api/index/model-config → 返回空数组或已保存配置
- [x] 5.2 PUT /api/index/model-config → 保存配置后重新 GET 验证
- [ ] 5.3 Settings > Models tab → 添加模型 → 配置参数 → 保存 → 刷新页面数据仍在
- [ ] 5.4 配置模型后运行 Arena → 使用 DB 配置的模型（非硬编码列表）
- [x] 5.5 TypeScript 编译无新增错误
