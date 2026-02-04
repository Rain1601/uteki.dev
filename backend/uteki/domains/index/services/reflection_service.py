"""反思生成服务 — 月度回顾与经验提取"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession

from uteki.common.config import settings
from uteki.domains.index.services.decision_service import DecisionService
from uteki.domains.index.services.memory_service import MemoryService

logger = logging.getLogger(__name__)


class ReflectionService:
    """月度反思 — 回顾决策、提取经验教训"""

    def __init__(
        self,
        decision_service: DecisionService,
        memory_service: MemoryService,
    ):
        self.decision_service = decision_service
        self.memory_service = memory_service

    async def generate_reflection(
        self,
        user_id: str,
        session: AsyncSession,
        lookback_days: int = 30,
    ) -> Dict[str, Any]:
        """生成月度反思

        1. 获取过去 N 天的决策和反事实数据
        2. 调用 LLM 生成反思
        3. 提取经验写入记忆
        """
        # 获取近期决策
        start_date = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()
        decisions = await self.decision_service.get_timeline(
            session, limit=50, start_date=start_date
        )

        if not decisions:
            return {"status": "skipped", "reason": "No decisions in the past period"}

        # 获取每个决策的反事实分类
        decision_summaries = []
        for d in decisions:
            cfs = await self.decision_service.classify_counterfactuals(d["id"], session)
            decision_summaries.append({
                "date": d.get("created_at"),
                "action": d.get("user_action"),
                "harness_type": d.get("harness_type"),
                "adopted_model": d.get("adopted_model"),
                "counterfactuals": cfs,
            })

        # 构建反思 prompt
        reflection_prompt = self._build_reflection_prompt(decision_summaries)

        # 调用 LLM 生成反思
        adapter = self._get_adapter()
        if not adapter:
            # 无 LLM 可用，生成统计摘要
            return await self._generate_statistical_reflection(
                user_id, decision_summaries, session
            )

        from uteki.domains.agent.llm_adapter import LLMMessage
        messages = [
            LLMMessage(
                role="system",
                content="你是一位投资反思助手。请基于过去的投资决策数据，生成一份简洁的月度反思报告。"
                        "识别正确的决策和错误，提取可复用的经验教训。使用中文回复。"
            ),
            LLMMessage(role="user", content=reflection_prompt),
        ]

        try:
            response = adapter.chat(messages)
            content = response.content if hasattr(response, "content") else str(response)
        except Exception as e:
            logger.error(f"Reflection LLM error: {e}")
            return await self._generate_statistical_reflection(
                user_id, decision_summaries, session
            )

        # 保存反思到记忆
        await self.memory_service.write(
            user_id, "reflection", content, session
        )

        # 提取经验教训
        experiences = self._extract_experiences(content)
        for exp in experiences:
            await self.memory_service.write(
                user_id, "experience", exp, session
            )

        return {
            "status": "completed",
            "reflection": content,
            "decisions_reviewed": len(decisions),
            "experiences_extracted": len(experiences),
        }

    async def _generate_statistical_reflection(
        self,
        user_id: str,
        summaries: List[Dict],
        session: AsyncSession,
    ) -> Dict[str, Any]:
        """无 LLM 时生成统计反思"""
        total = len(summaries)
        approved = sum(1 for s in summaries if s["action"] == "approved")
        skipped = sum(1 for s in summaries if s["action"] == "skipped")
        rejected = sum(1 for s in summaries if s["action"] == "rejected")

        # 统计反事实分类
        missed = 0
        dodged = 0
        correct = 0
        wrong = 0
        for s in summaries:
            for cf in s.get("counterfactuals", []):
                cls = cf.get("classification")
                if cls == "missed_opportunity":
                    missed += 1
                elif cls == "dodged_bullet":
                    dodged += 1
                elif cls == "correct_call":
                    correct += 1
                elif cls == "wrong_call":
                    wrong += 1

        content = (
            f"月度反思 ({datetime.now().strftime('%Y-%m')}): "
            f"共 {total} 个决策 (approved={approved}, skipped={skipped}, rejected={rejected}). "
            f"反事实: correct={correct}, wrong={wrong}, missed={missed}, dodged={dodged}."
        )

        await self.memory_service.write(
            user_id, "reflection", content, session
        )

        return {
            "status": "completed",
            "reflection": content,
            "decisions_reviewed": total,
            "experiences_extracted": 0,
        }

    @staticmethod
    def _build_reflection_prompt(summaries: List[Dict]) -> str:
        lines = [f"过去 {len(summaries)} 个投资决策的数据:\n"]
        for i, s in enumerate(summaries, 1):
            lines.append(f"决策 {i}: {s['date']} | 类型={s['harness_type']} | 行动={s['action']}")
            if s.get("adopted_model"):
                lines.append(f"  采纳模型: {s['adopted_model']}")
            for cf in s.get("counterfactuals", []):
                cls = cf.get("classification", "unknown")
                ret = cf.get("hypothetical_return_pct", 0)
                days = cf.get("tracking_days", "?")
                lines.append(f"  反事实 ({days}d): {ret:+.2f}% [{cls}]")
        lines.append("\n请生成反思报告，包含：")
        lines.append("1. 总体表现评价")
        lines.append("2. 做对了什么（正确的决策及原因）")
        lines.append("3. 做错了什么（错误的决策及教训）")
        lines.append("4. 3-5 条可复用的经验教训（每条一句话）")
        return "\n".join(lines)

    @staticmethod
    def _extract_experiences(reflection: str) -> List[str]:
        """从反思文本中提取经验教训"""
        experiences = []
        lines = reflection.split("\n")
        in_experience = False
        for line in lines:
            stripped = line.strip()
            if "经验" in stripped or "教训" in stripped or "lessons" in stripped.lower():
                in_experience = True
                continue
            if in_experience and stripped and (stripped[0].isdigit() or stripped.startswith("-") or stripped.startswith("*")):
                # 去掉序号
                text = stripped.lstrip("0123456789.-*) ").strip()
                if text and len(text) > 5:
                    experiences.append(text)
            elif in_experience and not stripped:
                # 空行结束经验提取
                if experiences:
                    break
        return experiences[:5]  # 最多 5 条

    def _get_adapter(self):
        from uteki.domains.agent.llm_adapter import (
            LLMAdapterFactory, LLMProvider, LLMConfig
        )
        if settings.anthropic_api_key:
            return LLMAdapterFactory.create_adapter(
                provider=LLMProvider.ANTHROPIC,
                api_key=settings.anthropic_api_key,
                model=settings.llm_model or "claude-sonnet-4-20250514",
                config=LLMConfig(temperature=0.5, max_tokens=2048),
            )
        if settings.openai_api_key:
            return LLMAdapterFactory.create_adapter(
                provider=LLMProvider.OPENAI,
                api_key=settings.openai_api_key,
                model="gpt-4o",
                config=LLMConfig(temperature=0.5, max_tokens=2048),
            )
        return None


_reflection_service: Optional[ReflectionService] = None


def get_reflection_service(
    decision_service: DecisionService,
    memory_service: MemoryService,
) -> ReflectionService:
    global _reflection_service
    if _reflection_service is None:
        _reflection_service = ReflectionService(decision_service, memory_service)
    return _reflection_service
