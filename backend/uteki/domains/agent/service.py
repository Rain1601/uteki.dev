"""
Agent domain service - 业务逻辑层
"""

from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Tuple, AsyncGenerator
import json

from uteki.domains.agent.models import ChatConversation, ChatMessage
from uteki.domains.agent.repository import ChatConversationRepository, ChatMessageRepository
from uteki.domains.agent import schemas
from uteki.domains.admin.models import LLMProvider, APIKey
from uteki.domains.admin.repository import LLMProviderRepository, APIKeyRepository
from uteki.domains.admin.service import EncryptionService


class LLMClientService:
    """LLM客户端服务 - 统一不同LLM提供商的调用接口"""

    def __init__(self, encryption_service: EncryptionService):
        self.encryption = encryption_service

    async def get_llm_client(
        self,
        session: AsyncSession,
        llm_provider: LLMProvider
    ):
        """获取LLM客户端"""
        # 获取API密钥
        api_key = await APIKeyRepository.get_by_id(session, llm_provider.api_key_id)
        if not api_key:
            raise ValueError(f"API key not found for provider {llm_provider.provider}")

        # 解密API密钥
        decrypted_key = self.encryption.decrypt(api_key.api_key)

        # 根据provider类型返回相应客户端配置
        provider_name = llm_provider.provider.lower()

        if provider_name == "openai":
            try:
                from openai import AsyncOpenAI
                return AsyncOpenAI(api_key=decrypted_key)
            except ImportError:
                raise ImportError("OpenAI package not installed. Run: pip install openai")

        elif provider_name == "anthropic":
            try:
                from anthropic import AsyncAnthropic
                return AsyncAnthropic(api_key=decrypted_key)
            except ImportError:
                raise ImportError("Anthropic package not installed. Run: pip install anthropic")

        elif provider_name in ["dashscope", "qwen"]:
            # 阿里云DashScope/通义千问
            try:
                import dashscope
                dashscope.api_key = decrypted_key
                return dashscope
            except ImportError:
                raise ImportError("DashScope package not installed. Run: pip install dashscope")

        elif provider_name == "deepseek":
            # DeepSeek使用OpenAI兼容接口
            try:
                from openai import AsyncOpenAI
                return AsyncOpenAI(
                    api_key=decrypted_key,
                    base_url="https://api.deepseek.com"
                )
            except ImportError:
                raise ImportError("OpenAI package not installed. Run: pip install openai")

        else:
            raise ValueError(f"Unsupported LLM provider: {provider_name}")

    async def chat_completion(
        self,
        session: AsyncSession,
        llm_provider: LLMProvider,
        messages: List[dict],
        stream: bool = True
    ) -> AsyncGenerator[str, None]:
        """调用LLM完成对话"""
        client = await self.get_llm_client(session, llm_provider)
        provider_name = llm_provider.provider.lower()
        model = llm_provider.model
        config = llm_provider.config or {}

        # 准备配置参数
        temperature = config.get("temperature", 0.7)
        max_tokens = config.get("max_tokens", 2000)

        if provider_name in ["openai", "deepseek"]:
            # OpenAI或兼容OpenAI的接口
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream
            )

            if stream:
                async for chunk in response:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            else:
                yield response.choices[0].message.content

        elif provider_name == "anthropic":
            # Anthropic Claude
            # 转换消息格式（Anthropic不接受system role在messages中）
            system_message = None
            anthropic_messages = []
            for msg in messages:
                if msg["role"] == "system":
                    system_message = msg["content"]
                else:
                    anthropic_messages.append(msg)

            kwargs = {
                "model": model,
                "messages": anthropic_messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if system_message:
                kwargs["system"] = system_message

            if stream:
                async with client.messages.stream(**kwargs) as stream_response:
                    async for text in stream_response.text_stream:
                        yield text
            else:
                response = await client.messages.create(**kwargs)
                yield response.content[0].text

        elif provider_name in ["dashscope", "qwen"]:
            # 阿里云DashScope
            import dashscope
            from dashscope import Generation

            response = Generation.call(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                result_format="message",
                stream=stream
            )

            if stream:
                for chunk in response:
                    if chunk.status_code == 200:
                        content = chunk.output.choices[0].message.content
                        if content:
                            yield content
            else:
                if response.status_code == 200:
                    yield response.output.choices[0].message.content

        else:
            raise ValueError(f"Unsupported provider: {provider_name}")


class ChatService:
    """聊天服务"""

    def __init__(self, encryption_service: EncryptionService):
        self.llm_client_service = LLMClientService(encryption_service)

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
        """执行聊天（流式返回）"""
        # 1. 获取或创建会话
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

        # 2. 获取LLM提供商
        if data.llm_provider_id:
            llm_provider = await LLMProviderRepository.get_by_id(session, data.llm_provider_id)
        else:
            llm_provider = await LLMProviderRepository.get_default_provider(session)

        if not llm_provider:
            raise ValueError("No LLM provider configured")

        if not llm_provider.is_active:
            raise ValueError(f"LLM provider {llm_provider.display_name} is not active")

        # 3. 保存用户消息
        await self.create_message(
            session,
            conversation_id=conversation.id,
            role="user",
            content=data.message
        )

        # 4. 构建消息历史
        history_messages = await self.get_conversation_messages(session, conversation.id)
        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in history_messages
        ]

        # 5. 调用LLM生成回复（流式）
        assistant_response = ""
        async for chunk in self.llm_client_service.chat_completion(
            session, llm_provider, messages, stream=data.stream
        ):
            assistant_response += chunk
            yield schemas.StreamChunk(
                conversation_id=conversation.id,
                chunk=chunk,
                done=False
            )

        # 6. 保存助手回复
        await self.create_message(
            session,
            conversation_id=conversation.id,
            role="assistant",
            content=assistant_response,
            llm_provider=llm_provider.provider,
            llm_model=llm_provider.model
        )

        # 7. 发送完成信号
        yield schemas.StreamChunk(
            conversation_id=conversation.id,
            chunk="",
            done=True
        )


# 依赖注入工厂函数（用于 FastAPI Depends）
# 避免模块级别导入，在请求时才创建服务实例

def get_chat_service() -> "ChatService":
    """获取聊天服务实例"""
    from uteki.domains.admin.service import get_encryption_service
    return ChatService(get_encryption_service())
