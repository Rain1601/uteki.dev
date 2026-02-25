"""Prompt 版本管理服务（system / user prompt）— Supabase REST API 版"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from uuid import uuid4

from uteki.common.database import SupabaseRepository, db_manager

logger = logging.getLogger(__name__)

TABLE = "prompt_version"

DEFAULT_SYSTEM_PROMPT = """你是一个专业的指数 ETF 投资顾问。

你的职责：
1. 分析市场数据（价格、估值、技术指标）为用户提供指数 ETF 投资建议
2. 在每次决策中，基于 Decision Harness 提供的完整上下文做出分析
3. 输出结构化的投资决策，包括操作类型、ETF 分配、信心度、推理过程

约束条件：
- 最多持有 3 只指数 ETF
- 仅投资观察池内的标的
- 所有买卖建议需要包含具体金额和比例
- 必须提供决策理由和风险评估
- 当不确定时，建议保持现状（持有）

输出格式要求——你的最终输出必须是且仅是一个 JSON 对象（不含 markdown 标记、不含解释文字），直接以 { 开始、以 } 结束：
{
  "操作": "买入 | 调仓 | 持有 | 跳过",
  "分配": [{"标的": "VOO", "金额": 600, "比例": 60, "理由": "..."}],
  "信心度": 0.85,
  "决策理由": "简要决策理由",
  "思考过程": "完整思考过程...",
  "风险评估": "风险评估",
  "失效条件": "什么情况下此建议无效"
}
"""

DEFAULT_USER_PROMPT_TEMPLATE = """日期: {{date}}
决策类型: {{harness_type}}

=== 市场行情 ===
{{market_quotes}}

=== 估值数据 ===
{{valuations}}

=== 宏观经济 ===
{{macro}}

=== 市场情绪 ===
{{sentiment}}

=== 账户状态 ===
现金: ${{cash}}
总资产: ${{total}}
{{positions}}

=== 可投资预算 ===
可用现金: ${{available_cash}}
本次定投预算: ${{budget}}
{{per_etf_limits}}

=== 记忆摘要 ===
{{memory_summary}}

=== 任务 ===
{{task}}
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_id(data: dict) -> dict:
    """Ensure dict has id + timestamps for a new row."""
    if "id" not in data:
        data["id"] = str(uuid4())
    data.setdefault("created_at", _now_iso())
    data.setdefault("updated_at", _now_iso())
    return data


async def _backup_rows(rows: list):
    """Best-effort SQLite backup (failure only warns)."""
    try:
        from uteki.domains.index.models.prompt_version import PromptVersion
        async with db_manager.get_postgres_session() as session:
            for row in rows:
                safe = {k: v for k, v in row.items() if hasattr(PromptVersion, k)}
                await session.merge(PromptVersion(**safe))
    except Exception as e:
        logger.warning(f"SQLite backup failed for {TABLE}: {e}")


class PromptService:
    """Prompt 版本管理 — 支持 system / user 两种类型"""

    def __init__(self):
        self.repo = SupabaseRepository(TABLE)

    async def get_current(
        self, prompt_type: str = "system"
    ) -> Optional[Dict[str, Any]]:
        """获取当前激活的 prompt 版本"""
        row = self.repo.select_one(
            eq={"prompt_type": prompt_type, "is_current": True}
        )
        if row:
            return row

        return await self._create_default(prompt_type)

    async def update_prompt(
        self, content: str, description: str,
        prompt_type: str = "system",
    ) -> Dict[str, Any]:
        """更新 prompt — 创建新版本"""
        current = self.repo.select_one(
            eq={"prompt_type": prompt_type, "is_current": True}
        )

        if current:
            new_version = self._increment_version(current["version"])
            self.repo.update(
                data={"is_current": False, "updated_at": _now_iso()},
                eq={"id": current["id"]},
            )
        else:
            new_version = "v1.0"

        data = {
            "prompt_type": prompt_type,
            "version": new_version,
            "content": content,
            "description": description,
            "is_current": True,
        }
        _ensure_id(data)
        result = self.repo.upsert(data)
        row = result.data[0] if result.data else data
        await _backup_rows([row])
        logger.info(f"Created {prompt_type} prompt version {new_version}: {description}")
        return row

    async def activate_version(self, version_id: str) -> Dict[str, Any]:
        """将指定版本设为当前版本"""
        target = self.repo.select_one(eq={"id": version_id})
        if not target:
            raise ValueError("Prompt version not found")

        # 将同类型所有当前版本标记为非当前
        current_rows = self.repo.select_data(
            eq={"prompt_type": target["prompt_type"], "is_current": True}
        )
        for row in current_rows:
            self.repo.update(
                data={"is_current": False, "updated_at": _now_iso()},
                eq={"id": row["id"]},
            )

        # 激活目标版本
        result = self.repo.update(
            data={"is_current": True, "updated_at": _now_iso()},
            eq={"id": version_id},
        )
        row = result.data[0] if result.data else target
        logger.info(f"Activated prompt version {target['version']} ({version_id})")
        return row

    async def delete_version(self, version_id: str) -> None:
        """删除指定版本（当前版本禁止删除）"""
        target = self.repo.select_one(eq={"id": version_id})
        if not target:
            raise ValueError("Prompt version not found")
        if target.get("is_current"):
            raise ValueError("Cannot delete the current active version")
        self.repo.delete(eq={"id": version_id})
        logger.info(f"Deleted prompt version {target['version']} ({version_id})")

    async def get_history(
        self, prompt_type: str = "system"
    ) -> List[Dict[str, Any]]:
        """获取所有版本历史"""
        return self.repo.select_data(
            eq={"prompt_type": prompt_type}, order="created_at.desc"
        )

    async def get_by_id(self, version_id: str) -> Optional[Dict[str, Any]]:
        return self.repo.select_one(eq={"id": version_id})

    async def render_user_prompt(
        self, harness_data: dict
    ) -> str:
        """渲染 user prompt 模板，用 harness_data 填充变量"""
        current = await self.get_current(prompt_type="user")
        template = current["content"] if current else DEFAULT_USER_PROMPT_TEMPLATE

        variables = self._build_template_variables(harness_data)

        def replacer(match):
            key = match.group(1)
            return str(variables.get(key, match.group(0)))

        return re.sub(r'\{\{(\w+)\}\}', replacer, template)

    def _build_template_variables(self, harness_data: dict) -> Dict[str, str]:
        """从 harness_data 构建模板变量字典"""
        import json
        from datetime import datetime

        snapshot = harness_data.get("market_snapshot", {})
        quotes = snapshot.get("quotes", {})
        valuations_data = snapshot.get("valuations", {})
        macro_data = snapshot.get("macro", {})
        sentiment_data = snapshot.get("sentiment", {})
        account = harness_data.get("account_state", {})
        task = harness_data.get("task", {})
        constraints = task.get("constraints", {})
        memory = harness_data.get("memory_summary", {})

        # Market quotes
        quote_lines = []
        for symbol, data in quotes.items():
            price = data.get("price", "N/A")
            pe = data.get("pe_ratio", "N/A")
            ma50 = data.get("ma50", "N/A")
            ma200 = data.get("ma200", "N/A")
            rsi = data.get("rsi", "N/A")
            quote_lines.append(f"{symbol}: 价格=${price} | PE={pe} | MA50={ma50} | MA200={ma200} | RSI={rsi}")

        # Valuations
        val_lines = []
        for symbol, v in valuations_data.items():
            pe = v.get("pe_ratio", "N/A")
            cape = v.get("shiller_cape", "N/A")
            div_yield = v.get("dividend_yield", "N/A")
            ey = v.get("earnings_yield", "N/A")
            erp = v.get("equity_risk_premium", "N/A")
            val_lines.append(f"{symbol}: PE={pe} | CAPE={cape} | 股息率={div_yield} | 盈利收益率={ey} | 风险溢价={erp}")

        # Macro
        macro_lines = []
        macro_fields = [
            ("联邦基金利率", "fed_funds_rate", "%"),
            ("利率方向", "fed_rate_direction", ""),
            ("CPI 同比", "cpi_yoy", "%"),
            ("核心 PCE 同比", "core_pce_yoy", "%"),
            ("GDP 季环比", "gdp_growth_qoq", "%"),
            ("失业率", "unemployment_rate", "%"),
            ("ISM 制造业 PMI", "ism_manufacturing_pmi", ""),
            ("ISM 服务业 PMI", "ism_services_pmi", ""),
            ("收益率曲线 2Y-10Y", "yield_curve_2y10y", "bps"),
            ("VIX", "vix", ""),
            ("美元指数 DXY", "dxy", ""),
        ]
        for label, key, suffix in macro_fields:
            val = macro_data.get(key)
            formatted = f"{val}{suffix}" if val is not None else "N/A"
            macro_lines.append(f"{label}: {formatted}")

        # Sentiment
        sent_lines = []
        sent_fields = [
            ("Fear & Greed 指数", "fear_greed_index"),
            ("AAII 看多比例", "aaii_bull_ratio"),
            ("AAII 看空比例", "aaii_bear_ratio"),
            ("Put/Call Ratio", "put_call_ratio"),
            ("新闻情绪评分", "news_sentiment_score"),
        ]
        for label, key in sent_fields:
            val = sentiment_data.get(key)
            sent_lines.append(f"{label}: {val if val is not None else 'N/A'}")
        events = sentiment_data.get("news_key_events", [])
        for evt in events[:5]:
            sent_lines.append(f"  - {evt}")

        # Positions
        pos_lines = []
        for pos in account.get("positions", []):
            pos_lines.append(f"持仓: {pos.get('symbol', '?')} {pos.get('quantity', 0)}股")

        # Budget calculations
        cash = account.get("cash", 0)
        total = account.get("total", 0) or cash
        available_cash = cash
        budget = task.get("budget") or available_cash
        max_pct = constraints.get("max_single_position_pct", 40) / 100.0

        # Per-ETF limits
        etf_limit_lines = []
        positions = account.get("positions", [])
        pos_map = {p.get("symbol", ""): p.get("market_value", 0) for p in positions}
        watchlist = task.get("watchlist", [])
        for symbol in watchlist:
            current_value = pos_map.get(symbol, 0)
            max_allowed = total * max_pct - current_value
            max_buy = min(budget, max(0, max_allowed))
            etf_limit_lines.append(f"  {symbol}: 最大可买 ${max_buy:,.0f} (已持 ${current_value:,.0f}, 上限 {max_pct*100:.0f}%)")

        # Memory summary
        mem_lines = []
        for d in memory.get("recent_decisions", []):
            mem_lines.append(f"近期决策: {d.get('content', '')[:100]}")
        if memory.get("recent_reflection"):
            mem_lines.append(f"近期反思: {memory['recent_reflection'].get('content', '')[:100]}")
        for exp in memory.get("experiences", []):
            mem_lines.append(f"经验: {exp.get('content', '')[:80]}")
        for win in memory.get("recent_voting_winners", []):
            mem_lines.append(f"投票获胜方案: {win[:100]}")

        # Task
        task_lines = [f"类型: {task.get('type', 'unknown')}"]
        if task.get("budget"):
            task_lines.append(f"预算: ${task['budget']}")
        if constraints:
            task_lines.append(f"约束: {json.dumps(constraints, ensure_ascii=False)}")
        if watchlist:
            task_lines.append(f"可投资标的: {', '.join(watchlist)}")

        created_at = harness_data.get("created_at", "")
        if isinstance(created_at, datetime):
            created_at = created_at.isoformat()

        return {
            "date": created_at or datetime.now().isoformat(),
            "harness_type": harness_data.get("harness_type", "unknown"),
            "market_quotes": "\n".join(quote_lines) or "无数据",
            "valuations": "\n".join(val_lines) or "无数据",
            "macro": "\n".join(macro_lines),
            "sentiment": "\n".join(sent_lines),
            "cash": f"{cash:,.2f}",
            "total": f"{total:,.2f}",
            "positions": "\n".join(pos_lines) or "无持仓",
            "available_cash": f"{available_cash:,.2f}",
            "budget": f"{budget:,.2f}",
            "per_etf_limits": "\n".join(etf_limit_lines) or "无数据",
            "memory_summary": "\n".join(mem_lines) or "无记忆",
            "task": "\n".join(task_lines),
        }

    async def _create_default(
        self, prompt_type: str = "system"
    ) -> Dict[str, Any]:
        default_content = (
            DEFAULT_SYSTEM_PROMPT if prompt_type == "system"
            else DEFAULT_USER_PROMPT_TEMPLATE
        )
        default_desc = (
            "Initial default system prompt" if prompt_type == "system"
            else "Initial default user prompt template"
        )
        data = {
            "prompt_type": prompt_type,
            "version": "v1.0",
            "content": default_content,
            "description": default_desc,
            "is_current": True,
        }
        _ensure_id(data)
        result = self.repo.upsert(data)
        row = result.data[0] if result.data else data
        await _backup_rows([row])
        logger.info(f"Created default {prompt_type} prompt version v1.0")
        return row

    @staticmethod
    def _increment_version(version: str) -> str:
        """v1.0 -> v1.1, v1.9 -> v1.10"""
        if not version.startswith("v"):
            return "v1.0"
        parts = version[1:].split(".")
        if len(parts) == 2:
            major, minor = int(parts[0]), int(parts[1])
            return f"v{major}.{minor + 1}"
        return f"v{int(parts[0]) + 1}.0"


_prompt_service: Optional[PromptService] = None


def get_prompt_service() -> PromptService:
    global _prompt_service
    if _prompt_service is None:
        _prompt_service = PromptService()
    return _prompt_service
