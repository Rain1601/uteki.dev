"""模型评分与排行榜服务"""

import logging
from typing import Optional, List, Dict, Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.domains.index.models.model_score import ModelScore
from uteki.domains.index.models.prompt_version import PromptVersion

logger = logging.getLogger(__name__)


class ScoreService:
    """模型评分管理 — 采纳率、胜率、反事实胜率"""

    async def update_on_adoption(
        self,
        model_provider: str,
        model_name: str,
        prompt_version_id: str,
        session: AsyncSession,
    ) -> None:
        """用户采纳时更新评分"""
        score = await self._get_or_create(model_provider, model_name, prompt_version_id, session)
        score.adoption_count += 1
        await session.commit()

    async def update_on_decision(
        self,
        model_provider: str,
        model_name: str,
        prompt_version_id: str,
        session: AsyncSession,
    ) -> None:
        """每次 Arena 参与时增加总决策数"""
        score = await self._get_or_create(model_provider, model_name, prompt_version_id, session)
        score.total_decisions += 1
        await session.commit()

    async def update_on_counterfactual(
        self,
        model_provider: str,
        model_name: str,
        prompt_version_id: str,
        hypothetical_return_pct: float,
        was_adopted: bool,
        session: AsyncSession,
    ) -> None:
        """反事实数据可用时更新"""
        score = await self._get_or_create(model_provider, model_name, prompt_version_id, session)

        # 反事实统计
        score.counterfactual_total += 1
        if hypothetical_return_pct > 0:
            score.counterfactual_win_count += 1

        # 被采纳的：更新 win/loss
        if was_adopted:
            if hypothetical_return_pct > 0:
                score.win_count += 1
            else:
                score.loss_count += 1

        # 更新平均收益
        total = score.counterfactual_total
        score.avg_return_pct = (
            (score.avg_return_pct * (total - 1) + hypothetical_return_pct) / total
            if total > 0 else 0
        )

        await session.commit()

    async def get_leaderboard(
        self,
        session: AsyncSession,
        prompt_version_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """获取排行榜"""
        query = select(ModelScore)

        if prompt_version_id:
            query = query.where(ModelScore.prompt_version_id == prompt_version_id)
        else:
            # 默认取当前 prompt 版本
            current_prompt = (
                select(PromptVersion.id)
                .where(PromptVersion.is_current == True)
                .scalar_subquery()
            )
            query = query.where(ModelScore.prompt_version_id == current_prompt)

        query = query.order_by(
            (ModelScore.approve_vote_count - ModelScore.rejection_count).desc(),
            ModelScore.adoption_count.desc(),
            ModelScore.avg_return_pct.desc(),
        )
        result = await session.execute(query)
        scores = result.scalars().all()

        leaderboard = []
        for rank, score in enumerate(scores, 1):
            d = score.to_dict()
            d["rank"] = rank
            leaderboard.append(d)

        return leaderboard

    async def _get_or_create(
        self,
        model_provider: str,
        model_name: str,
        prompt_version_id: str,
        session: AsyncSession,
    ) -> ModelScore:
        query = select(ModelScore).where(
            and_(
                ModelScore.model_provider == model_provider,
                ModelScore.model_name == model_name,
                ModelScore.prompt_version_id == prompt_version_id,
            )
        )
        result = await session.execute(query)
        score = result.scalar_one_or_none()

        if not score:
            score = ModelScore(
                model_provider=model_provider,
                model_name=model_name,
                prompt_version_id=prompt_version_id,
            )
            session.add(score)
            await session.flush()

        return score


_score_service: Optional[ScoreService] = None


def get_score_service() -> ScoreService:
    global _score_service
    if _score_service is None:
        _score_service = ScoreService()
    return _score_service
