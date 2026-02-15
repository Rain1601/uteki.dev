## Why

当前 Arena 系统让多个模型独立生成投资决策，但最终采纳完全依赖人工选择。缺少自动化的模型评估和决策筛选机制。需要构建 Multi-Agent 投票流程，让模型之间交叉评审、自动产出 final decision，同时通过投票历史自然筛选出优秀模型。

## What Changes

- 每个模型作为独立 Agent，通过 Skill Pipeline 驱动完整的 数据获取→分析→决策 流程
- 决策完成后进入投票阶段：每个 Agent 拥有 3 票（2 赞成票投给其他 Agent 的最优方案 + 1 反对票投给最不认同的方案，反对票可弃权）
- 投票时隐去模型名称，仅展示 Plan A/B/C... 避免品牌偏见
- 投票计分：net_score = 赞成票 - 反对票，最高者被采纳
- 平票 fallback：历史 model_score → confidence 值
- 投票结束后获胜方案及执行结果写入所有 Agent 的记忆，用于后续决策参考
- 模型终身评分：adoption_count - rejection_count
- 最终决策自动进入执行流程（已有的 approve/execute 链路）

## Capabilities

### New Capabilities
- `agent-skill-pipeline`: Agent 的 Skill 驱动决策流程（数据获取、分析、决策生成），每个模型独立执行完整 pipeline
- `agent-voting`: 投票机制（3 票制：2 赞成 + 0~1 反对），匿名投票、计分、平票处理、结果采纳
- `agent-memory-learning`: 投票结果和执行结果写入 Agent 记忆，供后续决策参考
- `agent-scoring`: 模型终身评分系统（adoption_count - rejection_count），排行榜展示

### Modified Capabilities
- `arena-history`: Arena 历史记录需增加投票轮次详情、投票结果、最终采纳方案等字段

## Impact

- **Backend**: `arena_service.py` 重构为多阶段流程（决策→投票→计分→执行）；新增投票相关数据模型；memory_service 增加学习写入
- **Frontend**: ArenaView 需展示投票流程进度、投票结果可视化、模型评分排行
- **Database**: 新增 agent_vote / agent_score 表
- **API**: 新增投票相关端点，修改 arena/run 为多阶段返回
