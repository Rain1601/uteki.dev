"""新闻 AI 分析服务 - 使用 LLM 分析新闻和经济事件"""

import logging
from typing import Optional, Dict, AsyncGenerator
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from uteki.domains.news.models import NewsArticle
from uteki.domains.agent.llm_adapter import LLMAdapterFactory, LLMProvider

logger = logging.getLogger(__name__)


def build_news_analysis_prompt(title: str, content: str, source: Optional[str] = None) -> str:
    """构建新闻分析提示词"""
    return f"""请分析以下新闻对经济的影响：

标题：{title}
内容：{content}
来源：{source or 'N/A'}

请按以下格式输出分析结果：

IMPACT: [positive/negative/neutral]

ANALYSIS:
[用2-3段简洁的文字说明：
1. 该新闻的核心要点
2. 对经济和金融市场的具体影响（股市、债市、商品等）
3. 投资者应关注的重点和风险]

要求：
- 第一行必须是"IMPACT: "后跟positive/negative/neutral三者之一
- 后面的ANALYSIS部分用简洁专业的语言，每段2-4句话
- 重点关注对市场的实际影响"""


def build_event_analysis_prompt(
    event_title: str,
    event_date: str,
    event_type: str = "economic_data",
    actual_value: Optional[str] = None,
    forecast_value: Optional[str] = None,
    previous_value: Optional[str] = None,
    description: Optional[str] = None
) -> str:
    """构建经济事件分析提示词"""
    data_info = ""
    if actual_value or forecast_value or previous_value:
        data_info = f"""
实际值：{actual_value or 'N/A'}
预期值：{forecast_value or 'N/A'}
前值：{previous_value or 'N/A'}"""

    return f"""请分析以下经济事件对经济的影响：

事件：{event_title}
类型：{event_type}
时间：{event_date}
{data_info}
描述：{description or '无'}

请按以下格式输出分析结果：

IMPACT: [positive/negative/neutral]

ANALYSIS:
[用2-3段简洁的文字说明：
1. 该事件的核心要点和数据解读
2. 对经济和金融市场的具体影响（货币政策、股市、债市、汇率等）
3. 投资者应关注的重点和风险]

要求：
- 第一行必须是"IMPACT: "后跟positive/negative/neutral三者之一
- 后面的ANALYSIS部分用简洁专业的语言，每段2-4句话
- 如有数据，重点分析实际值与预期的差异及其市场含义"""


def parse_llm_response(raw_response: str) -> tuple[str, str]:
    """解析 LLM 返回的结果，提取 IMPACT 和 ANALYSIS"""
    impact = "neutral"
    analysis = raw_response

    if "IMPACT:" in raw_response:
        lines = raw_response.split('\n')
        for line in lines:
            if line.strip().startswith("IMPACT:"):
                impact_text = line.split("IMPACT:")[1].strip().lower()
                if "positive" in impact_text:
                    impact = "positive"
                elif "negative" in impact_text:
                    impact = "negative"
                else:
                    impact = "neutral"
                break

        if "ANALYSIS:" in raw_response:
            analysis = raw_response.split("ANALYSIS:")[1].strip()
        else:
            analysis = '\n'.join([line for line in lines if not line.strip().startswith("IMPACT:")])
            analysis = analysis.strip()

    return impact, analysis


class NewsAnalysisService:
    """新闻 AI 分析服务"""

    SYSTEM_PROMPT_NEWS = "你是一位资深的金融分析师和经济学家，擅长解读新闻和分析其对经济、市场的影响。你的分析专业、客观、有深度，并能提供实用的投资建议。"

    SYSTEM_PROMPT_EVENT = "你是一位资深的宏观经济分析师，对货币政策、财政政策、经济数据有深刻理解。你擅长分析经济事件对金融市场的影响，并能提供专业的投资策略建议。"

    def __init__(self):
        self._llm_adapter = None

    def _get_llm_adapter(self):
        """获取 LLM adapter"""
        if self._llm_adapter is None:
            self._llm_adapter = LLMAdapterFactory.create(LLMProvider.ANTHROPIC)
        return self._llm_adapter

    async def analyze_news_stream(
        self,
        title: str,
        content: str,
        source: Optional[str] = None,
        article_id: Optional[str] = None,
        session: Optional[AsyncSession] = None
    ) -> AsyncGenerator[Dict, None]:
        """
        流式分析新闻内容

        Yields:
            {"content": str, "done": bool} 或 {"done": true, "impact": str, "analysis": str}
        """
        try:
            logger.info(f"开始流式分析新闻: {title[:50]}...")

            prompt = build_news_analysis_prompt(title, content, source)
            adapter = self._get_llm_adapter()

            messages = [
                {"role": "system", "content": self.SYSTEM_PROMPT_NEWS},
                {"role": "user", "content": prompt}
            ]

            accumulated_content = ""

            async for chunk in adapter.chat_stream(messages):
                if chunk:
                    accumulated_content += chunk
                    yield {"content": chunk, "done": False}

            # 解析最终结果
            impact, analysis = parse_llm_response(accumulated_content)

            # 保存分析结果到数据库
            if article_id and session:
                await self._save_analysis_result(
                    session, article_id, impact, analysis
                )

            logger.info(f"新闻分析完成 - 影响: {impact}")
            yield {"content": "", "done": True, "impact": impact, "analysis": analysis}

        except Exception as e:
            logger.error(f"新闻分析失败: {e}", exc_info=True)
            yield {"error": str(e), "done": True}

    async def analyze_event_stream(
        self,
        event_title: str,
        event_date: str,
        event_type: str = "economic_data",
        actual_value: Optional[str] = None,
        forecast_value: Optional[str] = None,
        previous_value: Optional[str] = None,
        description: Optional[str] = None
    ) -> AsyncGenerator[Dict, None]:
        """
        流式分析经济事件

        Yields:
            {"content": str, "done": bool} 或 {"done": true, "impact": str, "analysis": str}
        """
        try:
            logger.info(f"开始流式分析经济事件: {event_title[:50]}...")

            prompt = build_event_analysis_prompt(
                event_title, event_date, event_type,
                actual_value, forecast_value, previous_value, description
            )
            adapter = self._get_llm_adapter()

            messages = [
                {"role": "system", "content": self.SYSTEM_PROMPT_EVENT},
                {"role": "user", "content": prompt}
            ]

            accumulated_content = ""

            async for chunk in adapter.chat_stream(messages):
                if chunk:
                    accumulated_content += chunk
                    yield {"content": chunk, "done": False}

            # 解析最终结果
            impact, analysis = parse_llm_response(accumulated_content)

            logger.info(f"经济事件分析完成 - 影响: {impact}")
            yield {"content": "", "done": True, "impact": impact, "analysis": analysis}

        except Exception as e:
            logger.error(f"经济事件分析失败: {e}", exc_info=True)
            yield {"error": str(e), "done": True}

    async def _save_analysis_result(
        self,
        session: AsyncSession,
        article_id: str,
        impact: str,
        analysis: str
    ):
        """保存分析结果到数据库"""
        try:
            stmt = select(NewsArticle).where(NewsArticle.id == article_id)
            result = await session.execute(stmt)
            article = result.scalar_one_or_none()

            if article:
                article.ai_analysis = analysis
                article.ai_impact = impact
                article.ai_analysis_status = 'completed'
                article.ai_analyzed_at = datetime.now()
                article.ai_analysis_model = 'claude-sonnet'
                await session.commit()
                logger.info(f"分析结果已保存: {article_id}")
            else:
                logger.warning(f"文章不存在: {article_id}")

        except Exception as e:
            logger.error(f"保存分析结果失败: {e}")


# 全局单例
_news_analysis_service: Optional[NewsAnalysisService] = None


def get_news_analysis_service() -> NewsAnalysisService:
    """获取新闻分析服务实例"""
    global _news_analysis_service
    if _news_analysis_service is None:
        _news_analysis_service = NewsAnalysisService()
    return _news_analysis_service
