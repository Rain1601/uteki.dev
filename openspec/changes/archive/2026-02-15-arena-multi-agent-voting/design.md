## Context

当前 Arena 系统通过 `ArenaService.run()` 并行调用 6 个 LLM，每个模型独立产出投资决策（action + allocations），结果存入 `ModelIO`。最终由用户手动 adopt 某个模型的方案，记录到 `DecisionLog`。

问题：
1. 模型不是 Agent——没有 skill pipeline，不支持 tool-use，只是 single-shot prompt→response
2. 缺少自动化的模型评估和决策筛选（投票）
3. 决策入参不足——缺少宏观经济、市场情绪、估值等关键数据
4. 无法回测——没有独立评估单个 Agent 的能力
5. 没有风控层——Agent 可以输出任意金额的交易
6. 记忆是全局共享的——所有模型看同一份，导致决策趋同

### 现有架构关键约束
- `DecisionHarness` 不可变，投票不能修改它
- `ModelIO` 是每个模型的独立记录，投票结果应存入新表
- `_call_model()` 使用独立 session 处理并发，投票阶段需复用此模式
- 已有 `ModelScore` 表追踪 adoption_count / win_count，需扩展
- 已有 `agent_memory` 表，但无 per-agent namespace

## Goals / Non-Goals

**Goals:**
- 将每个模型升级为真正的 Agent（structured skill pipeline + tool-use 支持）
- 实现投票流程：决策 → 匿名投票 → 计分 → 自动采纳
- Per-agent 私有记忆 + 共享记忆，支持上下文学习
- 扩展 DecisionHarness 入参（宏观、情绪、估值数据字段预留）
- 独立回测模式（每个 Agent 可单独运行和评估，不依赖投票）
- 完整评测指标体系
- 风控硬规则层（可插拔接口，本次预留不实现具体规则）
- Pipeline 中断恢复 + 幂等性
- Benchmark 对照组（纯 DCA 基准线）

**Non-Goals:**
- 不实现自动交易执行（仍需人工确认 approve）
- 不做模型的动态增删（模型列表仍在 ARENA_MODELS 常量中）
- 不实现宏观/情绪数据源的实际接入（预留字段，后续分批接入）
- 不实现具体风控规则逻辑（仅搭建可插拔接口）

## Decisions

### D1: Agent Skill Pipeline — 结构化多步决策

**选择**: 每个 Agent 的决策不再是 single-shot，而是通过 structured skill pipeline 执行：

```
Skill Pipeline (per Agent):
  1. AnalyzeMarket   — 分析技术面+估值数据，输出市场环境判断
  2. AnalyzeMacro     — 分析宏观经济+情绪数据，输出宏观环境判断
  3. RecallMemory     — 查询该 Agent 的私有记忆+共享记忆
  4. MakeDecision     — 基于上述分析+记忆，输出最终 action+allocations
```

每个 Skill 是一次独立的 LLM 调用（或工具调用）。Pipeline 的中间结果存入 ModelIO 的 `tool_calls` 字段。

**替代方案**: 继续 single-shot，把所有数据塞进一个 prompt。
**理由**: Skill pipeline 让每一步都可审计（白盒），且模型可以在分析阶段使用 tool-use 请求额外数据。single-shot 在数据量大时 prompt 过长，模型容易遗漏关键信息。

**工程实现**: 新建 `AgentSkillRunner` 类，接收模型配置 + harness，按顺序执行 skills。每个 skill 定义为一个 dataclass（skill_name, system_prompt_template, tools, output_schema）。

### D2: Tool-Use 支持

**选择**: Agent 在 skill pipeline 中可以调用预定义工具：
- `get_symbol_detail(symbol)` — 获取特定 ETF 的深度数据
- `get_recent_news(symbol)` — 获取相关新闻摘要
- `read_memory(category)` — 读取特定类别的记忆
- `calculate_position_size(symbol, action)` — 计算建议仓位（受风控限制）

**理由**: 不是所有数据都需要预加载到 prompt。让 Agent 按需获取，减少 prompt 长度，提高信息利用率。

**约束**: 最多 3 轮 tool-use 循环，防止无限循环。工具执行超时 5s。

### D3: Per-Agent 私有记忆

**选择**: `agent_memory` 表增加 `agent_key` 字段（格式：`{provider}:{model_name}`），区分：
- 共享记忆：`agent_key = "shared"`
- 私有记忆：`agent_key = "anthropic:claude-sonnet-4-20250514"` 等

HarnessBuilder 构建记忆时，按 agent_key 分别查询，传入各自的 memory 字段。

**替代方案**: 新建独立的 per-agent 记忆表。
**理由**: 复用现有表，仅增加一个过滤字段，迁移成本最低。

### D4: 投票阶段 — 作为 Pipeline Phase 2

**选择**: 在 `ArenaService.run()` 内，决策阶段完成后，自动进入投票阶段（第二轮 asyncio.gather）。

投票 prompt 包含所有其他模型的方案（匿名为 Plan A/B/C...），要求模型输出：
```json
{
  "approve_1": "Plan_B",
  "approve_2": "Plan_D",
  "reject": "Plan_A",
  "reasoning": "..."
}
```

**理由**: 匿名避免品牌偏见；结构化输出方便解析和计分。

### D5: 新增 ArenaVote 表

**选择**: 新建 `ArenaVote` 表存储投票记录，关联 `harness_id` + `voter_model_io_id` + `target_model_io_id` + `vote_type`。

**理由**: 职责分离。ModelIO 记录模型的输入输出，ArenaVote 记录模型间的评审关系。

### D6: 计分规则 — net_score + 三层 fallback

1. `net_score = approve_count - reject_count`，最高者胜出
2. 平票 → 历史 model_score（adoption_count - rejection_count）
3. 仍平 → confidence 较高
4. 极端仍平 → created_at 最早（确定性兜底）

### D7: DecisionHarness 入参扩展

**选择**: 扩展 `market_snapshot` JSON schema，新增三个顶层区块：

```python
{
  "quotes": { ... },         # 已有：行情+技术指标
  "valuations": { ... },     # 新增：PE/CAPE/dividend_yield/equity_risk_premium
  "macro": { ... },          # 新增：fed_rate/cpi/gdp/unemployment/pmi/vix/dxy/yield_curve
  "sentiment": { ... },      # 新增：fear_greed/aaii/put_call_ratio/news_sentiment
}
```

数据源暂时为 null/占位，但 schema 和序列化逻辑先行，后续逐步接入。Prompt 中对 null 字段标注 `[数据暂不可用]`。

### D8: 独立回测模式

**选择**: 新增 `AgentBacktestService`，支持：
1. 用历史数据构建 mock harness（指定日期 → 查历史行情/账户快照）
2. 单个 Agent 独立执行 skill pipeline
3. 不走投票流程
4. 记录决策，用实际后续价格计算收益
5. 批量运行多个时间点，输出每个 Agent 的收益曲线

**理由**: 这是评估 Agent 能力的唯一客观方法。投票机制的价值也需要通过对比"投票结果 vs 最佳单 Agent"来验证。

### D9: 风控层 — 可插拔接口

**选择**: 新建 `RiskGuard` 接口类，在 Phase 3（采纳）之前执行风控检查。本次只搭建接口框架，具体规则后续实现。

```python
class RiskGuard:
    async def check(self, decision, portfolio_state) -> RiskCheckResult:
        """返回 approved / modified / blocked + reason"""
        ...
```

预定义规则槽位（暂不实现逻辑）：
- `MaxPositionSizeRule` — 单次交易 ≤ 总资产 X%
- `ConcentrationRule` — 单一 ETF ≤ 总资产 Y%
- `DrawdownCircuitBreaker` — 回撤 > Z% 暂停
- `OvertradeRule` — 每日交易次数限制

### D10: Pipeline 中断恢复 + 幂等性

**选择**: 在 DecisionHarness 上新增 `pipeline_state` JSON 字段，记录当前 phase 完成状态：
```json
{"phase1_done": true, "phase2_done": false, "phase3_done": false}
```

`run()` 开始时检查：如果 phase1 已完成，直接从 phase2 恢复。相同 harness_id 重复调用不会重复执行已完成的 phase。

### D11: Benchmark 对照组

**选择**: 每次投票决策完成后，同时记录一条"纯 DCA 基准"的虚拟决策：将 budget 等额分配到 watchlist 所有 ETF。不需要 LLM 调用，纯算法计算。

存入 `DecisionLog(user_action="benchmark_dca")`，后续可对比 Agent 决策 vs 无脑 DCA 的收益。

### D12: 评测指标体系

存储在 `ModelScore` 扩展字段中，每次决策后更新：

Per-Agent:
- `simulated_return_pct` — 如果每次都采纳该 Agent，累计模拟收益率
- `decision_accuracy` — 正确决策比例（BUY 后涨 / SELL 后跌 / HOLD 平稳）
- `confidence_calibration` — confidence 与实际准确率的相关性
- `rejection_count` — 被反对票数

Voting System:
- 对比：投票赢家 vs 最佳单 Agent vs 纯 DCA benchmark

## Risks / Trade-offs

- **[成本增加]** Skill pipeline (4 步) + 投票 = 每 Agent ~5 次 LLM 调用，6 Agent 总计 ~30 次 → 成本约 $2-5/次决策。对月度 DCA 可接受
- **[延迟增加]** 总耗时可能达 60-90s → 前端需要分阶段展示进度
- **[Skill pipeline 失败]** 某个 skill 步骤失败 → 该 Agent 降级为 single-shot（用当前逻辑兜底）
- **[投票解析失败]** → 视为弃权，不影响其他 Agent
- **[回测局限]** 用历史数据回测 LLM 的决策，本质上是测试"LLM 对历史数据的分析能力"，不等于未来表现 → 需要明确标注回测结果的局限性
- **[Per-agent 记忆膨胀]** 6 个 Agent × 每次 2 条记忆 = 12 条/决策 → 需要记忆清理策略（保留最近 N 条）
