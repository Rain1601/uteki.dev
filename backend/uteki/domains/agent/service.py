"""
Agent domain service - 业务逻辑层
"""

from typing import List, Optional, Tuple, AsyncGenerator
import json

from uteki.domains.agent.repository import ChatConversationRepository, ChatMessageRepository
from uteki.domains.agent import schemas
from uteki.domains.agent.llm_adapter import (
    LLMAdapterFactory,
    LLMMessage,
    LLMConfig,
    BaseLLMAdapter
)


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

        # Doubao models
        "doubao-seed-2-0-pro-260215": ("doubao", "doubao-seed-2-0-pro-260215"),
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
    elif "doubao" in model_id:
        return ("doubao", model_id)

    # 默认：让 SimpleLLMService 从 DB 自动选择
    return ("", model_id)


class SimpleLLMService:
    """
    统一的LLM服务 - 使用适配器模式支持多个提供商

    设计理念：
    - 使用统一的 LLM Adapter 架构
    - LLM API keys 从数据库 model_config 读取
    - 支持 OpenAI, Anthropic, DeepSeek, DashScope, Google, MiniMax
    - 支持 tool/function calling
    - 用户可以选择使用哪个模型
    """

    # provider 别名统一映射
    _PROVIDER_ALIASES = {
        "dashscope": "qwen",
    }

    def __init__(
        self,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        user_id: Optional[str] = None,
    ):
        """
        初始化 LLM 服务

        Args:
            provider: LLM 提供商（openai, anthropic, deepseek, qwen, google, minimax）
                     如果为 None，使用 DB 中第一个可用模型
            model: 模型名称，如果为 None，使用对应 provider 的 DB 配置模型
            user_id: 当前用户 ID — 用于 user-scoped aggregator/provider key 查询
        """
        self._user_id = user_id
        # NOTE: load_models_from_db() 当前不接受 user_id, 返回空列表 + 日志告警。
        # 这仅用于"DB 有配置模型时自动选第一个"的便利功能。即使为空, 下面的 aggregator
        # 路径 (create_unified_for_user) 仍然能工作, 因为它会回退到 env / provider-
        # specific key.
        from uteki.domains.index.services.arena_service import load_models_from_db
        self._db_models = load_models_from_db()

        requested_provider = (provider or "").lower()
        requested_provider = self._PROVIDER_ALIASES.get(requested_provider, requested_provider)

        if requested_provider and model:
            self.provider = requested_provider
            self.model = model
        elif requested_provider:
            match = next((m for m in self._db_models if m["provider"] == requested_provider), None)
            self.provider = requested_provider
            self.model = model or (match["model"] if match else requested_provider)
        elif self._db_models:
            first = self._db_models[0]
            self.provider = first["provider"]
            self.model = model or first["model"]
        else:
            # 没指定 provider 且 DB 也空 — 走 aggregator 默认模型兜底。
            self.provider = "openai"
            self.model = model or "gpt-4.1"

    def _get_api_key(self) -> str:
        """从 DB model_config 获取对应 provider 的 API key"""
        provider = self._PROVIDER_ALIASES.get(self.provider, self.provider)

        # 精确匹配 provider + model
        for m in self._db_models:
            if m["provider"] == provider and m["model"] == self.model:
                return m["api_key"]

        # 仅匹配 provider
        for m in self._db_models:
            if m["provider"] == provider:
                return m["api_key"]

        raise ValueError(
            f"未找到 {self.provider} 的 API Key 配置。请前往「Settings → Model Config」页面配置。"
        )

    async def _get_adapter_async(self, config: Optional[LLMConfig] = None) -> BaseLLMAdapter:
        """创建 LLM Adapter。

        优先使用当前用户存储在 DB 的 aggregator key (AIHubMix/OpenRouter),
        没有则回退到环境变量 / provider-specific env keys。
        """
        return await LLMAdapterFactory.create_unified_for_user(
            user_id=self._user_id,
            model=self.model,
            config=config or LLMConfig(),
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
            config = LLMConfig(
                temperature=temperature,
                max_tokens=max_tokens
            )

            adapter = await self._get_adapter_async(config)

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

    async def create_conversation(self, data: schemas.ChatConversationCreate) -> dict:
        """创建会话"""
        conv_data = {
            "user_id": data.user_id,
            "title": data.title,
            "mode": data.mode,
        }
        return await ChatConversationRepository.create(conv_data)

    async def get_conversation(self, conversation_id: str) -> Optional[dict]:
        """获取会话"""
        return await ChatConversationRepository.get_by_id(conversation_id)

    async def list_conversations(
        self,
        user_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        include_archived: bool = False,
    ) -> Tuple[List[dict], int]:
        """列出会话"""
        return await ChatConversationRepository.list_by_user(
            user_id, skip, limit, include_archived
        )

    async def update_conversation(
        self, conversation_id: str, data: schemas.ChatConversationUpdate
    ) -> Optional[dict]:
        """更新会话"""
        update_data = data.dict(exclude_unset=True)
        return await ChatConversationRepository.update(conversation_id, **update_data)

    async def delete_conversation(self, conversation_id: str) -> bool:
        """删除会话"""
        return await ChatConversationRepository.delete(conversation_id)

    async def get_conversation_messages(self, conversation_id: str) -> List[dict]:
        """获取会话的所有消息"""
        return await ChatMessageRepository.get_conversation_messages(conversation_id)

    async def create_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        llm_provider: Optional[str] = None,
        llm_model: Optional[str] = None,
        token_usage: Optional[dict] = None,
    ) -> dict:
        """创建消息"""
        msg_data = {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "llm_provider": llm_provider,
            "llm_model": llm_model,
            "token_usage": token_usage,
        }
        return await ChatMessageRepository.create(msg_data)

    async def chat(
        self,
        data: schemas.ChatRequest,
        user_id: str,
    ) -> AsyncGenerator[schemas.StreamChunk, None]:
        """
        执行聊天（流式返回）

        LLM key 优先使用当前用户 DB 存储的 aggregator key,
        否则回退到 env var / provider-specific key。
        """
        # 1. 解析模型信息
        if data.model_id:
            provider, model = parse_model_info(data.model_id)
        else:
            provider = None
            model = None

        # 2. 创建 LLM 服务实例（带用户上下文，用于 aggregator key 查询）
        llm_service = SimpleLLMService(provider=provider, model=model, user_id=user_id)

        # 3. 获取或创建会话
        if data.conversation_id:
            conversation = await self.get_conversation(data.conversation_id)
            if not conversation:
                raise ValueError(f"Conversation {data.conversation_id} not found")
        else:
            conversation = await self.create_conversation(
                schemas.ChatConversationCreate(
                    title=data.message[:50] if len(data.message) > 50 else data.message,
                    mode=data.mode,
                    user_id=user_id,
                )
            )

        # 4. 保存用户消息
        await self.create_message(
            conversation_id=conversation["id"],
            role="user",
            content=data.message
        )

        # 5. 构建消息历史
        history_messages = await self.get_conversation_messages(conversation["id"])
        messages = [
            {"role": msg["role"], "content": msg["content"]}
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
                    conversation_id=conversation["id"],
                    chunk=chunk,
                    done=False
                )
        except Exception as e:
            # 返回错误信息给前端（之前只 yield 空 chunk + done, 导致"没有返回"的假象）
            error_msg = f"调用 {provider or 'llm'} 模型失败: {str(e)}"
            yield schemas.StreamChunk(
                conversation_id=conversation["id"],
                chunk=error_msg,
                done=False,
            )
            yield schemas.StreamChunk(
                conversation_id=conversation["id"],
                chunk="",
                done=True,
            )
            await self.create_message(
                conversation_id=conversation["id"],
                role="assistant",
                content=error_msg,
                llm_provider=provider,
                llm_model=model
            )
            return

        # 7. 保存助手回复
        await self.create_message(
            conversation_id=conversation["id"],
            role="assistant",
            content=assistant_response,
            llm_provider=provider,
            llm_model=model
        )

        # 8. 发送完成信号
        yield schemas.StreamChunk(
            conversation_id=conversation["id"],
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
