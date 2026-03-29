# Uteki Agent 架构改造计划

> 版本: v1.0 | 日期: 2026-03-29
> 目标: 将现有 prompt chain 升级为真正的 Agent 系统，同时保留结构化输出优势

---

## 一、现状诊断

### 1.1 什么是 Agent？(学术定义 vs 工程落地)

一个完整的 Agent 系统应具备以下能力：

| 能力 | 定义 | Index Agent | Company Agent |
|------|------|:-----------:|:-------------:|
| **感知 (Perception)** | 从环境获取信息 | ✅ 市场快照+工具 | 🟡 仅 yfinance+web_search |
| **记忆 (Memory)** | 短期/长期记忆存储与检索 | ✅ 6类记忆系统 | ❌ 无 |
| **规划 (Planning)** | 动态分解任务、制定策略 | ❌ 固定4步 | ❌ 固定7步 |
| **推理 (Reasoning)** | 基于观察进行逻辑推断 | ✅ 每步LLM推理 | ✅ 每gate LLM推理 |
| **行动 (Action)** | 调用工具影响环境 | ✅ 5个工具 | 🟡 仅web_search |
| **反思 (Reflection)** | 评估自身输出质量并修正 | ❌ | ❌ |
| **学习 (Learning)** | 从历史经验改进决策 | 🟡 arena_learning | ❌ |
| **协作 (Collaboration)** | 多 Agent 协同 | ✅ Arena投票 | ❌ |

### 1.2 当前架构的本质

```
Index Agent  = 固定 Pipeline + 工具调用 + Arena 投票 + 记忆
             ≈ 一个有记忆的 "多专家投票系统"

Company Agent = 固定 Pipeline + 极少工具
             ≈ 一个结构化的 "prompt chain"
```

**核心问题**: 两个 agent 都不具备**自主规划**和**反思修正**能力。Pipeline 是静态的——无论分析苹果还是分析一家刚 IPO 的生物科技公司，都走完全相同的路径、调用相同深度的工具。

### 1.3 "固定骨架 vs 动态血肉" 的核心矛盾

这不是矛盾，而是**分层设计**问题：

```
Layer 0: 分析维度 (WHAT)     → 固定  → 7个gate定义不变
Layer 1: 调研策略 (HOW)      → 动态  → 每个gate内部自主决定
Layer 2: 信息充分性 (WHEN)   → 动态  → agent判断何时信息足够
Layer 3: 跨gate修正 (REVISE) → 动态  → 发现矛盾可回溯
Layer 4: 最终综合 (SYNTHESIZE)→ 固定  → 输出schema不变
```

当前实现只有 Layer 0 和 Layer 4，中间三层全部缺失。

---

## 二、改造目标

### 2.1 目标架构：固定骨架 + 动态血肉

```
                    ┌─────────────────────────────────────────┐
                    │         Agent Orchestrator              │
                    │   (管理gate流转、跨gate反思、终止条件)    │
                    └──────────────┬──────────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
     ┌──────┴──────┐       ┌──────┴──────┐       ┌──────┴──────┐
     │   Gate 1    │       │   Gate 2    │  ...  │   Gate 7    │
     │  (固定维度)  │       │  (固定维度)  │       │  (综合裁决)  │
     └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
            │                      │                      │
     ┌──────┴──────┐       ┌──────┴──────┐       ┌──────┴──────┐
     │ ReAct Loop  │       │ ReAct Loop  │       │  Synthesis  │
     │ (动态调研)   │       │ (动态调研)   │       │  (结构化)    │
     │ Think→Act   │       │ Think→Act   │       │             │
     │ →Observe    │       │ →Observe    │       │             │
     │ →Reflect    │       │ →Reflect    │       │             │
     └─────────────┘       └─────────────┘       └─────────────┘
            │                      │
            └──── Shared Context ──┘
                 (跨gate可见、可追溯)
```

### 2.2 设计原则

1. **Gate 维度固定，Gate 内部自主**：7个分析维度不变，但每个gate内agent可以自主决定搜索策略、调研深度、信息充分性判断
2. **输出 Schema 不变**：最终 `CompanyFullReport` 结构不动，前端零改动
3. **渐进式改造**：每一步都可独立上线，不需要一次性重写
4. **可观测性优先**：每个决策节点都可追溯——为什么搜这个、为什么停止、为什么这样评分
5. **成本可控**：动态不等于无限循环，每一层都有 budget 约束

### 2.3 不做什么

- **不做通用 Agent 框架**：不造 LangChain/CrewAI，只解决投资分析这一个场景
- **不引入 Agent 框架依赖**：用原生 Python 实现，不依赖第三方 agent 库
- **不改 LLM Adapter 层**：当前适配器已经够用
- **不改前端 SSE 协议**：保持现有事件类型，只新增不破坏

---

## 三、改造方案（分 4 个阶段）

### Phase 1: Gate 内部 ReAct 化 — "让每个 gate 会调研"

**目标**: 将每个gate从"单次LLM调用"升级为"ReAct循环"

#### 3.1.1 当前 vs 改造后

**当前 (prompt chain)**:
```python
# skill_runner.py 现状
messages = [system_prompt, user_message_with_all_data]
response = await adapter.chat(messages, tools=[web_search])
# 最多3轮tool call，但LLM不知道自己"可以要求更多信息"
```

**改造后 (ReAct loop)**:
```python
# 改造后
class GateExecutor:
    """单个Gate的ReAct执行器"""

    async def execute(self, gate: CompanySkill, context: GateContext) -> GateResult:
        """
        ReAct 循环：Think → Act → Observe → (重复或结束)
        """
        messages = self._build_initial_messages(gate, context)
        actions_taken = []
        budget = ToolBudget(max_searches=6, max_rounds=5, max_tokens=12000)

        for round_num in range(budget.max_rounds):
            # THINK: LLM分析当前信息，决定下一步
            response = await self._call_llm(messages, tools=self._get_tools(gate))

            # 解析LLM的决策：继续调研 or 得出结论
            decision = self._parse_decision(response)

            if decision.type == "conclude":
                # Agent认为信息充分，输出结论
                return GateResult(
                    raw=decision.conclusion,
                    core_conclusion=decision.core_conclusion,
                    actions=actions_taken,
                    rounds=round_num + 1,
                    confidence=decision.confidence,
                )

            if decision.type == "research":
                # ACT: 执行工具调用
                for tool_call in decision.tool_calls:
                    if not budget.can_afford(tool_call):
                        break
                    result = await self._execute_tool(tool_call)
                    budget.deduct(tool_call)
                    actions_taken.append(ToolAction(tool_call, result))

                    # OBSERVE: 将工具结果加入上下文
                    messages.append(format_tool_result(tool_call, result))

        # 超出budget，强制结论
        return await self._force_conclude(messages, actions_taken)
```

#### 3.1.2 Tool Budget 机制

```python
@dataclass
class ToolBudget:
    """防止agent无限循环的资源约束"""
    max_searches: int = 6        # 每gate最多搜索次数
    max_rounds: int = 5          # 每gate最多ReAct轮次
    max_tokens: int = 12000      # 每gate最大输出token
    timeout_seconds: int = 180   # 每gate超时

    searches_used: int = 0
    rounds_used: int = 0

    def can_afford(self, tool_call: ToolCall) -> bool:
        if tool_call.name == "web_search":
            return self.searches_used < self.max_searches
        return True

    def deduct(self, tool_call: ToolCall):
        if tool_call.name == "web_search":
            self.searches_used += 1
```

#### 3.1.3 System Prompt 改造

当前 prompt 只说"你是XXX分析师，分析以下数据"。改造后增加 **ReAct 指令**：

```markdown
## 你的工作方式

你通过"思考-行动-观察"循环来完成分析：

1. **思考**: 基于已有信息，判断还缺什么才能得出可靠结论
2. **行动**: 调用工具获取缺失信息
3. **观察**: 审视新信息，决定是继续调研还是得出结论

### 何时得出结论
- 当你对核心判断有足够证据支撑时
- 当额外搜索不太可能改变你的结论时
- 不要为了搜索而搜索——如果财务数据已经足够说明问题，直接给结论

### 何时继续调研
- 财务数据显示异常但原因不明
- 竞争格局信息不足以判断护城河强度
- 管理层有争议行为需要验证

### 输出格式
当你决定得出结论时，使用 <conclude> 标签：
<conclude>
你的分析文本...

【核心结论】80-120字总结
</conclude>

当你需要更多信息时，直接调用工具。
```

#### 3.1.4 新增工具集

当前 Company Agent 仅有 `web_search`。Phase 1 新增：

| 工具 | 功能 | 数据源 |
|------|------|--------|
| `web_search` | 通用网页搜索 | Google/Tavily |
| `search_sec_filings` | 搜索 SEC 10-K/10-Q 摘要 | SEC EDGAR API |
| `get_earnings_transcript` | 获取最近财报电话会纪要 | 已有数据 or API |
| `search_industry_reports` | 行业研报搜索 | Web search + 过滤 |
| `get_insider_detail` | 内部人交易详情 | yfinance (已有) |
| `compare_peers` | 同行业公司对比 | yfinance 批量 |

```python
COMPANY_TOOLS: dict[str, CompanyTool] = {
    "web_search": CompanyTool(
        name="web_search",
        description="搜索互联网获取公司相关信息、新闻、分析",
        parameters={"query": {"type": "string", "description": "搜索关键词"}},
        executor=execute_web_search,
    ),
    "search_sec_filings": CompanyTool(
        name="search_sec_filings",
        description="搜索公司SEC文件(10-K年报, 10-Q季报)中的特定信息",
        parameters={
            "symbol": {"type": "string"},
            "query": {"type": "string", "description": "要查找的信息，如'revenue breakdown by segment'"},
            "filing_type": {"type": "string", "enum": ["10-K", "10-Q"], "default": "10-K"},
        },
        executor=execute_sec_search,
    ),
    "compare_peers": CompanyTool(
        name="compare_peers",
        description="与同行业公司在关键指标上进行对比(ROE, 毛利率, 增速等)",
        parameters={
            "metrics": {"type": "array", "items": {"type": "string"},
                        "description": "要对比的指标，如['roe', 'gross_margin', 'revenue_growth']"},
        },
        executor=execute_peer_comparison,
    ),
}
```

#### 3.1.5 Gate 可用工具矩阵

不是每个gate都需要所有工具：

| Gate | web_search | sec_filings | earnings | peers | insider |
|------|:----------:|:-----------:|:--------:|:-----:|:-------:|
| 1. 商业模式 | ✅ | ✅ | ✅ | | |
| 2. 成长质量 | ✅ | ✅ | ✅ | ✅ | |
| 3. 护城河 | ✅ | | | ✅ | |
| 4. 管理层 | ✅ | ✅ | | | ✅ |
| 5. 反向尽调 | ✅ | ✅ | | ✅ | ✅ |
| 6. 估值 | ✅ | | | ✅ | |
| 7. 综合裁决 | | | | | |

#### 3.1.6 交付物

- [ ] `GateExecutor` 类：ReAct循环 + budget控制
- [ ] `ToolBudget` 类：资源约束
- [ ] `CompanyToolRegistry`：工具注册与按gate过滤
- [ ] 6个gate的system prompt改造（增加ReAct指令）
- [ ] 新工具实现：`search_sec_filings`, `compare_peers`（优先）
- [ ] SSE事件扩展：`gate_think`, `gate_tool_call`, `gate_tool_result`（可选，丰富前端展示）
- [ ] 单元测试：每个gate的ReAct循环mock测试

---

### Phase 2: 跨 Gate 反思与上下文管理 — "让 agent 会回头看"

**目标**: 引入 Orchestrator 层，管理gate间的信息流和反思机制

#### 3.2.1 Orchestrator 设计

```python
class PipelineOrchestrator:
    """
    管理整个7-gate pipeline的执行流程。

    职责：
    1. 按序执行gate（可选条件跳过）
    2. 管理跨gate的共享上下文
    3. 在关键节点触发反思（Reflection）
    4. 检测gate间矛盾并处理
    """

    def __init__(
        self,
        gate_executor: GateExecutor,
        context: PipelineContext,
        config: OrchestratorConfig,
    ):
        self.gate_executor = gate_executor
        self.context = context
        self.config = config

    async def run(self) -> CompanyFullReport:
        for gate in GATE_SEQUENCE:
            # 1. 执行gate
            result = await self.gate_executor.execute(gate, self.context)
            self.context.add_gate_result(gate, result)

            # 2. 在关键节点触发反思
            if gate.gate_number in self.config.reflection_checkpoints:
                reflection = await self._reflect(gate, result)
                if reflection.has_contradiction:
                    await self._handle_contradiction(reflection)

            # 3. 动态调整后续gate策略
            self._update_downstream_hints(gate, result)

        # 4. Gate 7 综合裁决
        return await self._synthesize()
```

#### 3.2.2 反思检查点 (Reflection Checkpoints)

不是每个gate后都反思（太贵），而是在**关键转折点**：

```python
REFLECTION_CHECKPOINTS = {
    3: "前3个gate完成后反思：商业模式+成长性+护城河是否一致？",
    5: "反向尽调后反思：Gate 5的风险发现是否推翻了Gate 1-4的乐观判断？",
}
```

**反思 Prompt**:
```markdown
你刚完成了以下分析：

Gate 1 (商业模式): {core_conclusion_1}
Gate 2 (成长质量): {core_conclusion_2}
Gate 3 (护城河):   {core_conclusion_3}

请检查：
1. 这三个维度的结论是否存在内在矛盾？
   - 例：商业模式评价很高，但护城河评分很低——是否合理？
2. 是否有任何发现需要提醒后续Gate特别关注？
3. 是否有任何Gate的分析需要补充（如关键信息缺失）？

输出格式：
<reflection>
contradictions: [如有矛盾，列出]
alerts_for_downstream: [需提醒后续gate的关键点]
needs_revisit: [是否需要回溯某个gate, null表示不需要]
</reflection>
```

#### 3.2.3 上下文管理改造

当前问题：Gate 2-6只传`core_conclusion`（可能信息丢失），Gate 7传全部raw（太长）。

改造为分级上下文：

```python
class PipelineContext:
    """跨gate共享的上下文容器"""

    def __init__(self, company_data: dict):
        self.company_data = company_data          # 财务数据（不变）
        self.gate_results: dict[int, GateResult] = {}
        self.reflections: list[Reflection] = []
        self.downstream_hints: list[str] = []     # 反思产生的提醒

    def get_context_for_gate(self, gate_number: int) -> str:
        """为指定gate构建上下文，分级详略"""
        parts = []

        # 前置gate结论（摘要级）
        for prev_gate, result in self.gate_results.items():
            if prev_gate < gate_number:
                parts.append(f"【Gate {prev_gate}: {result.display_name}】")
                parts.append(f"核心结论: {result.core_conclusion}")
                # 关键发现（比core_conclusion多一层，比raw少很多）
                if result.key_findings:
                    parts.append(f"关键发现: {'; '.join(result.key_findings)}")

        # 反思产生的提醒
        if self.downstream_hints:
            parts.append(f"\n【前序分析提醒】\n" + "\n".join(self.downstream_hints))

        return "\n\n".join(parts)

    def get_full_context_for_synthesis(self) -> str:
        """Gate 7 综合裁决用，包含所有gate的完整输出"""
        # 保持现有逻辑，传完整raw
        ...
```

#### 3.2.4 GateResult 增强

```python
@dataclass
class GateResult:
    gate_number: int
    display_name: str
    raw: str                              # 完整原始输出
    core_conclusion: str                  # 80-120字核心结论
    key_findings: list[str]               # 3-5条关键发现（新增）
    confidence: float                     # agent自评置信度（新增）
    actions: list[ToolAction]             # 调研行动记录
    rounds: int                           # ReAct轮次
    latency_ms: int
    parse_status: str
```

`key_findings` 提取方式：在 gate prompt 中要求 agent 输出：
```markdown
【关键发现】
- 发现1
- 发现2
- 发现3
```

#### 3.2.5 交付物

- [ ] `PipelineOrchestrator` 类
- [ ] `PipelineContext` 上下文管理
- [ ] `GateResult` 增强（key_findings, confidence）
- [ ] 反思prompt（Gate 3后、Gate 5后）
- [ ] 矛盾处理策略（记录 + 传递给Gate 7）
- [ ] SSE事件扩展：`reflection_start`, `reflection_complete`

---

### Phase 3: Memory 系统 + Arena 投票 — "让 agent 会学习、会辩论"

**目标**: Company Agent 获得记忆能力和多模型共识机制

#### 3.3.1 Company Memory 设计

复用 Index Agent 的 `MemoryService` 架构，但增加公司分析特有的记忆类型：

```python
COMPANY_MEMORY_CATEGORIES = {
    # 分析记忆：某次分析的关键结论和后续验证
    "analysis_record": "完整分析记录摘要，含日期和关键判断",

    # 行业认知：积累的行业理解
    "industry_insight": "对特定行业的积累认知，如'SaaS行业的护城河通常来自转换成本'",

    # 错误教训：之前分析中的失误
    "lesson_learned": "之前分析中被后续事实证明错误的判断",

    # 估值锚点：历史估值参考
    "valuation_anchor": "某公司/行业的历史估值区间和当时条件",
}
```

**Memory 在 Pipeline 中的使用**：

```
Gate 1 开始前:
  → recall_memory("company:AAPL") → 之前分析过这家公司吗？结论是什么？
  → recall_memory("industry:Consumer Electronics") → 这个行业有什么积累认知？

Gate 6 (估值) 中:
  → recall_memory("valuation:AAPL") → 之前给过什么估值？当时条件如何？

Pipeline 结束后:
  → save_memory(analysis_record) → 保存本次分析摘要
  → save_memory(industry_insight) → 保存新发现的行业认知
```

#### 3.3.2 Company Arena 设计

与 Index Agent Arena 类似，但适配公司分析场景：

```
Phase 1: 多模型独立分析
  ├→ Claude: 完整 7-gate pipeline → CompanyFullReport
  ├→ GPT-4: 完整 7-gate pipeline → CompanyFullReport
  └→ DeepSeek: 完整 7-gate pipeline → CompanyFullReport

Phase 2: 交叉评审（不是投票，是 Review）
  ├→ Claude 评审 GPT-4 和 DeepSeek 的报告
  │   "GPT-4的护城河分析忽略了品牌转换成本..."
  ├→ GPT-4 评审 Claude 和 DeepSeek 的报告
  └→ DeepSeek 评审 Claude 和 GPT-4 的报告

Phase 3: 综合（不只是投票，是 Synthesis）
  └→ 选取各模型各gate中最优分析，综合出最终报告
```

**注意**：公司分析的 Arena 不同于 Index Agent 的简单投票。因为公司分析输出是长文本报告，不是简单的 BUY/SELL 动作。所以：
- Phase 2 是**评审**而非投票——指出其他模型分析中的盲点和错误
- Phase 3 是**综合**而非选择——从多份报告中提取最佳洞察

#### 3.3.3 成本考量

完整 Arena 需要 3 个模型各跑一遍 7-gate pipeline，成本约为单次分析的 3-5x。因此设计两种模式：

| 模式 | 说明 | 成本 | 适用 |
|------|------|------|------|
| **Standard** | 单模型 7-gate | 1x | 日常分析 |
| **Arena** | 多模型 + 评审 + 综合 | 4-5x | 重要投资决策 |

#### 3.3.4 交付物

- [ ] `CompanyMemoryService`（复用已有MemoryService，增加公司特定category）
- [ ] Memory 工具（`recall_company_memory`, `save_company_memory`）
- [ ] Pipeline 中的 memory 集成点（Gate 1 前、Gate 6 中、Pipeline 后）
- [ ] Company Arena Service（Phase 1-3）
- [ ] 前端 Arena 模式选择（Standard / Arena）

---

### Phase 4: 共享基础设施抽象 — "两个 agent 共用一套底层"

**目标**: 将 Index Agent 和 Company Agent 的共同模式抽取为可复用的 agent 基础层

#### 3.4.1 当前代码重复

两个 agent 各自实现了：
- Tool 调用解析（手动 regex，5种格式）
- LLM 调用 + 流式响应收集
- 超时控制
- JSON 提取
- SSE 事件推送
- 模型配置解析

#### 3.4.2 抽象设计

```
uteki/domains/agent/
├── core/
│   ├── base_executor.py      # BaseGateExecutor (ReAct循环)
│   ├── tool_registry.py      # ToolRegistry (工具注册+权限)
│   ├── tool_parser.py        # ToolCallParser (统一解析)
│   ├── budget.py             # ToolBudget (资源约束)
│   ├── context.py            # BasePipelineContext
│   ├── orchestrator.py       # BasePipelineOrchestrator
│   ├── memory.py             # BaseMemoryService
│   └── arena.py              # BaseArenaService
├── llm_adapter.py            # (已有，不动)
├── research/                  # (已有，不动)
│
uteki/domains/index/
├── services/
│   ├── agent_skills.py       # → 改为继承 BaseGateExecutor
│   ├── arena_service.py      # → 改为继承 BaseArenaService
│   └── memory_service.py     # → 改为继承 BaseMemoryService
│
uteki/domains/company/
├── skill_runner.py           # → 改为继承 BaseGateExecutor
├── arena_service.py          # (新增)
└── memory_service.py         # (新增)
```

#### 3.4.3 BaseGateExecutor

```python
class BaseGateExecutor(ABC):
    """所有Gate执行器的基类"""

    def __init__(self, adapter: BaseLLMAdapter, tool_registry: ToolRegistry):
        self.adapter = adapter
        self.tool_registry = tool_registry
        self.tool_parser = ToolCallParser()  # 统一的工具调用解析

    async def execute(
        self,
        skill: Any,
        context: BasePipelineContext,
        budget: ToolBudget,
        on_progress: Optional[Callable] = None,
    ) -> GateResult:
        """标准ReAct循环，子类可override具体步骤"""
        messages = self.build_messages(skill, context)
        tools = self.tool_registry.get_tools_for(skill)
        actions = []

        for round_num in range(budget.max_rounds):
            response = await self._call_llm(messages, tools, on_progress)

            if self._is_conclusion(response):
                return self._build_result(response, actions, round_num + 1)

            tool_calls = self.tool_parser.parse(response)
            if not tool_calls or not budget.can_afford_any(tool_calls):
                return self._build_result(response, actions, round_num + 1)

            for tc in tool_calls:
                if budget.can_afford(tc):
                    result = await self._execute_tool(tc)
                    budget.deduct(tc)
                    actions.append(ToolAction(tc, result))
                    messages.append(self._format_tool_result(tc, result))

        return await self._force_conclude(messages, actions)

    @abstractmethod
    def build_messages(self, skill, context) -> list[LLMMessage]:
        """子类实现：构建初始消息"""
        ...

    @abstractmethod
    def _is_conclusion(self, response: str) -> bool:
        """子类实现：判断是否得出结论"""
        ...
```

#### 3.4.4 ToolCallParser 统一化

当前两个agent各自实现tool call解析。统一为：

```python
class ToolCallParser:
    """
    统一工具调用解析器。
    支持格式（按优先级）：
    1. Native API tool_calls（原生function calling返回）
    2. <tool_call>JSON</tool_call>
    3. <tool_call><name>...</name><arguments>...</arguments></tool_call>
    4. ```tool_call\n{...}\n```
    5. {"tool_call": {...}}
    """

    def parse(self, response: str, native_tool_calls: list = None) -> list[ToolCall]:
        # 优先使用native tool calls
        if native_tool_calls:
            return [ToolCall.from_native(tc) for tc in native_tool_calls]
        # 降级到文本解析
        return self._parse_text(response)
```

#### 3.4.5 交付物

- [ ] `agent/core/` 包结构
- [ ] `BaseGateExecutor` + `ToolCallParser` + `ToolBudget`
- [ ] `BasePipelineContext` + `BasePipelineOrchestrator`
- [ ] Index Agent 迁移至新基类
- [ ] Company Agent 迁移至新基类
- [ ] 消除重复代码

---

## 四、系统边界定义

### 4.1 Agent 系统边界

```
┌──────────────────── Agent 系统边界 ─────────────────────┐
│                                                          │
│  输入边界（Perception Layer）                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │ • yfinance 财务数据 (缓存7天)                       │  │
│  │ • Web Search 结果 (实时)                            │  │
│  │ • SEC Filing 摘要 (API)                             │  │
│  │ • Memory 历史记忆 (DB)                              │  │
│  │ • 用户输入 (symbol, 偏好)                            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  处理边界（Reasoning Layer）                              │
│  ┌────────────────────────────────────────────────────┐  │
│  │ • LLM 推理（通过 Adapter，不直连 API）               │  │
│  │ • 工具调用（通过 ToolRegistry，有 budget 约束）       │  │
│  │ • 跨gate上下文（通过 PipelineContext，有大小限制）     │  │
│  │ • 反思（通过 Orchestrator，仅在checkpoint触发）       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  输出边界（Action Layer）                                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │ • 结构化报告输出（CompanyFullReport schema）         │  │
│  │ • SSE 流式事件（不超过现有事件类型 + 扩展）           │  │
│  │ • Memory 写入（仅pipeline结束后）                    │  │
│  │ • DB 持久化（分析记录）                              │  │
│  │                                                      │  │
│  │ ✘ 不执行交易                                         │  │
│  │ ✘ 不发送通知                                         │  │
│  │ ✘ 不修改系统配置                                     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 4.2 安全约束

| 约束 | 规则 | 执行方式 |
|------|------|----------|
| **Token Budget** | 每gate最多12K output tokens | LLM config 硬限制 |
| **Tool Budget** | 每gate最多6次搜索，5轮ReAct | `ToolBudget` 类 |
| **时间Budget** | 每gate 180s，pipeline 总计 20min | `asyncio.wait_for` |
| **Memory大小** | 单条memory ≤ 2000字 | 写入时截断 |
| **上下文窗口** | Gate 7 接收的总上下文 ≤ 30K tokens | `PipelineContext` 截断策略 |
| **并发** | Arena 最多 3 个模型并发 | `asyncio.Semaphore` |
| **成本** | 单次分析 ≤ $0.50 (Standard), ≤ $2.50 (Arena) | 按token估算+告警 |

### 4.3 失败模式与降级策略

| 失败场景 | 降级策略 |
|----------|----------|
| Gate ReAct 超时 | 强制用已有信息得出结论 |
| 工具调用全部失败 | 仅基于财务数据分析（退化为当前行为）|
| 反思检测到严重矛盾 | 记录矛盾 + 在 Gate 7 中显式提及 |
| Gate 7 JSON 解析失败 | 三级降级：直接解析 → markdown提取 → 贪婪匹配（已有）|
| Memory 服务不可用 | 跳过记忆，不阻塞分析 |
| Arena 某模型失败 | 剩余模型继续，≥2个模型即可评审 |
| LLM Provider 不可用 | 按配置顺序 fallback 到下一个 provider |

---

## 五、实施路径与优先级

```
Phase 1 (Week 1-2): Gate 内部 ReAct 化
├── P0: GateExecutor ReAct 循环
├── P0: ToolBudget 资源约束
├── P1: System Prompt 改造（ReAct 指令）
├── P1: 新工具 compare_peers, search_sec_filings
└── P2: SSE 事件扩展（gate_think, gate_tool_call）

Phase 2 (Week 3): 跨 Gate 反思
├── P0: PipelineOrchestrator
├── P0: PipelineContext 分级上下文
├── P1: 反思检查点（Gate 3后、Gate 5后）
└── P1: GateResult 增强（key_findings, confidence）

Phase 3 (Week 4): Memory + Arena
├── P1: CompanyMemoryService
├── P1: Memory 工具集成
├── P2: Company Arena Service
└── P2: 前端 Arena 模式

Phase 4 (Week 5): 基础设施抽象
├── P1: agent/core/ 公共模块
├── P1: Index Agent 迁移
├── P2: Company Agent 迁移
└── P2: 消除重复代码
```

### 优先级说明

- **P0**: 核心改造，不做等于没改
- **P1**: 重要增强，显著提升能力
- **P2**: 锦上添花，可后续迭代

---

## 六、前端影响评估

### 6.1 零破坏性变更

以下改造对前端**完全透明**：
- Gate 内部 ReAct 化（输出格式不变）
- 跨 Gate 反思（前端不感知）
- Memory 系统（后端行为）
- `CompanyFullReport` schema 不变
- 现有 SSE 事件类型不变

### 6.2 可选增强（不阻塞上线）

| 新增SSE事件 | 前端效果 |
|-------------|----------|
| `gate_think` | 展示agent的思考过程（类似 o1 的思考链） |
| `gate_tool_call` | 展示工具调用（"正在搜索XXX..."） |
| `gate_tool_result` | 展示搜索结果摘要 |
| `reflection` | 展示反思结论（"Gate 1-3 分析一致"） |

这些事件即使不接也不影响现有功能，前端可以逐步适配。

---

## 七、可观测性设计

### 7.1 Trace 结构

每次分析产出完整的执行轨迹：

```python
@dataclass
class PipelineTrace:
    """完整的pipeline执行轨迹"""
    analysis_id: str
    model: str
    gates: list[GateTrace]
    reflections: list[ReflectionTrace]
    total_latency_ms: int
    total_tool_calls: int
    total_search_count: int
    estimated_cost_usd: float

@dataclass
class GateTrace:
    gate_number: int
    rounds: int                    # ReAct轮次
    tool_calls: list[ToolAction]   # 调了什么工具、返回了什么
    confidence: float              # agent自评置信度
    latency_ms: int
    token_usage: TokenUsage
```

### 7.2 关键指标

| 指标 | 含义 | 告警阈值 |
|------|------|----------|
| `gate_rounds_avg` | 平均每gate的ReAct轮次 | >4 (可能陷入循环) |
| `tool_call_success_rate` | 工具调用成功率 | <70% (工具可能有问题) |
| `reflection_contradiction_rate` | 反思发现矛盾的比例 | >50% (prompt可能有问题) |
| `gate_confidence_avg` | 平均gate置信度 | <0.5 (数据可能不足) |
| `pipeline_cost_usd` | 单次分析成本 | >$1.00 (Standard模式) |

---

## 八、技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| ReAct 循环增加延迟 | 用户等待时间从 ~2min 增到 ~5min | SSE 实时展示进度；budget 控制上限 |
| ReAct 循环增加成本 | 单次分析成本 2-3x | ToolBudget 限制；成本估算告警 |
| 反思 LLM 调用额外开销 | 每个 checkpoint 增加 ~10s | 仅在关键点反思（2次/pipeline） |
| 工具调用不稳定 | SEC API / Web Search 可能失败 | 降级策略：工具失败不阻塞分析 |
| 上下文超出窗口 | Gate 7 可能 OOM | PipelineContext 截断策略 |

---

## 九、成功标准

| 维度 | 指标 | 当前 | 目标 |
|------|------|------|------|
| **分析深度** | 每gate平均工具调用次数 | 0-1次 | 2-4次 |
| **分析质量** | Gate 7 输出信息密度(人工评估) | 基线 | +40% |
| **自主性** | Agent 自主发现并调研异常的能力 | 无 | 有（可验证） |
| **一致性** | 跨gate矛盾被发现并处理的比率 | 0% | >80% |
| **学习能力** | 二次分析同公司时引用历史记忆 | 无 | 有 |
| **延迟** | 单次Standard分析耗时 | ~2min | ≤5min |
| **成本** | 单次Standard分析成本 | ~$0.15 | ≤$0.50 |
