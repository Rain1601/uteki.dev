# 系统架构设计

uteki.open的架构设计原则、扩展策略和组织规范。

---

## 总体架构

### DDD六域架构

```
uteki.open/
├── backend/uteki/domains/
│   ├── admin/          # 系统管理域
│   ├── trading/        # 交易执行域
│   ├── data/           # 数据采集域
│   ├── agent/          # AI Agent域
│   ├── evaluation/     # 评估测试域
│   └── dashboard/      # 可视化域
├── frontend/           # 前端应用
└── docs-site/          # 文档站点 (VitePress)
```

---

## Agent Domain 扩展策略

### ❌ 错误方式：为每种agent创建新domain

```bash
# 不要这样做
backend/uteki/domains/
├── trading_agent/      # ❌ 错误：不是独立domain
├── investing_agent/    # ❌ 错误：不是独立domain
├── research_agent/     # ❌ 错误：不是独立domain
```

**问题**:
- 违反DDD原则（这些不是独立的bounded context）
- 造成代码重复（agent框架代码重复）
- 难以维护（修改agent框架需要改多个地方）

### ✅ 正确方式：在agent domain内扩展

```python
backend/uteki/domains/agent/
├── __init__.py
├── models.py                 # Agent执行记录、任务等
├── schemas.py                # API请求/响应
├── repository.py             # 数据访问
├── service.py                # Agent服务
├── api.py                    # REST API
│
├── core/                     # Agent核心框架
│   ├── __init__.py
│   ├── base_agent.py         # Agent基类
│   ├── engine.py             # 执行引擎
│   ├── memory.py             # 记忆管理
│   ├── tool_registry.py      # 工具注册表
│   └── orchestrator.py       # 多Agent编排
│
├── agents/                   # 具体Agent实现
│   ├── __init__.py
│   ├── trading_agent.py      # 交易Agent
│   ├── investing_agent.py    # 投资Agent
│   ├── research_agent.py     # 研究Agent
│   ├── risk_agent.py         # 风控Agent
│   └── portfolio_agent.py    # 组合管理Agent
│
├── tools/                    # Agent可用工具
│   ├── __init__.py
│   ├── market_data.py        # 市场数据工具
│   ├── order_execution.py    # 订单执行工具
│   ├── analysis.py           # 分析工具
│   └── web_search.py         # 网络搜索工具
│
└── strategies/               # Agent策略 (可选)
    ├── __init__.py
    ├── mean_reversion.py
    ├── momentum.py
    └── arbitrage.py
```

---

## Agent实现示例

### 1. 基类定义

```python
# backend/uteki/domains/agent/core/base_agent.py

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional

class BaseAgent(ABC):
    """所有Agent的基类"""

    def __init__(
        self,
        name: str,
        llm_provider: str,
        model: str,
        tools: Optional[List[str]] = None
    ):
        self.name = name
        self.llm_provider = llm_provider
        self.model = model
        self.tools = tools or []
        self.memory = []

    @abstractmethod
    async def execute(self, task: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """执行任务"""
        pass

    @abstractmethod
    def get_system_prompt(self) -> str:
        """获取系统提示词"""
        pass

    async def use_tool(self, tool_name: str, **kwargs) -> Any:
        """使用工具"""
        from uteki.domains.agent.core.tool_registry import tool_registry
        return await tool_registry.execute(tool_name, **kwargs)
```

### 2. 具体Agent实现

```python
# backend/uteki/domains/agent/agents/trading_agent.py

from uteki.domains.agent.core.base_agent import BaseAgent
from typing import Dict, Any

class TradingAgent(BaseAgent):
    """交易执行Agent - 负责具体交易决策和执行"""

    def __init__(self, llm_provider: str = "openai", model: str = "gpt-4"):
        super().__init__(
            name="trading_agent",
            llm_provider=llm_provider,
            model=model,
            tools=[
                "get_market_data",
                "get_order_book",
                "execute_order",
                "get_positions",
                "calculate_indicators"
            ]
        )

    def get_system_prompt(self) -> str:
        return """你是一个专业的交易执行Agent。

你的职责：
1. 分析市场数据和技术指标
2. 制定具体的交易决策（买入/卖出/持有）
3. 执行交易订单
4. 管理现有持仓
5. 进行风险控制

可用工具：
- get_market_data: 获取实时市场数据
- get_order_book: 获取订单簿数据
- execute_order: 执行交易订单
- get_positions: 查看当前持仓
- calculate_indicators: 计算技术指标

注意事项：
- 严格遵守风险管理规则
- 每笔交易都要说明理由
- 实时监控市场变化
"""

    async def execute(self, task: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """执行交易任务"""
        # 1. 获取市场数据
        market_data = await self.use_tool("get_market_data", symbol=context["symbol"])

        # 2. 分析数据 (调用LLM)
        analysis = await self._analyze_market(market_data, task)

        # 3. 做出决策
        decision = analysis["decision"]  # "buy", "sell", "hold"

        # 4. 执行交易
        if decision in ["buy", "sell"]:
            order = await self.use_tool(
                "execute_order",
                symbol=context["symbol"],
                side=decision,
                quantity=analysis["quantity"],
                price=analysis.get("price")
            )
            return {
                "status": "success",
                "action": decision,
                "order": order,
                "reasoning": analysis["reasoning"]
            }

        return {
            "status": "success",
            "action": "hold",
            "reasoning": analysis["reasoning"]
        }


# backend/uteki/domains/agent/agents/investing_agent.py

class InvestingAgent(BaseAgent):
    """投资策略Agent - 负责长期投资组合管理"""

    def __init__(self, llm_provider: str = "claude", model: str = "claude-3-5-sonnet"):
        super().__init__(
            name="investing_agent",
            llm_provider=llm_provider,
            model=model,
            tools=[
                "get_fundamental_data",
                "get_financial_reports",
                "analyze_company",
                "portfolio_optimization",
                "risk_assessment"
            ]
        )

    def get_system_prompt(self) -> str:
        return """你是一个专业的投资策略Agent。

你的职责：
1. 进行基本面分析
2. 评估公司财务状况
3. 制定长期投资策略
4. 优化投资组合配置
5. 评估投资风险

投资理念：
- 价值投资优先
- 关注长期增长
- 分散投资风险
- 定期再平衡
"""

    async def execute(self, task: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """执行投资分析任务"""
        # 实现投资分析逻辑
        pass


# backend/uteki/domains/agent/agents/research_agent.py

class ResearchAgent(BaseAgent):
    """研究分析Agent - 负责市场研究和信息收集"""

    def __init__(self, llm_provider: str = "openai", model: str = "gpt-4"):
        super().__init__(
            name="research_agent",
            llm_provider=llm_provider,
            model=model,
            tools=[
                "web_search",
                "news_aggregation",
                "sentiment_analysis",
                "sector_analysis",
                "macro_analysis"
            ]
        )

    def get_system_prompt(self) -> str:
        return """你是一个专业的市场研究Agent。

你的职责：
1. 收集和分析市场新闻
2. 进行情绪分析
3. 追踪行业趋势
4. 分析宏观经济指标
5. 生成研究报告
"""

    async def execute(self, task: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """执行研究任务"""
        # 实现研究逻辑
        pass
```

### 3. Agent注册和使用

```python
# backend/uteki/domains/agent/core/agent_registry.py

from typing import Dict, Type
from uteki.domains.agent.core.base_agent import BaseAgent
from uteki.domains.agent.agents.trading_agent import TradingAgent
from uteki.domains.agent.agents.investing_agent import InvestingAgent
from uteki.domains.agent.agents.research_agent import ResearchAgent

class AgentRegistry:
    """Agent注册表 - 管理所有可用的Agent"""

    def __init__(self):
        self._agents: Dict[str, Type[BaseAgent]] = {}
        self._register_builtin_agents()

    def _register_builtin_agents(self):
        """注册内置Agent"""
        self.register("trading", TradingAgent)
        self.register("investing", InvestingAgent)
        self.register("research", ResearchAgent)

    def register(self, name: str, agent_class: Type[BaseAgent]):
        """注册新的Agent类型"""
        self._agents[name] = agent_class

    def create(self, name: str, **kwargs) -> BaseAgent:
        """创建Agent实例"""
        if name not in self._agents:
            raise ValueError(f"Unknown agent type: {name}")
        return self._agents[name](**kwargs)

    def list_agents(self) -> list[str]:
        """列出所有可用的Agent"""
        return list(self._agents.keys())

# 全局注册表实例
agent_registry = AgentRegistry()
```

### 4. API使用示例

```python
# backend/uteki/domains/agent/api.py

from fastapi import APIRouter, Depends
from uteki.domains.agent.core.agent_registry import agent_registry

router = APIRouter()

@router.post("/execute")
async def execute_agent_task(
    agent_type: str,  # "trading", "investing", "research"
    task: str,
    context: dict
):
    """执行Agent任务"""
    # 创建Agent实例
    agent = agent_registry.create(agent_type)

    # 执行任务
    result = await agent.execute(task, context)

    return result

@router.get("/agents")
async def list_agents():
    """列出所有可用的Agent"""
    return {
        "agents": agent_registry.list_agents()
    }
```

---

## 前端路由扩展

### React Router配置

```typescript
// frontend/src/router/index.tsx

import { createBrowserRouter } from 'react-router-dom'
import AdminLayout from '@/layouts/AdminLayout'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      {
        path: 'admin',
        children: [
          { path: 'api-keys', element: <APIKeysPage /> },
          { path: 'config', element: <ConfigPage /> }
        ]
      },
      {
        path: 'agents',
        children: [
          { path: 'trading', element: <TradingAgentPage /> },
          { path: 'investing', element: <InvestingAgentPage /> },
          { path: 'research', element: <ResearchAgentPage /> }
        ]
      },
      {
        path: 'trading',
        children: [
          { path: 'orders', element: <OrdersPage /> },
          { path: 'positions', element: <PositionsPage /> }
        ]
      },
      {
        path: 'evaluation',
        children: [
          { path: 'backtest', element: <BacktestPage /> },
          { path: 'metrics', element: <MetricsPage /> }
        ]
      }
    ]
  }
])
```

---

## 扩展新Agent的步骤

### 1. 创建Agent类

```bash
# 在 backend/uteki/domains/agent/agents/ 下创建新文件
touch backend/uteki/domains/agent/agents/new_agent.py
```

### 2. 实现Agent逻辑

```python
# backend/uteki/domains/agent/agents/new_agent.py

from uteki.domains.agent.core.base_agent import BaseAgent

class NewAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="new_agent",
            llm_provider="openai",
            model="gpt-4",
            tools=["tool1", "tool2"]
        )

    def get_system_prompt(self) -> str:
        return "你的系统提示词"

    async def execute(self, task: str, context: dict):
        # 实现逻辑
        pass
```

### 3. 注册Agent

```python
# backend/uteki/domains/agent/core/agent_registry.py

from uteki.domains.agent.agents.new_agent import NewAgent

class AgentRegistry:
    def _register_builtin_agents(self):
        # ... 现有注册
        self.register("new_agent", NewAgent)  # 添加新Agent
```

### 4. 添加前端页面（可选）

```tsx
// frontend/src/pages/agents/NewAgentPage.tsx

export default function NewAgentPage() {
  return (
    <div>
      <h1>New Agent</h1>
      {/* Agent UI */}
    </div>
  )
}
```

### 5. 添加路由

```typescript
// frontend/src/router/index.tsx

{
  path: 'agents',
  children: [
    // ... 现有路由
    { path: 'new-agent', element: <NewAgentPage /> }
  ]
}
```

---

## 架构原则

### 1. Domain独立性
- 每个domain是独立的bounded context
- domain之间通过明确的接口通信
- 避免跨domain的直接依赖

### 2. Agent作为策略
- Agent不是domain，是agent domain内的策略实现
- 新增agent类型不创建新domain
- 共享agent框架和工具

### 3. 扩展性
- 通过注册表模式扩展agent
- 通过工具注册表扩展功能
- 通过路由配置扩展页面

### 4. 可维护性
- 统一的agent基类
- 统一的工具接口
- 统一的API模式

---

## 不该做的事

❌ **不要**为每个agent类型创建新的domain
❌ **不要**复制粘贴agent框架代码
❌ **不要**在多个地方实现相同的工具
❌ **不要**硬编码agent配置
❌ **不要**绕过注册表直接创建agent

✅ **应该**在agent domain内扩展
✅ **应该**复用agent核心框架
✅ **应该**通过注册表管理agent和工具
✅ **应该**使用配置文件管理agent参数
✅ **应该**遵循统一的代码组织规范

---

## 参考资源

- [DDD领域驱动设计](https://martinfowler.com/bliki/DomainDrivenDesign.html)
- [策略模式](https://refactoring.guru/design-patterns/strategy)
- [注册表模式](https://martinfowler.com/eaaCatalog/registry.html)
