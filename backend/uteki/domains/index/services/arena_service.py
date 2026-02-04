"""多模型 Arena 调度服务"""

import asyncio
import json
import logging
import re
import time
from typing import Optional, List, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.common.config import settings
from uteki.common.database import db_manager
from uteki.domains.index.models.model_io import ModelIO
from uteki.domains.index.models.decision_harness import DecisionHarness
from uteki.domains.index.models.prompt_version import PromptVersion

logger = logging.getLogger(__name__)

# 模型超时 60s
MODEL_TIMEOUT = 60

# 模型配置
ARENA_MODELS = [
    {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "api_key_attr": "anthropic_api_key"},
    {"provider": "openai", "model": "gpt-4o", "api_key_attr": "openai_api_key"},
    {"provider": "deepseek", "model": "deepseek-chat", "api_key_attr": "deepseek_api_key"},
    {"provider": "google", "model": "gemini-2.5-pro-thinking", "api_key_attr": "google_api_key"},
    {"provider": "qwen", "model": "qwen-plus", "api_key_attr": "dashscope_api_key"},
    {"provider": "minimax", "model": "MiniMax-Text-01", "api_key_attr": "minimax_api_key"},
]


class ArenaService:
    """多模型并行 Arena — 同一 Harness 输入，所有模型独立分析"""

    async def run(
        self,
        harness_id: str,
        session: AsyncSession,
        tool_definitions: Optional[List[Dict]] = None,
    ) -> List[Dict[str, Any]]:
        """运行 Arena — 并行调用所有已配置模型"""
        # 获取 Harness
        harness_q = select(DecisionHarness).where(DecisionHarness.id == harness_id)
        harness_r = await session.execute(harness_q)
        harness = harness_r.scalar_one_or_none()
        if not harness:
            raise ValueError(f"Harness not found: {harness_id}")

        # 获取 prompt 版本
        prompt_q = select(PromptVersion).where(PromptVersion.id == harness.prompt_version_id)
        prompt_r = await session.execute(prompt_q)
        prompt_version = prompt_r.scalar_one_or_none()
        system_prompt = prompt_version.content if prompt_version else ""

        # 构建用户 prompt（Harness 数据序列化）
        user_prompt = self._serialize_harness(harness)

        # 筛选已配置 API key 的模型
        available_models = []
        for m in ARENA_MODELS:
            api_key = getattr(settings, m["api_key_attr"], None)
            if api_key:
                available_models.append({**m, "api_key": api_key})

        if not available_models:
            logger.error("No models configured with API keys for Arena")
            return []

        # 并行调用
        tasks = [
            self._call_model(
                model_config=m,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                harness_id=harness_id,
                session=session,
                tool_definitions=tool_definitions,
            )
            for m in available_models
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        model_ios = []
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Arena model error: {r}")
            elif r:
                model_ios.append(r)

        return model_ios

    async def _call_model(
        self,
        model_config: Dict[str, Any],
        system_prompt: str,
        user_prompt: str,
        harness_id: str,
        session: AsyncSession,
        tool_definitions: Optional[List[Dict]] = None,
    ) -> Optional[Dict[str, Any]]:
        """调用单个模型（使用独立 DB session 避免并发冲突）"""
        from uteki.domains.agent.llm_adapter import (
            LLMAdapterFactory, LLMProvider, LLMConfig, LLMMessage
        )

        provider_name = model_config["provider"]
        model_name = model_config["model"]
        api_key = model_config["api_key"]
        full_input = f"[System Prompt]\n{system_prompt}\n\n[Decision Harness]\n{user_prompt}"

        start_time = time.time()
        # 每个模型使用独立 session，避免 asyncio.gather 并发写入冲突
        async with db_manager.get_postgres_session() as model_session:
            try:
                # 映射 provider
                provider_map = {
                    "anthropic": LLMProvider.ANTHROPIC,
                    "openai": LLMProvider.OPENAI,
                    "deepseek": LLMProvider.DEEPSEEK,
                    "google": LLMProvider.GOOGLE,
                    "qwen": LLMProvider.QWEN,
                    "minimax": LLMProvider.MINIMAX,
                }
                provider = provider_map.get(provider_name)
                if not provider:
                    raise ValueError(f"Unknown provider: {provider_name}")

                # Google Gemini 支持代理 base_url
                base_url = settings.google_api_base_url if provider_name == "google" else None

                adapter = LLMAdapterFactory.create_adapter(
                    provider=provider,
                    api_key=api_key,
                    model=model_name,
                    config=LLMConfig(temperature=0, max_tokens=4096),
                    base_url=base_url,
                )

                messages = [
                    LLMMessage(role="system", content=system_prompt),
                    LLMMessage(role="user", content=user_prompt),
                ]

                # 调用 (with timeout) — adapter.chat() 返回 AsyncGenerator[str, None]
                async def _collect_response():
                    text = ""
                    async for chunk in adapter.chat(messages, stream=False):
                        text += chunk
                    return text

                output_raw = await asyncio.wait_for(
                    _collect_response(),
                    timeout=MODEL_TIMEOUT,
                )

                latency_ms = int((time.time() - start_time) * 1000)
                output_structured = self._parse_structured_output(output_raw)
                parse_status = output_structured.pop("_parse_status", "raw_only")

                # 估算 token 数和成本
                input_tokens = len(full_input) // 4  # 粗估
                output_tokens = len(output_raw) // 4
                cost = self._estimate_cost(provider_name, model_name, input_tokens, output_tokens)

                # 保存 I/O
                model_io = ModelIO(
                    harness_id=harness_id,
                    model_provider=provider_name,
                    model_name=model_name,
                    input_prompt=full_input,
                    input_token_count=input_tokens,
                    output_raw=output_raw,
                    output_structured=output_structured if parse_status != "raw_only" else None,
                    tool_calls=None,
                    output_token_count=output_tokens,
                    latency_ms=latency_ms,
                    cost_usd=cost,
                    parse_status=parse_status,
                    status="success",
                )
                model_session.add(model_io)
                await model_session.commit()
                await model_session.refresh(model_io)

                logger.info(f"Arena model {provider_name}/{model_name}: {latency_ms}ms, parse={parse_status}")
                return model_io.to_dict()

            except asyncio.TimeoutError:
                latency_ms = int((time.time() - start_time) * 1000)
                model_io = ModelIO(
                    harness_id=harness_id,
                    model_provider=provider_name,
                    model_name=model_name,
                    input_prompt=full_input,
                    status="timeout",
                    latency_ms=latency_ms,
                    error_message=f"Timeout after {MODEL_TIMEOUT}s",
                )
                model_session.add(model_io)
                await model_session.commit()
                await model_session.refresh(model_io)
                logger.warning(f"Arena model {provider_name}/{model_name}: timeout after {latency_ms}ms")
                return model_io.to_dict()

            except Exception as e:
                latency_ms = int((time.time() - start_time) * 1000)
                model_io = ModelIO(
                    harness_id=harness_id,
                    model_provider=provider_name,
                    model_name=model_name,
                    input_prompt=full_input,
                    status="error",
                    latency_ms=latency_ms,
                    error_message=str(e),
                )
                model_session.add(model_io)
                await model_session.commit()
                await model_session.refresh(model_io)
                logger.error(f"Arena model {provider_name}/{model_name}: error {e}")
                return model_io.to_dict()

    def _parse_structured_output(self, raw: str) -> Dict[str, Any]:
        """解析模型输出为结构化格式"""
        # 1. 尝试 JSON 解析
        try:
            # 提取 JSON 块
            json_match = re.search(r'```json\s*(.*?)\s*```', raw, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group(1))
                parsed["_parse_status"] = "structured"
                return parsed

            # 直接尝试解析
            parsed = json.loads(raw)
            parsed["_parse_status"] = "structured"
            return parsed
        except (json.JSONDecodeError, ValueError):
            pass

        # 2. Regex fallback
        result: Dict[str, Any] = {}
        action_match = re.search(r'"?action"?\s*[:=]\s*"?(\w+)"?', raw, re.IGNORECASE)
        if action_match:
            result["action"] = action_match.group(1).upper()

        confidence_match = re.search(r'"?confidence"?\s*[:=]\s*([\d.]+)', raw, re.IGNORECASE)
        if confidence_match:
            result["confidence"] = float(confidence_match.group(1))

        if result:
            result["_parse_status"] = "partial"
            return result

        # 3. Raw only
        return {"_parse_status": "raw_only"}

    @staticmethod
    def _serialize_harness(harness: DecisionHarness) -> str:
        """序列化 Harness 为 prompt 文本"""
        lines = [
            f"日期: {harness.created_at.isoformat() if harness.created_at else 'unknown'}",
            f"决策类型: {harness.harness_type}",
            "",
            "=== 市场数据快照 ===",
        ]
        for symbol, data in (harness.market_snapshot or {}).items():
            price = data.get("price", "N/A")
            pe = data.get("pe_ratio", "N/A")
            ma50 = data.get("ma50", "N/A")
            rsi = data.get("rsi", "N/A")
            lines.append(f"{symbol}: 价格=${price} | PE={pe} | MA50={ma50} | RSI={rsi}")

        lines.append("")
        lines.append("=== 账户状态 ===")
        account = harness.account_state or {}
        lines.append(f"现金: ${account.get('cash', 0)}")
        lines.append(f"总资产: ${account.get('total', 0)}")
        for pos in account.get("positions", []):
            lines.append(f"持仓: {pos.get('symbol', '?')} {pos.get('quantity', 0)}股")

        lines.append("")
        lines.append("=== 记忆摘要 ===")
        memory = harness.memory_summary or {}
        for d in memory.get("recent_decisions", []):
            lines.append(f"近期决策: {d.get('content', '')[:100]}")
        if memory.get("recent_reflection"):
            lines.append(f"近期反思: {memory['recent_reflection'].get('content', '')[:100]}")
        for exp in memory.get("experiences", []):
            lines.append(f"经验: {exp.get('content', '')[:80]}")

        lines.append("")
        lines.append("=== 任务 ===")
        task = harness.task or {}
        lines.append(f"类型: {task.get('type', 'unknown')}")
        if task.get("budget"):
            lines.append(f"预算: ${task['budget']}")
        constraints = task.get("constraints", {})
        if constraints:
            lines.append(f"约束: {json.dumps(constraints, ensure_ascii=False)}")

        return "\n".join(lines)

    @staticmethod
    def _estimate_cost(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
        """估算调用成本"""
        rates = {
            "anthropic": {"input": 3.0, "output": 15.0},  # per 1M tokens
            "openai": {"input": 2.5, "output": 10.0},
            "deepseek": {"input": 0.14, "output": 0.28},
            "google": {"input": 0.075, "output": 0.30},
            "qwen": {"input": 0.8, "output": 2.0},
            "minimax": {"input": 1.0, "output": 3.0},
        }
        rate = rates.get(provider, {"input": 1.0, "output": 5.0})
        return round(
            (input_tokens * rate["input"] + output_tokens * rate["output"]) / 1_000_000,
            4,
        )

    async def get_arena_results(
        self, harness_id: str, session: AsyncSession
    ) -> List[Dict[str, Any]]:
        """获取某次 Arena 的所有模型结果"""
        query = select(ModelIO).where(ModelIO.harness_id == harness_id)
        result = await session.execute(query)
        return [m.to_dict() for m in result.scalars().all()]

    async def get_model_io_detail(
        self, model_io_id: str, session: AsyncSession
    ) -> Optional[Dict[str, Any]]:
        """获取单个模型的完整 I/O"""
        query = select(ModelIO).where(ModelIO.id == model_io_id)
        result = await session.execute(query)
        mio = result.scalar_one_or_none()
        return mio.to_full_dict() if mio else None


_arena_service: Optional[ArenaService] = None


def get_arena_service() -> ArenaService:
    global _arena_service
    if _arena_service is None:
        _arena_service = ArenaService()
    return _arena_service
