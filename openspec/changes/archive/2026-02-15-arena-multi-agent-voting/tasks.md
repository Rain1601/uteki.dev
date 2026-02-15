## 1. Backend — 数据模型

- [x] 1.1 新建 `ArenaVote` 模型 (`backend/uteki/domains/index/models/arena_vote.py`)：`id`, `harness_id` (FK), `voter_model_io_id` (FK), `target_model_io_id` (FK), `vote_type` (approve/reject), `reasoning` (Text), `created_at`；在 `__init__.py` 中导出
- [x] 1.2 `ModelScore` 表新增 `rejection_count` (Integer, default=0)、`simulated_return_pct` (Float, nullable)、`decision_accuracy` (Float, nullable)、`confidence_calibration` (Float, nullable) 列
- [x] 1.3 `agent_memory` 表新增 `agent_key` 列 (String, default="shared")，用于区分共享记忆和 per-agent 私有记忆；添加索引 `idx_agent_memory_agent_key`
- [x] 1.4 `DecisionHarness` 表新增 `pipeline_state` 列 (JSON, default={})，记录各 phase 完成状态，用于中断恢复

## 2. Backend — DecisionHarness 入参扩展

- [x] 2.1 扩展 `market_snapshot` JSON schema，新增 `valuations` 区块：`pe_ratio`, `pe_percentile_5y`, `shiller_cape`, `dividend_yield`, `earnings_yield`, `equity_risk_premium`（per symbol）；数据源暂为 null
- [x] 2.2 新增 `macro` 区块到 `market_snapshot`：`fed_funds_rate`, `fed_rate_direction`, `cpi_yoy`, `core_pce_yoy`, `gdp_growth_qoq`, `unemployment_rate`, `ism_manufacturing_pmi`, `ism_services_pmi`, `yield_curve_2y10y`, `vix`, `dxy`；数据源暂为 null
- [x] 2.3 新增 `sentiment` 区块到 `market_snapshot`：`fear_greed_index`, `aaii_bull_ratio`, `aaii_bear_ratio`, `put_call_ratio`, `news_sentiment_score`, `news_key_events`；数据源暂为 null
- [x] 2.4 修改 `HarnessBuilder.build()` 构建以上三个区块（值为 null 占位），修改 `_serialize_harness()` 序列化逻辑，对 null 字段标注 `[数据暂不可用]`
- [x] 2.5 扩展 `task` 区块增加 `max_single_position_pct`, `max_holdings`, `risk_tolerance` 字段

## 3. Backend — Agent Skill Pipeline

- [x] 3.1 新建 `AgentSkill` dataclass (`backend/uteki/domains/index/services/agent_skills.py`)：`skill_name`, `system_prompt_template`, `tools` (list), `output_schema` (dict)，定义 4 个核心 Skill：`analyze_market`, `analyze_macro`, `recall_memory`, `make_decision`
- [x] 3.2 新建 `AgentSkillRunner` 类：接收模型配置 + harness + agent_key，按顺序执行 skill pipeline，每个 skill 为一次 LLM 调用；中间结果累积传递给下一个 skill；记录每步的 input/output 到 ModelIO.tool_calls
- [x] 3.3 实现 tool-use 支持：定义 `get_symbol_detail`, `get_recent_news`, `read_memory`, `calculate_position_size` 工具；skill 执行时如果模型返回 tool_call，执行工具并将结果回传；最多 3 轮 tool-use 循环，超时 5s/工具
- [x] 3.4 Skill pipeline 失败降级：如果任意 skill 步骤失败，该 Agent 降级为 single-shot 模式（当前逻辑），确保不会因 pipeline 问题导致 Agent 完全无输出

## 4. Backend — Per-Agent 记忆

- [x] 4.1 修改 `MemoryService`：所有写入方法增加 `agent_key` 参数（默认 "shared"）；查询方法支持按 `agent_key` 过滤
- [x] 4.2 修改 `HarnessBuilder._get_memory_summary()` → 为每个 Agent 分别构建记忆：`shared` 记忆 + 该 Agent 的私有记忆 + 最近 3 次投票获胜方案
- [x] 4.3 投票结束后写入共享记忆：`agent_key="shared"`, category=`arena_learning`，content 包含 winner 的 action/allocations/reasoning/net_score/日期
- [x] 4.4 投票结束后写入 per-agent 私有记忆：`agent_key="{provider}:{model}"`, category=`arena_vote_reasoning`，content 包含该模型的投票理由和投票对象

## 5. Backend — 投票 Prompt 与解析

- [x] 5.1 新建投票 prompt 构建函数 `_build_vote_prompt(voter_model_io_id, all_model_ios)` — 将其他模型的 `output_structured`（action, allocations, confidence, reasoning）匿名化为 Plan A/B/C...，排除投票者自己的方案；包含投票规则说明（2 赞成 + 0~1 反对，反对可弃权）
- [x] 5.2 新建投票结果解析函数 `_parse_vote_output(raw_text)` — 提取 `{approve_1, approve_2, reject, reasoning}`，解析失败返回空投票（视为弃权）

## 6. Backend — Pipeline 重构

- [x] 6.1 重构 `ArenaService.run()` 为三阶段 pipeline，增加 `pipeline_state` 检查实现幂等性：相同 harness_id 重复调用时从未完成的 phase 恢复
- [x] 6.2 Phase 1 改造：将 `_call_model()` 替换为 `AgentSkillRunner` 执行 skill pipeline（带 single-shot 降级兜底）；完成后更新 `pipeline_state.phase1_done = true`
- [x] 6.3 实现 Phase 2 `_run_voting(harness_id, successful_model_ios)` — 对每个成功的模型构建投票 prompt，通过 `asyncio.gather` 并行调用（独立 session），解析投票结果，批量写入 `ArenaVote` 表；完成后更新 `pipeline_state.phase2_done = true`
- [x] 6.4 实现 Phase 3 `_tally_and_adopt(harness_id, votes, model_ios)` — 计算每个候选的 net_score，三层 fallback (net_score → historical model_score → confidence → created_at) 产出 winner，自动创建 `DecisionLog(user_action="auto_voted")`；完成后更新 `pipeline_state.phase3_done = true`
- [x] 6.5 少于 2 个模型成功时跳过投票：0 个成功 → final_decision=null；1 个成功 → 直接采纳
- [x] 6.6 Phase 3 采纳后同时记录 Benchmark 对照：创建 `DecisionLog(user_action="benchmark_dca")`，将 budget 等额分配到 watchlist 所有 ETF

## 7. Backend — 评分更新

- [x] 7.1 投票结束后更新 `ModelScore`：winner 的 `adoption_count += 1`；每个被 reject 的模型 `rejection_count += reject_count`；所有参与模型 `total_decisions += 1`
- [x] 7.2 Leaderboard API 返回增加 `rejection_count`、`model_score` (adoption - rejection)、`simulated_return_pct`、`decision_accuracy`

## 8. Backend — 独立回测模式

- [x] 8.1 新建 `AgentBacktestService` (`backend/uteki/domains/index/services/agent_backtest_service.py`)：接收 agent_key + 日期范围 + 频率，用历史价格数据构建 mock harness（查 `index_price` 表）
- [x] 8.2 实现单 Agent 回测执行：对每个时间点运行 skill pipeline → 记录决策 → 用实际后续价格（5/10/20 天）计算收益 → 累计收益曲线
- [x] 8.3 实现决策准确率计算：BUY 后涨=正确, SELL 后跌=正确, HOLD 且波动<2%=正确
- [x] 8.4 新增 `GET /api/index/arena/backtest` 端点：参数 `agent_key`, `start_date`, `end_date`, `frequency`；返回该 Agent 的回测结果（收益曲线、准确率、Sharpe、最大回撤）
- [x] 8.5 回测结果同时计算 benchmark（纯 DCA）收益曲线，返回对比数据

## 9. Backend — 风控层接口（可插拔，暂不实现具体规则）

- [x] 9.1 新建 `RiskGuard` 基类和 `RiskCheckResult` 数据结构 (`backend/uteki/domains/index/services/risk_guard.py`)：`check(decision, portfolio_state) -> RiskCheckResult(status, modified_allocations, reasons)`
- [x] 9.2 定义规则槽位（空实现，仅 pass）：`MaxPositionSizeRule`, `ConcentrationRule`, `DrawdownCircuitBreaker`, `OvertradeRule`
- [x] 9.3 在 Phase 3 采纳前调用 `RiskGuard.check()`；当前实现直接返回 approved，不修改任何决策

## 10. Backend — API 响应结构

- [x] 10.1 修改 `POST /api/index/arena/run` 返回结构，增加 `votes` (ArenaVote 列表)、`final_decision` 对象 (winner_model_io_id, winner_model_provider, winner_model_name, winner_action, net_score, total_approve, total_reject, vote_summary)、`pipeline_phases` (各阶段耗时)
- [x] 10.2 `GET /api/index/arena/history` 返回增加 `vote_winner_model` 和 `vote_winner_action` 字段
- [x] 10.3 新增 `GET /api/index/arena/{harness_id}/votes` — 返回该 harness 的投票详情

## 11. Frontend — API 层

- [x] 11.1 更新 `ArenaResult` 类型，增加 `votes`, `final_decision`, `pipeline_phases` 字段
- [x] 11.2 新增 `ArenaVote` 类型和 `fetchArenaVotes(harnessId)` 函数
- [x] 11.3 `ArenaHistoryItem` / `ArenaTimelinePoint` 增加 `vote_winner_model` 和 `vote_winner_action`
- [x] 11.4 新增 `AgentBacktestResult` 类型和 `runAgentBacktest(params)` 函数

## 12. Frontend — ArenaView 投票可视化

- [x] 12.1 Run Arena 完成后分阶段展示进度：Phase 1 (决策中) → Phase 2 (投票中) → Phase 3 (计分完成)
- [x] 12.2 投票结果展示：winner 高亮标记、每个模型的得票数（approve/reject）、net_score 排名
- [x] 12.3 ModelCard 增加投票状态：该模型获得的 approve 数、reject 数、是否为 winner（badge）、投票理由展开
- [x] 12.4 Timeline Chart tooltip 增加 winner model 和 action 信息
- [x] 12.5 Leaderboard 页面增加 rejection_count、model_score、simulated_return_pct 列
