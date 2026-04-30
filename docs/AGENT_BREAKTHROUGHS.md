# Agent 技术难点突破记录

> 记录 Company Agent / Index Agent 开发中遇到的关键技术问题、排查思路和解决方案。
> 每条记录格式：**问题** → **结果** → **方法**
>
> 分为两部分：**系统级架构难点**（长期设计决策）和 **实战 Bug 修复**（具体问题排查）

---

## 系统级架构难点

### S1. 7-Gate ReAct Pipeline — 工具调用循环控制

**问题（难点）**

Company Agent 的每个 Gate 是一个完整的 ReAct 循环（思考→工具调用→观察→再思考），但 LLM 可能陷入无限工具调用循环、超时不结论、或输出过短的退化行为。需要在"给 Agent 自由度"和"确保收敛"之间平衡。

**结果（Before → After）**

| | Before | After |
|---|--------|-------|
| 工具调用控制 | 无限制，LLM 可能死循环 | ToolBudget: max_searches=6, max_rounds=5, max_tool_calls=10, timeout=180s |
| 输出质量 | 可能返回空或极短结论 | 输出 <200 字符时强制追加一轮 LLM 调用要求完整结论 |
| 超时处理 | 无 | 每轮检查剩余时间，≤0 则中断；asyncio.wait_for 保底 5s 宽限 |
| 预算耗尽行为 | 无 — 继续调用 | 注入 system 提示"预算已用完，请直接给出结论" |

**方法（思路 + 方法）**

- **ToolBudget 硬约束**：每个 gate 分配独立预算（Gate 7 为 0 工具 / 1 轮 / 300s），从源头防止失控
- **隐式结论兜底**：Agent 未产出 `<conclude>` 标签时，将已积累文本拼接为 raw 输出，保证不返回空
- **流式分块输出**：每积累 80 字符才 emit 一次 SSE 事件（`_STREAM_CHUNK_SIZE=80`），减少网络开销
- **工具效率评分**：`tool_efficiency_score = 返回 >100 字符的工具次数 / 总工具次数`，用于后续质量评估

**关键文件**：`backend/uteki/domains/company/skill_runner.py` — `GateExecutor`, `ToolBudget`

---

### S2. 跨 Gate 上下文分层传递 — 信息密度 vs 完整性

**问题（难点）**

7 个 Gate 依次执行，后续 Gate 需要前序 Gate 的结论作为输入。但如果每个 Gate 都传完整原文，Gate 7 的 prompt 会超过模型上下文窗口。如何在"信息压缩"和"不丢关键细节"之间取舍？

**结果（Before → After）**

| | Before | After |
|---|--------|-------|
| Gate 2-6 输入 | 无前序上下文 | 摘要模式：核心结论 + top 5 关键发现 + 置信度 |
| Gate 7 输入 | 无前序上下文 | 完整模式：全部 6 gate 原文 + 反思结果 |
| 反思结果 | 无 | Gate 3/5 后执行反思，矛盾/建议注入后续所有 gate |
| 失败 gate 处理 | 中断流程 | 标记为"数据不足"，Gate 7 仍可基于其他 gate 综合判断 |

**方法（思路 + 方法）**

- **PipelineContext 双模式**：`_summary_context()` 给 Gate 2-6（精简），`_full_context()` 给 Gate 7（完整）
- **Reflection Checkpoints**：Gate 3 和 Gate 5 后触发反思检查，检测跨 gate 矛盾（如 Gate 1 说"高增长"但 Gate 3 说"营收下滑"）
- **Downstream Hints**：反思产出的修正建议累积到全局 hints 列表，自动注入后续所有 gate 的 prompt
- **GateResult.summary 降级**：优先用 `core_conclusion`，无则截取 raw 前 800 字符

**关键文件**：`backend/uteki/domains/agent/core/context.py` — `PipelineContext`

---Error: Error code: 401 - {'error': {'message': 'Invalid token: LjEXAaCOFZEsnAEXE8D2C1254c554443B6915b199d95DdDb (tid: 2026042308333972371270247749754)', 'type': 'Aihubmix_api_error'}}

### S3. Arena 多模型并发投票 — 7 模型同时跑 + 交叉评审

**问题（难点）**

Index Agent 的 Arena 机制需要 7 个 LLM 模型并发执行完整分析 pipeline，然后交叉投票评审。难点：
- 7 个并发 LLM 调用，每个可能超时/失败
- 投票阶段依赖所有模型的输出，但不能因一个模型失败而阻塞
- 每个模型需要独立 DB session（并发写入冲突）
- API key 管理混乱（Admin DB / legacy / hardcoded 三套来源）

**结果（Before → After）**

| | Before | After |
|---|--------|-------|
| 执行方式 | 串行，1 个模型跑完再跑下一个 | `asyncio.gather()` 7 模型并发 |
| 超时策略 | 无 | 双重超时：首次 60s + 重试 90s（延长 50%）|
| 降级策略 | 无 | Pipeline 失败 → 降级为 single-shot 单次调用 |
| 模型配置 | 硬编码 | 三级优先：Admin DB（加密）→ legacy agent_memory → 默认配置，60s 缓存 |

**方法（思路 + 方法）**

- **3-Phase Pipeline**：Decide（并发分析）→ Vote（交叉评审）→ Tally（计票选优），每阶段保存 `pipeline_state` 到 DB，支持断点恢复
- **独立 DB Session**：每个模型通过 `db_manager.get_postgres_session()` 获取独立 session，避免并发写入冲突
- **Pipeline Fallback**：模型执行完整 4-skill pipeline 超时后，降级为单次 LLM 调用，确保至少有输出
- **Token 估算**：LLM 未返回 usage 时，使用 `len(text) // 4` 粗估 token 数，用于成本计算

**关键文件**：`backend/uteki/domains/index/services/arena_service.py`

---

### S4. 多 LLM Provider 统一适配 — 8 家 API 一个接口

**问题（难点）**

系统需要支持 OpenAI / Anthropic / DeepSeek / Qwen / Google / MiniMax / Doubao 共 8 家 LLM，每家的 API 格式、消息结构、特殊模型行为（推理模型、thinking 模式）完全不同。如何用一个统一接口屏蔽差异？

**结果（Before → After）**

| | Before | After |
|---|--------|-------|
| 调用方式 | 每家 Provider 单独写调用逻辑 | `LLMAdapterFactory.create()` → `adapter.chat()` 统一接口 |
| 消息格式 | 不统一 | `LLMMessage(role, content)` 统一 → 各 provider 内部转换 |
| 推理模型 | 不支持 | 自动检测 o1/o3/deepseek-reasoner/claude-thinking，调整参数 |
| API key 管理 | 8 套 key | AIHubMix 统一网关，1 个 key 覆盖所有 |

**方法（思路 + 方法）**

- **Adapter Pattern**：`LLMConfig` + `LLMMessage` 统一数据结构，各 Provider 实现 `convert_messages()` / `convert_tools()`
- **推理模型特殊处理**：
  - OpenAI o-series：禁 temperature，用 `max_completion_tokens` 替代 `max_tokens`，提取 `reasoning_content`
  - DeepSeek reasoner：禁 streaming，禁 temperature
  - Claude thinking：temperature 强制为 1，`thinking.budget_tokens` 控制预算
- **AIHubMix 网关**：所有模型通过 OpenAI-compatible 端点路由，`_MODEL_NAME_MAP` 自动映射 legacy 名称
- **JSON mode 差异**：OpenAI 支持 `response_format: json`，Anthropic 不支持 → 静默忽略

**关键文件**：`backend/uteki/domains/agent/llm_adapter.py` — `LLMAdapterFactory`, `OpenAIAdapter`, `AnthropicAdapter`

---

### S5. SSE 流式分析 + 断线重连 — 10 分钟长连接可靠性

**问题（难点）**

Company Agent 分析耗时 5-10 分钟，使用 SSE（Server-Sent Events）实时推送进度。但浏览器/网络可能中途断连，必须：
- Pipeline 在后台继续执行，不因客户端断开而中止
- 客户端重连后能回放已完成的 gate 结果 + 接收后续实时事件
- 不能丢失任何 gate 的分析结果

**结果（Before → After）**

| | Before | After |
|---|--------|-------|
| 断连行为 | Pipeline 随连接中断 | `asyncio.create_task()` 独立运行，客户端断开不影响 |
| 重连 | 无法重连，需重新分析 | `/tasks/{id}/stream` 端点：DB 回放已完成 gate + Redis Pub/Sub 接收后续 |
| 事件持久化 | 仅 SSE 内存队列 | 双写：SSE queue + Redis publish + DB 持久化 |
| 完成通知 | 无 | Notification service 推送分析完成消息 |

**方法（思路 + 方法）**

- **Fire-and-Forget Task**：SSE endpoint 立即创建 async task 并返回事件流，task 内部通过 `queue.put_nowait()` 推送事件
- **三重事件发布**：每个 gate_complete 事件同时写入 (1) 客户端 SSE queue (2) Redis channel (3) PostgreSQL
- **重连 3 阶段**：Phase 1 从 DB 回放 → Phase 2 订阅 Redis 接收实时 → Phase 3 检查完成状态
- **Queue Sentinel**：Pipeline 完成时向 queue 放入 `None` 作为 EOF 信号；但若 task 崩溃未放 sentinel，客户端会永久挂起（已知边界问题）

**关键文件**：`backend/uteki/domains/company/api.py` — `analyze_company_stream()`, `reconnect_task_stream()`

---

### S6. Agent 记忆系统 — 双写 + 自动压缩

**问题（难点）**

Agent 需要持久化记忆（历史决策、反思、经验），支持按 agent_key 区分共享/私有记忆。但 Supabase 作为主存储可能不可用，需要 PostgreSQL fallback。同时记忆不能无限增长。

**结果（Before → After）**

| | Before | After |
|---|--------|-------|
| 存储 | 仅内存 | Supabase 主 + PostgreSQL 备，双写 |
| 隔离 | 无 | `agent_key` 区分 per-agent 私有 vs 共享记忆 |
| 增长控制 | 无 | experience 超过 30 条自动压缩，保留最新 10 条 + 1 条合并摘要 |
| 查询 | 无 | `get_summary()` 聚合最近决策 + 反思 + 经验 + arena 投票赢家 |

**方法（思路 + 方法）**

- **Dual-Write**：先写 Supabase，异步 `_backup_rows()` 写 PostgreSQL，Supabase 失败仅 warn 不阻塞
- **Memory Compression**：超过阈值时，保留最新 N 条，其余拼接为单条合并记忆，删除旧条目
- **分类查询**：5 种 category（decision / reflection / experience / arena_learning / arena_vote_reasoning），按需拉取
- **已知限制**：`supabase_available` 是启动时一次性检测，运行中 Supabase 宕机不会自动切换

**关键文件**：`backend/uteki/domains/index/services/memory_service.py`

---

## 实战 Bug 修复（2026-04-06）

### 1. Company Agent 缓存污染 — 分析 TSLA 返回 MSFT 结果

**问题（难点）**

用户分析 Tesla (TSLA)，返回的 7-gate 分析内容完全是 Microsoft (MSFT) 的业务模型、财务数据和护城河评估。Gate 1-6 的缓存结果被跨股票复用，导致严重的数据污染。

问题隐蔽性高：
- 分析流程正常执行，无报错
- Gate 7（final_verdict）不走缓存，所以最终格式正确，但内容基于错误的前置 gate 结论
- 只有用户仔细阅读分析文本才能发现异常

**结果（Before → After）**

| | Before | After |
|---|--------|-------|
| 缓存 key | `company:gate:{model}:{gate}:{prompt_hash}` | `company:gate:{symbol}:{model}:{gate}:{prompt_hash}` |
| 跨股票隔离 | 无 — 同一模型的不同股票共享缓存 | 有 — symbol 维度完全隔离 |
| 无 symbol 保护 | 无 — 返回错误结果 | 跳过缓存，强制重新分析 |
| PipelineContext | 只有 `company_data_text` | 新增 `symbol` 字段 |

**方法（思路 + 方法）**

1. **定位方向**：用户报告"分析TSLA返回MSFT"→ 两种可能：(a) 公司数据缓存（financials.py）返回了错误数据，(b) Gate 分析缓存（skill_runner.py）返回了错误结果

2. **排查 financials.py**：检查 `fetch_company_data()` 的缓存 key 为 `company:data:{symbol}`，key 构造正确，排除

3. **排查 skill_runner.py**：检查 `_get_gate_cache_key()` 方法：
   ```python
   # BUG: symbol 被提取了但从未使用！
   symbol = self.context.company_data_text[:50]  # 提取了
   return f"company:gate:{model}:{skill.gate_number}:{prompt_hash}"  # 没用上
   ```
   缓存 key 只有 3 个维度（model / gate_number / prompt_hash），**缺少 symbol**。同一模型分析不同股票时，gate 1-6 的 prompt 模板相同 → prompt_hash 相同 → 命中旧缓存

4. **修复**：
   - `PipelineContext` 新增 `symbol` 字段（从 `company_data["profile"]["symbol"]` 传入）
   - 缓存 key 加入 symbol 维度
   - 无 symbol 时返回 `None`，跳过缓存

5. **根因总结**：开发时 `symbol` 变量被提取但遗漏使用，属于典型的"写了一半忘了接上"的编码疏忽。Gate 缓存 TTL 为 24 小时，意味着首次分析后的 24 小时内，同模型的所有其他股票都会拿到第一个股票的结论。

**关键文件**：
- `backend/uteki/domains/company/skill_runner.py` — `_get_gate_cache_key()`
- `backend/uteki/domains/agent/core/context.py` — `PipelineContext`

---

### 2. Company Agent 7-Gate Pipeline 缓存策略设计

**问题（难点）**

Company Agent 的 7-gate 分析流程耗时 5-10 分钟（每个 gate 调用 LLM + 工具），相同股票短时间内重复分析造成资源浪费。需要在"性能"和"数据新鲜度"之间找平衡。

**结果（Before → After）**

| | Before | After |
|---|--------|-------|
| 重复分析 | 每次全量执行 7 gate | Gate 1-6 缓存 24h，Gate 7 始终重算 |
| 缓存粒度 | 无缓存 | 按 symbol × model × gate × prompt 版本 |
| 缓存隔离 | N/A | 不同股票、不同模型、不同 prompt 版本完全隔离 |

**方法（思路 + 方法）**

- Gate 1-6 是事实性分析（财务数据、行业地位、护城河等），短期内不会剧烈变化 → 适合缓存
- Gate 7 是综合判断（final_verdict），依赖前 6 gate 结论 + 当前市场情绪 → 不缓存
- 缓存 key 包含 `prompt_hash`（prompt 前 200 字符的 MD5），确保 prompt 版本更新后自动失效
- 使用 Redis cache-aside 模式，TTL 24 小时，非阻塞（缓存失败不影响分析流程）

---

### 3. TradingView iframe z-index 层叠上下文问题

**问题（难点）**

在 Company Agent 页面中，TradingView 的 K 线图使用 iframe 嵌入。iframe 创建了独立的层叠上下文（stacking context），导致页面上绝对定位的元素（搜索建议下拉框、浮动标签等）无法显示在 iframe 上方，即使设置了很高的 z-index 也无效。

**结果（Before → After）**

| | Before | After |
|---|--------|-------|
| 搜索建议 | 被 iframe 遮挡，不可见 | 改为向上展开（`bottom: '100%'`），避开 iframe 区域 |
| 推荐标签 | 在 iframe 上方不可见 | 移至左侧边栏 tab，避免与 iframe 重叠 |
| Line/K-Line 切换 | 无 | Line 模式使用原生 SVG 渲染，K-Line 使用 TradingView iframe |

**方法（思路 + 方法）**

- iframe 是浏览器级别的隔离容器，z-index 无法跨 iframe 边界生效
- 方案 1：将需要浮动的元素移到不与 iframe 重叠的位置（搜索建议向上弹出）
- 方案 2：将功能迁移到非重叠区域（推荐列表从 chart 区域移到左侧 sidebar tab）
- 方案 3：提供非 iframe 的替代渲染（Line 模式用原生 SVG，不存在层叠问题）

---

### 4. verdict 数据路径解析错误

**问题（难点）**

Company Agent 分析完成后，执行记录列表的 ACT（操作建议）列全部显示空白。Gate 7 的输出被正确生成但前端无法提取。

**结果（Before → After）**

| | Before | After |
|---|--------|-------|
| 数据路径 | `gateResults[7].parsed.action` | `gateResults[7].parsed.position_holding.action` |
| ACT 列 | 空白 | 正确显示 BUY/SELL/WATCH |
| conviction | 不显示 | 正确显示百分比 |

**方法（思路 + 方法）**

- Gate 7 的输出结构是嵌套的：`parsed` 下有 `position_holding` 子对象，其中才包含 `action`、`conviction`、`one_sentence` 等字段
- 前端直接访问 `parsed.action` 找不到值
- 通过检查实际 API 返回的 JSON 结构发现多了一层嵌套
- 修复：添加 `getTaskVerdict()` helper 函数，正确访问 `parsed.position_holding` 路径
