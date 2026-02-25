"""Agent function calling 工具定义与执行调度"""

import logging
from typing import Optional, Dict, Any, List

from uteki.domains.agent.llm_adapter import LLMTool

logger = logging.getLogger(__name__)


def get_index_tool_definitions() -> List[LLMTool]:
    """返回 IndexAgent 可用的所有工具定义"""
    return [
        LLMTool(
            name="get_index_quote",
            description="获取指数 ETF 的实时或近实时报价，包括价格、涨跌幅、PE、MA50、MA200、RSI 等指标",
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "ETF symbol, e.g. VOO, QQQ"}
                },
                "required": ["symbol"],
            },
        ),
        LLMTool(
            name="get_index_history",
            description="获取指数 ETF 的历史日线数据（OHLCV），可指定日期范围",
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "ETF symbol"},
                    "period": {"type": "string", "description": "时间范围: 7d / 30d / 90d / 1y / 5y", "default": "30d"},
                },
                "required": ["symbol"],
            },
        ),
        LLMTool(
            name="run_backtest",
            description="执行回测：给定初始资金、定投金额和时间范围，评估指数 ETF 的历史收益表现",
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "ETF symbol"},
                    "start": {"type": "string", "description": "Start date YYYY-MM"},
                    "end": {"type": "string", "description": "End date YYYY-MM"},
                    "initial_capital": {"type": "number", "description": "初始资金", "default": 10000},
                    "monthly_dca": {"type": "number", "description": "每月定投金额", "default": 0},
                },
                "required": ["symbol", "start", "end"],
            },
        ),
        LLMTool(
            name="get_portfolio",
            description="获取 SNB 账户当前持仓列表（symbol、数量、成本、市值）",
            parameters={
                "type": "object",
                "properties": {},
            },
        ),
        LLMTool(
            name="get_balance",
            description="获取 SNB 账户余额（总资产、现金、持仓市值）",
            parameters={
                "type": "object",
                "properties": {},
            },
        ),
        LLMTool(
            name="get_transactions",
            description="获取 SNB 账户交易历史记录",
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "筛选特定股票代码"},
                    "limit": {"type": "integer", "description": "返回数量", "default": 20},
                },
            },
        ),
        LLMTool(
            name="place_order",
            description="通过 SNB 下单买入或卖出 ETF（需要用户确认 + TOTP 验证，Agent 不能直接执行）",
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "ETF symbol"},
                    "side": {"type": "string", "enum": ["BUY", "SELL"], "description": "买卖方向"},
                    "quantity": {"type": "number", "description": "数量"},
                    "order_type": {"type": "string", "enum": ["MKT", "LMT"], "default": "MKT"},
                    "price": {"type": "number", "description": "限价单价格（仅 LMT 时需要）"},
                },
                "required": ["symbol", "side", "quantity"],
            },
        ),
        LLMTool(
            name="search_web",
            description="搜索网络获取关于 ETF、市场、宏观经济的最新信息",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                },
                "required": ["query"],
            },
        ),
        LLMTool(
            name="read_memory",
            description="读取 Agent 的历史记忆（决策摘要、反思、经验、观察）",
            parameters={
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["decision", "reflection", "experience", "observation"],
                        "description": "记忆类别",
                    },
                    "limit": {"type": "integer", "description": "返回数量", "default": 10},
                },
            },
        ),
        LLMTool(
            name="write_memory",
            description="保存新的观察或经验到 Agent 记忆中",
            parameters={
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["experience", "observation"],
                        "description": "记忆类别（Agent 只能写 experience 和 observation）",
                    },
                    "content": {"type": "string", "description": "记忆内容"},
                },
                "required": ["category", "content"],
            },
        ),
        LLMTool(
            name="get_decision_log",
            description="检索历史决策记录，包括 Arena 分析结果、用户行为、执行结果",
            parameters={
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "返回数量", "default": 5},
                    "decision_id": {"type": "string", "description": "特定决策 ID"},
                },
            },
        ),
        LLMTool(
            name="propose_watchlist_symbol",
            description="提议将一个新 ETF 加入观察池。需提供 symbol、名称、类型和研究理由。Agent 提议后需要用户确认才会添加。",
            parameters={
                "type": "object",
                "properties": {
                    "symbol": {"type": "string", "description": "ETF symbol, e.g. SCHD"},
                    "name": {"type": "string", "description": "ETF 名称"},
                    "etf_type": {"type": "string", "description": "ETF 类型 (e.g. US Large Cap, International, Bond)"},
                    "reason": {"type": "string", "description": "推荐理由"},
                },
                "required": ["symbol", "reason"],
            },
        ),
    ]


class ToolExecutor:
    """工具执行调度器 — 将工具调用映射到 service 方法"""

    def __init__(self, data_service, backtest_service, memory_service, decision_service, user_id="default"):
        self.data_service = data_service
        self.backtest_service = backtest_service
        self.memory_service = memory_service
        self.decision_service = decision_service
        self.user_id = user_id

    async def execute(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """执行工具调用"""
        handlers = {
            "get_index_quote": self._get_index_quote,
            "get_index_history": self._get_index_history,
            "run_backtest": self._run_backtest,
            "get_portfolio": self._get_portfolio,
            "get_balance": self._get_balance,
            "get_transactions": self._get_transactions,
            "place_order": self._place_order,
            "search_web": self._search_web,
            "read_memory": self._read_memory,
            "write_memory": self._write_memory,
            "get_decision_log": self._get_decision_log,
            "propose_watchlist_symbol": self._propose_watchlist_symbol,
        }

        handler = handlers.get(tool_name)
        if not handler:
            return {"error": f"Unknown tool: {tool_name}"}

        try:
            return await handler(arguments)
        except Exception as e:
            logger.error(f"Tool {tool_name} error: {e}")
            return {"error": str(e)}

    async def _get_index_quote(self, args: Dict) -> Any:
        return await self.data_service.get_quote(args["symbol"])

    async def _get_index_history(self, args: Dict) -> Any:
        from datetime import date, timedelta
        period = args.get("period", "30d")
        period_map = {"7d": 7, "30d": 30, "90d": 90, "1y": 365, "5y": 1825}
        days = period_map.get(period, 30)
        end = date.today().isoformat()
        start = (date.today() - timedelta(days=days)).isoformat()
        data = self.data_service.get_history(args["symbol"], start=start, end=end)
        return {"symbol": args["symbol"], "period": period, "count": len(data), "prices": data[-20:]}  # 限制返回量

    async def _run_backtest(self, args: Dict) -> Any:
        return await self.backtest_service.run(
            args["symbol"], args["start"], args["end"],
            args.get("initial_capital", 10000),
            args.get("monthly_dca", 0),
        )

    async def _get_portfolio(self, args: Dict) -> Any:
        try:
            from uteki.domains.snb.api import _require_client
            client = _require_client()
            return await client.get_positions()
        except Exception as e:
            return {"error": f"SNB not available: {e}"}

    async def _get_balance(self, args: Dict) -> Any:
        try:
            from uteki.domains.snb.api import _require_client
            client = _require_client()
            return await client.get_balance()
        except Exception as e:
            return {"error": f"SNB not available: {e}"}

    async def _get_transactions(self, args: Dict) -> Any:
        try:
            from uteki.domains.snb.api import _require_client
            client = _require_client()
            return await client.get_transaction_list(
                symbol=args.get("symbol"), limit=args.get("limit", 20)
            )
        except Exception as e:
            return {"error": f"SNB not available: {e}"}

    async def _place_order(self, args: Dict) -> Any:
        # Agent 不能直接下单，返回提示需要用户确认
        return {
            "status": "requires_user_confirmation",
            "message": "下单操作需要用户通过决策卡片确认并提供 TOTP 验证码",
            "order": args,
        }

    async def _search_web(self, args: Dict) -> Any:
        try:
            from uteki.domains.agent.research.web_search import WebSearchService
            search_service = WebSearchService()
            results = await search_service.search(args["query"], max_results=5)
            return results
        except Exception as e:
            return {"error": f"Web search not available: {e}"}

    async def _read_memory(self, args: Dict) -> Any:
        return await self.memory_service.read(
            self.user_id,
            category=args.get("category"),
            limit=args.get("limit", 10),
        )

    async def _write_memory(self, args: Dict) -> Any:
        category = args.get("category", "observation")
        if category not in ("experience", "observation"):
            return {"error": "Agent can only write experience or observation memories"}
        return await self.memory_service.write(
            self.user_id, category, args["content"]
        )

    async def _get_decision_log(self, args: Dict) -> Any:
        if args.get("decision_id"):
            return await self.decision_service.get_by_id(args["decision_id"])
        return await self.decision_service.get_timeline(
            limit=args.get("limit", 5)
        )

    async def _propose_watchlist_symbol(self, args: Dict) -> Any:
        """Agent 提议新 symbol — 返回提议卡片供用户确认"""
        return {
            "status": "requires_user_confirmation",
            "type": "new_symbol_card",
            "symbol": args.get("symbol", "").upper(),
            "name": args.get("name"),
            "etf_type": args.get("etf_type"),
            "reason": args.get("reason"),
            "message": f"Agent proposes adding {args.get('symbol', '').upper()} to watchlist. User confirmation required.",
        }
