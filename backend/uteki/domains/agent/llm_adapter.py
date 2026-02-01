"""
统一的 LLM Adapter 架构

支持多个 LLM 提供商的统一接口，包括：
- Claude (Anthropic) - 支持 tool calling
- OpenAI - 支持 function calling
- DeepSeek - OpenAI 兼容
- Qwen (DashScope) - 阿里云通义千问

设计理念：
1. 统一的接口，屏蔽各 provider 的差异
2. 支持流式和非流式调用
3. 支持 tool/function calling
4. 自动处理错误和重试
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, AsyncGenerator
from dataclasses import dataclass
from enum import Enum


class LLMProvider(str, Enum):
    """LLM 提供商枚举"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    DEEPSEEK = "deepseek"
    QWEN = "qwen"
    DASHSCOPE = "dashscope"  # Qwen 的别名
    MINIMAX = "minimax"
    GOOGLE = "google"  # Gemini


@dataclass
class LLMMessage:
    """统一的消息格式"""
    role: str  # system, user, assistant, tool
    content: str
    name: Optional[str] = None  # 用于 function/tool calling
    tool_calls: Optional[List[Dict[str, Any]]] = None  # OpenAI format
    tool_call_id: Optional[str] = None  # 用于 tool response


@dataclass
class LLMConfig:
    """LLM 配置"""
    temperature: float = 0.7
    max_tokens: int = 2000
    top_p: Optional[float] = None
    stop_sequences: Optional[List[str]] = None


@dataclass
class LLMTool:
    """工具定义（统一格式）"""
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema


class BaseLLMAdapter(ABC):
    """
    LLM Adapter 基类

    所有 LLM provider 都需要实现这个接口
    """

    def __init__(
        self,
        api_key: str,
        model: str,
        config: Optional[LLMConfig] = None
    ):
        self.api_key = api_key
        self.model = model
        self.config = config or LLMConfig()

    @abstractmethod
    async def chat(
        self,
        messages: List[LLMMessage],
        stream: bool = True,
        tools: Optional[List[LLMTool]] = None
    ) -> AsyncGenerator[str, None]:
        """
        聊天接口（流式或非流式）

        Args:
            messages: 消息列表
            stream: 是否流式返回
            tools: 可用工具列表（支持 function/tool calling）

        Yields:
            str: 回复内容（流式）或完整回复（非流式）
        """
        pass

    @abstractmethod
    def convert_messages(self, messages: List[LLMMessage]) -> Any:
        """
        将统一格式的消息转换为 provider 特定格式

        Args:
            messages: 统一格式的消息列表

        Returns:
            Provider 特定格式的消息
        """
        pass

    @abstractmethod
    def convert_tools(self, tools: List[LLMTool]) -> Any:
        """
        将统一格式的工具定义转换为 provider 特定格式

        Args:
            tools: 统一格式的工具列表

        Returns:
            Provider 特定格式的工具定义
        """
        pass


class OpenAIAdapter(BaseLLMAdapter):
    """OpenAI LLM Adapter"""

    def __init__(self, api_key: str, model: str, config: Optional[LLMConfig] = None):
        super().__init__(api_key, model, config)
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=api_key)

    def convert_messages(self, messages: List[LLMMessage]) -> List[Dict[str, Any]]:
        """转换为 OpenAI 消息格式"""
        result = []
        for msg in messages:
            openai_msg = {"role": msg.role, "content": msg.content}
            if msg.name:
                openai_msg["name"] = msg.name
            if msg.tool_calls:
                openai_msg["tool_calls"] = msg.tool_calls
            if msg.tool_call_id:
                openai_msg["tool_call_id"] = msg.tool_call_id
            result.append(openai_msg)
        return result

    def convert_tools(self, tools: List[LLMTool]) -> List[Dict[str, Any]]:
        """转换为 OpenAI function calling 格式"""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                }
            }
            for tool in tools
        ]

    async def chat(
        self,
        messages: List[LLMMessage],
        stream: bool = True,
        tools: Optional[List[LLMTool]] = None
    ) -> AsyncGenerator[str, None]:
        """OpenAI 聊天接口"""
        openai_messages = self.convert_messages(messages)

        kwargs = {
            "model": self.model,
            "messages": openai_messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "stream": stream,
        }

        if tools:
            kwargs["tools"] = self.convert_tools(tools)

        response = await self.client.chat.completions.create(**kwargs)

        if stream:
            async for chunk in response:
                if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if hasattr(delta, 'content') and delta.content:
                        yield delta.content
        else:
            if hasattr(response, 'choices') and len(response.choices) > 0:
                yield response.choices[0].message.content


class AnthropicAdapter(BaseLLMAdapter):
    """Anthropic (Claude) LLM Adapter"""

    def __init__(self, api_key: str, model: str, config: Optional[LLMConfig] = None):
        super().__init__(api_key, model, config)
        from anthropic import AsyncAnthropic
        self.client = AsyncAnthropic(api_key=api_key)

    def convert_messages(self, messages: List[LLMMessage]) -> tuple:
        """
        转换为 Anthropic 消息格式

        Returns:
            (system_message, anthropic_messages) 元组
        """
        system_message = None
        anthropic_messages = []

        for msg in messages:
            if msg.role == "system":
                system_message = msg.content
            else:
                anthropic_messages.append({
                    "role": msg.role,
                    "content": msg.content
                })

        return system_message, anthropic_messages

    def convert_tools(self, tools: List[LLMTool]) -> List[Dict[str, Any]]:
        """转换为 Anthropic tool calling 格式"""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.parameters,
            }
            for tool in tools
        ]

    async def chat(
        self,
        messages: List[LLMMessage],
        stream: bool = True,
        tools: Optional[List[LLMTool]] = None
    ) -> AsyncGenerator[str, None]:
        """Claude 聊天接口"""
        system_message, anthropic_messages = self.convert_messages(messages)

        kwargs = {
            "model": self.model,
            "messages": anthropic_messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
        }

        if system_message:
            kwargs["system"] = system_message

        if tools:
            kwargs["tools"] = self.convert_tools(tools)

        if stream:
            async with self.client.messages.stream(**kwargs) as stream_response:
                async for text in stream_response.text_stream:
                    yield text
        else:
            response = await self.client.messages.create(**kwargs)
            yield response.content[0].text


class DeepSeekAdapter(OpenAIAdapter):
    """DeepSeek Adapter (基于 OpenAI 兼容接口)"""

    def __init__(self, api_key: str, model: str, config: Optional[LLMConfig] = None):
        super().__init__(api_key, model, config)
        from openai import AsyncOpenAI
        # DeepSeek 使用自定义 base_url
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.deepseek.com"
        )


class QwenAdapter(BaseLLMAdapter):
    """Qwen (DashScope) Adapter"""

    def __init__(self, api_key: str, model: str, config: Optional[LLMConfig] = None):
        super().__init__(api_key, model, config)
        import dashscope
        dashscope.api_key = api_key
        self.dashscope = dashscope

    def convert_messages(self, messages: List[LLMMessage]) -> List[Dict[str, Any]]:
        """转换为 DashScope 消息格式"""
        return [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]

    def convert_tools(self, tools: List[LLMTool]) -> List[Dict[str, Any]]:
        """DashScope 工具格式（类似 OpenAI）"""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                }
            }
            for tool in tools
        ]

    async def chat(
        self,
        messages: List[LLMMessage],
        stream: bool = True,
        tools: Optional[List[LLMTool]] = None
    ) -> AsyncGenerator[str, None]:
        """Qwen 聊天接口"""
        from dashscope import Generation

        qwen_messages = self.convert_messages(messages)

        kwargs = {
            "model": self.model,
            "messages": qwen_messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "result_format": "message",
            "stream": stream,
        }

        if tools:
            kwargs["tools"] = self.convert_tools(tools)

        response = Generation.call(**kwargs)

        if stream:
            for chunk in response:
                if chunk.status_code == 200:
                    content = chunk.output.choices[0].message.content
                    if content:
                        yield content
        else:
            if response.status_code == 200:
                yield response.output.choices[0].message.content


# ============================================================================
# MiniMax Adapter (OpenAI兼容)
# ============================================================================


class MiniMaxAdapter(OpenAIAdapter):
    """MiniMax Adapter - 使用OpenAI兼容接口"""

    def __init__(
        self,
        api_key: str,
        model: str = "abab6.5s-chat",
        config: Optional[LLMConfig] = None,
        group_id: Optional[str] = None
    ):
        """初始化 MiniMax Adapter"""
        super().__init__(api_key, model, config)
        self.group_id = group_id
        # MiniMax API base URL
        self.client.base_url = "https://api.minimax.chat/v1"


# ============================================================================
# Google Gemini Adapter
# ============================================================================


class GeminiAdapter(BaseLLMAdapter):
    """Google Gemini Adapter"""

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.0-flash-exp",
        config: Optional[LLMConfig] = None
    ):
        """初始化 Gemini Adapter"""
        super().__init__(api_key, model, config)
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            self.client = genai.GenerativeModel(model)
        except ImportError:
            raise ImportError("请安装 google-generativeai: pip install google-generativeai")

    async def chat(
        self,
        messages: List[Dict[str, str]],
        stream: bool = True,
        tools: Optional[List[LLMTool]] = None
    ) -> str:
        """同步调用（Gemini SDK主要是同步的）"""
        # Convert messages to Gemini format
        prompt = "\n".join([f"{m['role']}: {m['content']}" for m in messages])

        response = self.client.generate_content(
            prompt,
            generation_config={
                "temperature": self.config.temperature,
                "max_output_tokens": self.config.max_tokens,
            }
        )

        return response.text

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[LLMTool]] = None
    ) -> AsyncGenerator[str, None]:
        """流式调用"""
        # Gemini 流式需要特殊处理
        prompt = "\n".join([f"{m['role']}: {m['content']}" for m in messages])

        response = self.client.generate_content(
            prompt,
            generation_config={
                "temperature": self.config.temperature,
                "max_output_tokens": self.config.max_tokens,
            },
            stream=True
        )

        for chunk in response:
            if chunk.text:
                yield chunk.text


# ============================================================================
# Adapter Factory
# ============================================================================


class LLMAdapterFactory:
    """LLM Adapter 工厂类"""

    @staticmethod
    def create_adapter(
        provider: LLMProvider,
        api_key: str,
        model: str,
        config: Optional[LLMConfig] = None
    ) -> BaseLLMAdapter:
        """
        创建 LLM Adapter

        Args:
            provider: LLM 提供商
            api_key: API 密钥
            model: 模型名称
            config: 配置

        Returns:
            相应的 Adapter 实例
        """
        if provider in [LLMProvider.OPENAI]:
            return OpenAIAdapter(api_key, model, config)
        elif provider == LLMProvider.ANTHROPIC:
            return AnthropicAdapter(api_key, model, config)
        elif provider == LLMProvider.DEEPSEEK:
            return DeepSeekAdapter(api_key, model, config)
        elif provider in [LLMProvider.QWEN, LLMProvider.DASHSCOPE]:
            return QwenAdapter(api_key, model, config)
        elif provider == LLMProvider.MINIMAX:
            return MiniMaxAdapter(api_key, model, config)
        elif provider == LLMProvider.GOOGLE:
            return GeminiAdapter(api_key, model, config)
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")
