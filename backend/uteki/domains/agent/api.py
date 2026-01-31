"""
Agent domain API routes - FastAPI路由
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import json

from uteki.common.database import db_manager
from uteki.domains.agent import schemas
from uteki.domains.agent.service import ChatService, get_chat_service

router = APIRouter()


# ============================================================================
# Dependency: 获取数据库会话
# ============================================================================


async def get_db_session():
    """获取数据库会话依赖"""
    async with db_manager.get_postgres_session() as session:
        yield session


# ============================================================================
# Conversation Routes
# ============================================================================


@router.post(
    "/conversations",
    response_model=schemas.ChatConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建聊天会话",
)
async def create_conversation(
    data: schemas.ChatConversationCreate,
    session: AsyncSession = Depends(get_db_session),
    chat_svc: ChatService = Depends(get_chat_service),
):
    """
    创建新的聊天会话

    - **title**: 会话标题
    - **mode**: 会话模式 (chat, analysis, trading)
    - **user_id**: 用户ID (可选)
    """
    conversation = await chat_svc.create_conversation(session, data)

    return schemas.ChatConversationResponse(
        id=conversation.id,
        title=conversation.title,
        mode=conversation.mode,
        user_id=conversation.user_id,
        is_archived=conversation.is_archived,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.get(
    "/conversations",
    response_model=schemas.PaginatedConversationsResponse,
    summary="列出聊天会话",
)
async def list_conversations(
    user_id: str = Query(None, description="用户ID过滤"),
    include_archived: bool = Query(False, description="是否包含归档会话"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_db_session),
    chat_svc: ChatService = Depends(get_chat_service),
):
    """列出所有聊天会话"""
    items, total = await chat_svc.list_conversations(
        session, user_id=user_id, skip=skip, limit=limit, include_archived=include_archived
    )

    # 转换为响应schema
    response_items = [
        schemas.ChatConversationResponse(
            id=item.id,
            title=item.title,
            mode=item.mode,
            user_id=item.user_id,
            is_archived=item.is_archived,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]

    return schemas.PaginatedConversationsResponse(
        items=response_items,
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        total_pages=(total + limit - 1) // limit,
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=schemas.ChatConversationDetailResponse,
    summary="获取聊天会话详情",
)
async def get_conversation(
    conversation_id: str, session: AsyncSession = Depends(get_db_session),
    chat_svc: ChatService = Depends(get_chat_service),
):
    """获取指定聊天会话的详细信息（包含消息历史）"""
    conversation = await chat_svc.get_conversation(session, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 获取消息历史
    messages = await chat_svc.get_conversation_messages(session, conversation_id)

    return schemas.ChatConversationDetailResponse(
        id=conversation.id,
        title=conversation.title,
        mode=conversation.mode,
        user_id=conversation.user_id,
        is_archived=conversation.is_archived,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[
            schemas.ChatMessageResponse(
                id=msg.id,
                conversation_id=msg.conversation_id,
                role=msg.role,
                content=msg.content,
                llm_provider=msg.llm_provider,
                llm_model=msg.llm_model,
                token_usage=msg.token_usage,
                created_at=msg.created_at,
                updated_at=msg.updated_at,
            )
            for msg in messages
        ],
    )


@router.patch(
    "/conversations/{conversation_id}",
    response_model=schemas.ChatConversationResponse,
    summary="更新聊天会话",
)
async def update_conversation(
    conversation_id: str,
    data: schemas.ChatConversationUpdate,
    session: AsyncSession = Depends(get_db_session),
    chat_svc: ChatService = Depends(get_chat_service),
):
    """更新聊天会话（标题、归档状态等）"""
    conversation = await chat_svc.update_conversation(session, conversation_id, data)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return schemas.ChatConversationResponse(
        id=conversation.id,
        title=conversation.title,
        mode=conversation.mode,
        user_id=conversation.user_id,
        is_archived=conversation.is_archived,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.delete(
    "/conversations/{conversation_id}",
    response_model=schemas.MessageResponse,
    summary="删除聊天会话",
)
async def delete_conversation(
    conversation_id: str, session: AsyncSession = Depends(get_db_session),
    chat_svc: ChatService = Depends(get_chat_service),
):
    """删除聊天会话（会级联删除所有消息）"""
    success = await chat_svc.delete_conversation(session, conversation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return schemas.MessageResponse(message="Conversation deleted successfully")


# ============================================================================
# Chat Routes
# ============================================================================


@router.post(
    "/chat",
    summary="聊天接口（流式返回）",
)
async def chat(
    data: schemas.ChatRequest,
    session: AsyncSession = Depends(get_db_session),
    chat_svc: ChatService = Depends(get_chat_service),
):
    """
    与Agent进行聊天（支持流式返回）

    - **conversation_id**: 会话ID（新会话时为null）
    - **message**: 用户消息
    - **mode**: 聊天模式 (chat, analysis, trading)
    - **stream**: 是否流式返回（默认true）
    - **llm_provider_id**: 指定LLM提供商ID（可选，不指定则使用默认）

    返回格式：Server-Sent Events (text/event-stream)
    每个事件格式：
    ```
    data: {"conversation_id": "xxx", "chunk": "...", "done": false}
    ```
    """

    async def event_generator():
        """SSE事件生成器"""
        try:
            async for chunk in chat_svc.chat(session, data):
                # 转换为JSON并发送
                yield f"data: {chunk.model_dump_json()}\n\n"
        except Exception as e:
            # 发送错误信息
            error_data = {
                "error": str(e),
                "conversation_id": data.conversation_id or "",
                "done": True
            }
            yield f"data: {json.dumps(error_data)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用nginx缓冲
        },
    )


@router.post(
    "/chat/sync",
    response_model=schemas.ChatResponse,
    summary="聊天接口（非流式）",
)
async def chat_sync(
    data: schemas.ChatRequest,
    session: AsyncSession = Depends(get_db_session),
    chat_svc: ChatService = Depends(get_chat_service),
):
    """
    与Agent进行聊天（非流式返回，等待完整响应）

    适用于不需要流式输出的场景
    """
    # 修改为非流式
    data.stream = False

    # 收集完整响应
    conversation_id = None
    full_content = ""

    async for chunk in chat_svc.chat(session, data):
        conversation_id = chunk.conversation_id
        if not chunk.done:
            full_content += chunk.chunk

    if not conversation_id:
        raise HTTPException(
            status_code=500, detail="Failed to generate response"
        )

    # 返回完整响应
    return schemas.ChatResponse(
        conversation_id=conversation_id,
        message_id="",  # 可以从数据库获取最新消息ID
        role="assistant",
        content=full_content,
    )
