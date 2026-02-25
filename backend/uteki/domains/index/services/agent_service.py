"""IndexAgent 对话服务"""

import json
import logging
from typing import Optional, Dict, Any, List

from uteki.common.config import settings
from uteki.domains.agent.llm_adapter import (
    LLMAdapterFactory, LLMProvider, LLMConfig, LLMMessage
)
from uteki.domains.index.services.prompt_service import PromptService
from uteki.domains.index.services.memory_service import MemoryService
from uteki.domains.index.services.data_service import DataService
from uteki.domains.index.services.backtest_service import BacktestService
from uteki.domains.index.services.decision_service import DecisionService
from uteki.domains.index.tools.index_tools import get_index_tool_definitions, ToolExecutor

logger = logging.getLogger(__name__)


class AgentService:
    """IndexAgent 对话式交互服务"""

    def __init__(
        self,
        prompt_service: PromptService,
        memory_service: MemoryService,
        data_service: DataService,
        backtest_service: BacktestService,
        decision_service: DecisionService,
    ):
        self.prompt_service = prompt_service
        self.memory_service = memory_service
        self.data_service = data_service
        self.backtest_service = backtest_service
        self.decision_service = decision_service

    async def chat(
        self,
        user_id: str,
        message: str,
    ) -> Dict[str, Any]:
        """处理用户消息，返回 LLM 回复"""
        # 获取 system prompt
        prompt_data = await self.prompt_service.get_current()
        system_prompt = prompt_data["content"] if prompt_data else ""

        # 获取记忆上下文
        memory_summary = await self.memory_service.get_summary(user_id)
        memory_context = self._format_memory_context(memory_summary)

        # 获取观察池数据作为额外上下文
        watchlist = self.data_service.get_watchlist()
        watchlist_info = ", ".join(w["symbol"] for w in watchlist) if watchlist else "（空）"

        full_system = (
            f"{system_prompt}\n\n"
            f"=== 当前观察池 ===\n{watchlist_info}\n\n"
            f"=== 当前记忆 ===\n{memory_context}"
        )

        # 尝试所有可用 LLM（按优先级 fallback）
        adapters = await self._get_all_adapters()
        if not adapters:
            return {"response": "No LLM configured. Please set an API key.", "tool_calls": []}

        messages = [
            LLMMessage(role="system", content=full_system),
            LLMMessage(role="user", content=message),
        ]

        last_error = None
        for adapter_name, adapter in adapters:
            try:
                response_text = ""
                async for chunk in adapter.chat(messages, stream=False):
                    response_text += chunk

                return {
                    "response": response_text,
                    "tool_calls": [],
                }
            except Exception as e:
                logger.warning(f"LLM chat failed with {adapter_name}: {e}")
                last_error = e
                continue

        logger.error(f"All LLM adapters failed, last error: {last_error}")
        return {
            "response": f"LLM 调用失败: {str(last_error)}",
            "tool_calls": [],
        }

    def generate_decision_card(
        self, model_io_data: Dict[str, Any], harness_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """从 Arena 结果生成决策卡片"""
        structured = model_io_data.get("output_structured", {}) or {}

        return {
            "type": "decision_card",
            "harness_id": harness_data.get("id"),
            "harness_type": harness_data.get("harness_type"),
            "source_model": {
                "provider": model_io_data.get("model_provider"),
                "name": model_io_data.get("model_name"),
            },
            "action": structured.get("action", "UNKNOWN"),
            "allocations": structured.get("allocations", []),
            "confidence": structured.get("confidence"),
            "reasoning": structured.get("reasoning"),
            "risk_assessment": structured.get("risk_assessment"),
            "budget": harness_data.get("task", {}).get("budget"),
        }

    async def _get_all_adapters(self) -> List:
        """获取所有可用的 LLM adapter，返回 [(name, adapter), ...]

        从 DB model_config 加载，未配置时抛出 ValueError。
        """
        from uteki.domains.index.services.arena_service import load_models_from_db

        provider_map = {
            "anthropic": LLMProvider.ANTHROPIC,
            "openai": LLMProvider.OPENAI,
            "deepseek": LLMProvider.DEEPSEEK,
            "google": LLMProvider.GOOGLE,
            "qwen": LLMProvider.QWEN,
            "minimax": LLMProvider.MINIMAX,
        }

        db_models = load_models_from_db()
        if not db_models:
            raise ValueError(
                "尚未配置任何 LLM 模型。请前往「Settings → Model Config」页面添加至少一个模型的 API Key。"
            )

        adapters = []
        for m in db_models:
            provider = provider_map.get(m["provider"])
            if not provider:
                continue
            try:
                base_url = m.get("base_url") or (
                    settings.google_api_base_url if m["provider"] == "google" else None
                )
                adapter = LLMAdapterFactory.create_adapter(
                    provider=provider,
                    api_key=m["api_key"],
                    model=m["model"],
                    config=LLMConfig(
                        temperature=m.get("temperature", 0.3),
                        max_tokens=m.get("max_tokens", 4096),
                    ),
                    base_url=base_url,
                )
                adapters.append((f"{m['provider']}/{m['model']}", adapter))
            except Exception as e:
                logger.warning(f"Failed to create adapter for {m['provider']}/{m['model']}: {e}")

        if not adapters:
            raise ValueError(
                "所有已配置的模型均创建失败，请检查「Settings → Model Config」中的 API Key 是否正确。"
            )
        return adapters

    @staticmethod
    def _format_memory_context(summary: Dict[str, Any]) -> str:
        lines = []
        for d in summary.get("recent_decisions", []):
            lines.append(f"近期决策: {d.get('content', '')[:100]}")
        ref = summary.get("recent_reflection")
        if ref:
            lines.append(f"近期反思: {ref.get('content', '')[:100]}")
        for exp in summary.get("experiences", []):
            lines.append(f"经验: {exp.get('content', '')[:80]}")
        return "\n".join(lines) if lines else "（暂无历史记忆）"


_agent_service: Optional[AgentService] = None


def get_agent_service(
    prompt_service: PromptService,
    memory_service: MemoryService,
    data_service: DataService,
    backtest_service: BacktestService,
    decision_service: DecisionService,
) -> AgentService:
    global _agent_service
    if _agent_service is None:
        _agent_service = AgentService(
            prompt_service, memory_service,
            data_service, backtest_service, decision_service,
        )
    return _agent_service
