"""
Agent domain Pydantic schemas - API请求/响应模型
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ============================================================================
# Chat Message Schemas
# ============================================================================

class ChatMessageBase(BaseModel):
    """聊天消息基础schema"""
    role: str = Field(..., description="消息角色 (user, assistant, system)")
    content: str = Field(..., description="消息内容")


class ChatMessageCreate(ChatMessageBase):
    """创建聊天消息"""
    conversation_id: str = Field(..., description="会话ID")


class ChatMessageResponse(ChatMessageBase):
    """聊天消息响应"""
    id: str
    conversation_id: str
    llm_provider: Optional[str] = Field(None, description="LLM提供商")
    llm_model: Optional[str] = Field(None, description="LLM模型")
    token_usage: Optional[dict] = Field(None, description="Token使用统计")
    research_data: Optional[dict] = Field(None, description="Deep Research数据")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Chat Conversation Schemas
# ============================================================================

class ChatConversationBase(BaseModel):
    """聊天会话基础schema"""
    title: str = Field(..., description="会话标题")
    mode: str = Field(default="chat", description="会话模式 (chat, analysis, trading)")


class ChatConversationCreate(ChatConversationBase):
    """创建聊天会话"""
    user_id: Optional[str] = Field(None, description="用户ID")


class ChatConversationUpdate(BaseModel):
    """更新聊天会话"""
    title: Optional[str] = Field(None, description="会话标题")
    is_archived: Optional[bool] = Field(None, description="是否归档")


class ChatConversationResponse(ChatConversationBase):
    """聊天会话响应"""
    id: str
    user_id: Optional[str]
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    message_count: Optional[int] = Field(None, description="消息数量")

    class Config:
        from_attributes = True


class ChatConversationDetailResponse(ChatConversationResponse):
    """聊天会话详细响应 (包含消息列表)"""
    messages: List[ChatMessageResponse] = Field(default_factory=list, description="消息列表")


# ============================================================================
# Chat Request/Response Schemas
# ============================================================================

class ChatRequest(BaseModel):
    """聊天请求"""
    model_config = {"protected_namespaces": ()}  # 允许使用 model_ 前缀

    conversation_id: Optional[str] = Field(None, description="会话ID (新会话时为空)")
    message: str = Field(..., description="用户消息")
    mode: str = Field(default="chat", description="聊天模式")
    stream: bool = Field(default=True, description="是否流式返回")
    model_id: Optional[str] = Field(None, description="模型ID (如 claude-sonnet-4-20250514, gpt-4-turbo)")


class ChatResponse(BaseModel):
    """聊天响应"""
    conversation_id: str = Field(..., description="会话ID")
    message_id: str = Field(..., description="消息ID")
    role: str = Field(..., description="角色")
    content: str = Field(..., description="回复内容")
    llm_provider: Optional[str] = Field(None, description="使用的LLM提供商")
    llm_model: Optional[str] = Field(None, description="使用的模型")
    token_usage: Optional[dict] = Field(None, description="Token使用统计")


class StreamChunk(BaseModel):
    """流式响应块"""
    conversation_id: str
    chunk: str = Field(..., description="内容片段")
    done: bool = Field(default=False, description="是否完成")
    token_usage: Optional[dict] = Field(None, description="Token使用统计 (仅在done=True时)")


# ============================================================================
# Paginated Response
# ============================================================================

class PaginatedResponse(BaseModel):
    """分页响应基类"""
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页记录数")
    total_pages: int = Field(..., description="总页数")


class PaginatedConversationsResponse(PaginatedResponse):
    """分页会话响应"""
    items: List[ChatConversationResponse]


class PaginatedMessagesResponse(PaginatedResponse):
    """分页消息响应"""
    items: List[ChatMessageResponse]


# ============================================================================
# Common Response
# ============================================================================

class MessageResponse(BaseModel):
    """通用消息响应"""
    message: str
