"""
Agent domain service - 业务逻辑层
"""

from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Tuple, AsyncGenerator
import json

from uteki.domains.agent.models import ChatConversation, ChatMessage
from uteki.domains.agent.repository import ChatConversationRepository, ChatMessageRepository
from uteki.domains.agent import schemas
from uteki.domains.agent.llm_adapter import (
    LLMAdapterFactory,
    LLMProvider,
    LLMMessage,
    LLMConfig,
    BaseLLMAdapter
)
from uteki.common.config import settings


def parse_model_info(model_id: str) -> Tuple[str, str]:
    """
    从模型ID解析出 provider 和 model

    Args:
        model_id: 前端传来的模型ID，如 "claude-sonnet-4-20250514", "gpt-4-turbo", "deepseek-chat"

    Returns:
        (provider, model) 元组
    """
    # 模型ID映射
    model_mapping = {
        # Claude models
        "claude-sonnet-4-20250514": ("anthropic", "claude-sonnet-4-20250514"),
        "claude-3-5-sonnet-20241022": ("anthropic", "claude-3-5-sonnet-20241022"),

        # OpenAI models
        "gpt-4-turbo": ("openai", "gpt-4-turbo"),
        "gpt-4o-mini": ("openai", "gpt-4o-mini"),
        "gpt-4o": ("openai", "gpt-4o"),

        # DeepSeek models
        "deepseek-chat": ("deepseek", "deepseek-chat"),
        "deepseek-coder": ("deepseek", "deepseek-coder"),

        # Qwen models
        "qwen-plus": ("dashscope", "qwen-plus"),
        "qwen-max": ("dashscope", "qwen-max"),

        # MiniMax models
        "abab6.5s-chat": ("minimax", "abab6.5s-chat"),
        "abab6.5-chat": ("minimax", "abab6.5-chat"),

        # Gemini models
        "gemini-2.0-flash-exp": ("google", "gemini-2.0-flash-exp"),
        "gemini-pro": ("google", "gemini-pro"),
    }

    if model_id in model_mapping:
        return model_mapping[model_id]

    # 如果没找到，尝试从 ID 推断
    if "claude" in model_id:
        return ("anthropic", model_id)
    elif "gpt" in model_id:
        return ("openai", model_id)
    elif "deepseek" in model_id:
        return ("deepseek", model_id)
    elif "qwen" in model_id:
        return ("dashscope", model_id)
    elif "abab" in model_id or "minimax" in model_id:
        return ("minimax", model_id)
    elif "gemini" in model_id:
        return ("google", model_id)

    # 默认使用配置的 provider
    return (settings.llm_provider, model_id)


class SimpleLLMService:
    """
    统一的LLM服务 - 使用适配器模式支持多个提供商

    设计理念：
    - 使用统一的 LLM Adapter 架构
    - LLM API keys 由平台管理，用户无需配置
    - 从 settings (.env) 读取配置
    - 支持 OpenAI, Anthropic, DeepSeek, DashScope
    - 支持 tool/function calling
    - 用户可以选择使用哪个模型
    """

    def __init__(self, provider: Optional[str] = None, model: Optional[str] = None):
        """
        初始化 LLM 服务

        Args:
            provider: LLM 提供商（openai, anthropic, deepseek, dashscope）
                     如果为 None，使用 settings 默认值
            model: 模型名称，如果为 None，使用对应 provider 的默认模型
        """
        # 使用传入的 provider，否则使用配置的默认值
        self.provider = (provider or settings.llm_provider).lower()

        # 根据 provider 确定模型
        if model:
            self.model = model
        else:
            # 使用默认模型
            if self.provider == "openai":
                self.model = settings.openai_model
            elif self.provider == "anthropic":
                self.model = settings.anthropic_model
            elif self.provider in ["deepseek", "dashscope", "qwen"]:
                self.model = model or settings.llm_model
            else:
                self.model = settings.llm_model

    def _get_api_key(self) -> str:
        """获取对应 provider 的 API key"""
        if self.provider == "openai":
            if not settings.openai_api_key:
                raise ValueError("OPENAI_API_KEY not configured in .env")
            return settings.openai_api_key
        elif self.provider == "anthropic":
            if not settings.anthropic_api_key:
                raise ValueError("ANTHROPIC_API_KEY not configured in .env")
            return settings.anthropic_api_key
        elif self.provider in ["dashscope", "qwen"]:
            if not settings.dashscope_api_key:
                raise ValueError("DASHSCOPE_API_KEY not configured in .env")
            return settings.dashscope_api_key
        elif self.provider == "deepseek":
            if not settings.deepseek_api_key:
                raise ValueError("DEEPSEEK_API_KEY not configured in .env")
            return settings.deepseek_api_key
        elif self.provider == "minimax":
            if not settings.minimax_api_key:
                raise ValueError("MINIMAX_API_KEY not configured in .env")
            return settings.minimax_api_key
        elif self.provider == "google":
            if not settings.google_api_key:
                raise ValueError("GOOGLE_API_KEY not configured in .env")
            return settings.google_api_key
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")

    def _get_adapter(self, config: Optional[LLMConfig] = None) -> BaseLLMAdapter:
        """创建对应的 LLM Adapter"""
        api_key = self._get_api_key()

        # 映射 provider 名称到 LLMProvider 枚举
        provider_mapping = {
            "openai": LLMProvider.OPENAI,
            "anthropic": LLMProvider.ANTHROPIC,
            "deepseek": LLMProvider.DEEPSEEK,
            "dashscope": LLMProvider.DASHSCOPE,
            "qwen": LLMProvider.QWEN,
            "minimax": LLMProvider.MINIMAX,
            "google": LLMProvider.GOOGLE,
        }

        provider_enum = provider_mapping.get(self.provider)
        if not provider_enum:
            raise ValueError(f"Unsupported provider: {self.provider}")

        return LLMAdapterFactory.create_adapter(
            provider=provider_enum,
            api_key=api_key,
            model=self.model,
            config=config or LLMConfig()
        )

    async def chat_completion(
        self,
        messages: List[dict],
        stream: bool = True,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> AsyncGenerator[str, None]:
        """调用LLM完成对话（使用统一适配器）"""
        try:
            # 创建配置
            config = LLMConfig(
                temperature=temperature,
                max_tokens=max_tokens
            )

            # 获取适配器
            adapter = self._get_adapter(config)

            # 转换消息格式为统一格式
            llm_messages = [
                LLMMessage(role=msg["role"], content=msg["content"])
                for msg in messages
            ]

            # 调用适配器进行对话
            async for chunk in adapter.chat(llm_messages, stream=stream):
                yield chunk

        except Exception as e:
            # 记录详细错误信息
            import traceback
            error_detail = f"{str(e)}\n{traceback.format_exc()}"
            raise ValueError(f"LLM API error ({self.provider}): {error_detail}")


class ChatService:
    """
    聊天服务

    设计理念：
    - LLM调用使用平台配置（.env），用户无需配置
    - 用户可以选择使用哪个模型
    - 对话历史存储在数据库中
    """

    def __init__(self):
        # LLM service 在需要时创建，支持动态选择模型
        pass

    async def create_conversation(
        self, session: AsyncSession, data: schemas.ChatConversationCreate
    ) -> ChatConversation:
        """创建会话"""
        conversation = ChatConversation(
            user_id=data.user_id,
            title=data.title,
            mode=data.mode,
        )
        return await ChatConversationRepository.create(session, conversation)

    async def get_conversation(
        self, session: AsyncSession, conversation_id: str
    ) -> Optional[ChatConversation]:
        """获取会话"""
        return await ChatConversationRepository.get_by_id(session, conversation_id)

    async def list_conversations(
        self,
        session: AsyncSession,
        user_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        include_archived: bool = False
    ) -> Tuple[List[ChatConversation], int]:
        """列出会话"""
        return await ChatConversationRepository.list_by_user(
            session, user_id, skip, limit, include_archived
        )

    async def update_conversation(
        self, session: AsyncSession, conversation_id: str, data: schemas.ChatConversationUpdate
    ) -> Optional[ChatConversation]:
        """更新会话"""
        update_data = data.dict(exclude_unset=True)
        return await ChatConversationRepository.update(session, conversation_id, **update_data)

    async def delete_conversation(
        self, session: AsyncSession, conversation_id: str
    ) -> bool:
        """删除会话"""
        return await ChatConversationRepository.delete(session, conversation_id)

    async def get_conversation_messages(
        self, session: AsyncSession, conversation_id: str
    ) -> List[ChatMessage]:
        """获取会话的所有消息"""
        return await ChatMessageRepository.get_conversation_messages(session, conversation_id)

    async def create_message(
        self,
        session: AsyncSession,
        conversation_id: str,
        role: str,
        content: str,
        llm_provider: Optional[str] = None,
        llm_model: Optional[str] = None,
        token_usage: Optional[dict] = None
    ) -> ChatMessage:
        """创建消息"""
        message = ChatMessage(
            conversation_id=conversation_id,
            role=role,
            content=content,
            llm_provider=llm_provider,
            llm_model=llm_model,
            token_usage=token_usage
        )
        return await ChatMessageRepository.create(session, message)

    async def chat(
        self,
        session: AsyncSession,
        data: schemas.ChatRequest
    ) -> AsyncGenerator[schemas.StreamChunk, None]:
        """
        执行聊天（流式返回）

        LLM配置从.env读取，用户可以选择模型
        """
        # 1. 解析模型信息
        if data.model_id:
            provider, model = parse_model_info(data.model_id)
        else:
            # 使用默认配置
            provider = settings.llm_provider
            model = settings.llm_model

        # 2. 创建 LLM 服务实例
        llm_service = SimpleLLMService(provider=provider, model=model)

        # 3. 获取或创建会话
        if data.conversation_id:
            conversation = await self.get_conversation(session, data.conversation_id)
            if not conversation:
                raise ValueError(f"Conversation {data.conversation_id} not found")
        else:
            # 创建新会话
            conversation = await self.create_conversation(
                session,
                schemas.ChatConversationCreate(
                    title=data.message[:50] if len(data.message) > 50 else data.message,
                    mode=data.mode
                )
            )

        # 4. 保存用户消息
        await self.create_message(
            session,
            conversation_id=conversation.id,
            role="user",
            content=data.message
        )

        # 5. 构建消息历史
        history_messages = await self.get_conversation_messages(session, conversation.id)
        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in history_messages
        ]

        # 6. 调用LLM生成回复（流式）
        assistant_response = ""
        try:
            async for chunk in llm_service.chat_completion(
                messages=messages,
                stream=data.stream
            ):
                assistant_response += chunk
                yield schemas.StreamChunk(
                    conversation_id=conversation.id,
                    chunk=chunk,
                    done=False
                )
        except Exception as e:
            # 返回错误信息
            error_msg = f"调用 {provider} 模型失败: {str(e)}"
            yield schemas.StreamChunk(
                conversation_id=conversation.id,
                chunk="",
                done=True
            )
            # 保存错误消息
            await self.create_message(
                session,
                conversation_id=conversation.id,
                role="assistant",
                content=error_msg,
                llm_provider=provider,
                llm_model=model
            )
            return

        # 7. 保存助手回复
        await self.create_message(
            session,
            conversation_id=conversation.id,
            role="assistant",
            content=assistant_response,
            llm_provider=provider,
            llm_model=model
        )

        # 8. 发送完成信号
        yield schemas.StreamChunk(
            conversation_id=conversation.id,
            chunk="",
            done=True
        )


# 依赖注入工厂函数（用于 FastAPI Depends）

def get_chat_service() -> "ChatService":
    """
    获取聊天服务实例

    注意：LLM配置从.env读取，无需依赖数据库
    """
    return ChatService()
