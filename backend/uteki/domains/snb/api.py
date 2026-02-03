"""
SNB (雪盈证券) API路由
仅本地部署可用 — 通过环境变量 SNB_ACCOUNT / SNB_API_KEY 配置
下单/撤单需要 Google Authenticator TOTP 验证码（每用户独立密钥）
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import logging

import pyotp

from uteki.common.config import settings
from uteki.common.database import db_manager
from uteki.domains.auth.deps import get_current_user, get_current_user_optional
from uteki.domains.snb.schemas import (
    PlaceOrderRequest, CancelOrderRequest, TransactionNoteRequest, SnbResponse,
)
from uteki.domains.snb.services.snb_client import get_snb_client
from uteki.domains.snb.services.snb_service import SnbService, get_snb_service
from uteki.domains.snb.services.totp_service import TotpService, get_totp_service

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_db_session():
    async with db_manager.get_postgres_session() as session:
        yield session


def _require_client():
    """获取SNB客户端，未配置时抛出503"""
    client = get_snb_client()
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="SNB未配置。此功能仅在本地部署时可用，请设置环境变量 SNB_ACCOUNT 和 SNB_API_KEY。"
        )
    return client


async def _verify_totp_for_user(
    user: Optional[dict],
    code: str,
    session: AsyncSession,
    totp_service: TotpService,
) -> None:
    """验证 TOTP — 已登录用户查 DB，未登录 fallback 到 env var"""
    if user and user.get("user_id"):
        valid = await totp_service.verify_totp(session, user["user_id"], code)
        if not valid:
            raise HTTPException(status_code=403, detail="TOTP验证码无效或已过期")
        return

    # Fallback: 本地开发无登录，使用全局 env var
    if not settings.snb_totp_secret:
        raise HTTPException(
            status_code=503,
            detail="TOTP未配置。请先登录并通过 /api/snb/totp/setup 生成密钥。"
        )
    totp = pyotp.TOTP(settings.snb_totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=403, detail="TOTP验证码无效或已过期")


# ============================================================================
# TOTP Setup
# ============================================================================


@router.get("/totp/status", summary="TOTP配置状态")
async def get_totp_status(
    user: Optional[dict] = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session),
    totp_service: TotpService = Depends(get_totp_service),
):
    if user and user.get("user_id"):
        configured = await totp_service.get_totp_status(session, user["user_id"])
        return {"configured": configured}
    # Fallback: 未登录检查 env var
    return {"configured": bool(settings.snb_totp_secret)}


@router.post("/totp/setup", summary="生成TOTP密钥和QR码")
async def setup_totp(
    user: Optional[dict] = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session),
    totp_service: TotpService = Depends(get_totp_service),
):
    """生成新的 TOTP 密钥并加密存入数据库，返回 QR 码供 Google Authenticator 扫描。"""
    if user and user.get("user_id"):
        result = await totp_service.setup_totp(session, user["user_id"])
        return result

    # Fallback: 未登录时生成密钥但无法存 DB，返回手动指引
    import base64
    from io import BytesIO
    import qrcode

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(
        name=settings.snb_account or "SNB",
        issuer_name="Uteki Trading",
    )

    img = qrcode.make(provisioning_uri)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()

    return {
        "secret": secret,
        "provisioning_uri": provisioning_uri,
        "qr_code_base64": f"data:image/png;base64,{qr_base64}",
        "instruction": f"将以下内容添加到 .env 文件并重启后端:\nSNB_TOTP_SECRET={secret}",
    }


# ============================================================================
# Connection Status
# ============================================================================


@router.get("/status", summary="SNB连接状态")
async def get_status(
    user: Optional[dict] = Depends(get_current_user_optional),
):
    client = _require_client()
    result = await client.get_token_status()
    return result


# ============================================================================
# Account Data (Real-time from SNB API) — 读取不需要TOTP
# ============================================================================


@router.get("/balance", summary="查询账户资产")
async def get_balance(
    user: Optional[dict] = Depends(get_current_user_optional),
):
    client = _require_client()
    result = await client.get_balance()
    return result


@router.get("/positions", summary="查询持仓")
async def get_positions(
    user: Optional[dict] = Depends(get_current_user_optional),
):
    client = _require_client()
    result = await client.get_positions()
    return result


@router.get("/orders", summary="查询订单")
async def get_orders(
    status: Optional[str] = Query(None, description="订单状态筛选"),
    limit: int = Query(100, ge=1, le=500, description="返回数量"),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    client = _require_client()
    result = await client.get_orders(status=status, limit=limit)
    return result


# ============================================================================
# Order Management — 写操作需要 TOTP
# ============================================================================


@router.post("/orders", summary="下单（需要TOTP验证码）")
async def place_order(
    request: PlaceOrderRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session),
    totp_service: TotpService = Depends(get_totp_service),
):
    if request.order_type.upper() == "LMT" and request.price is None:
        raise HTTPException(status_code=422, detail="限价单必须提供价格")

    await _verify_totp_for_user(user, request.totp_code, session, totp_service)

    client = _require_client()
    result = await client.place_order(
        symbol=request.symbol,
        side=request.side,
        quantity=request.quantity,
        order_type=request.order_type,
        price=request.price,
        time_in_force=request.time_in_force,
    )
    return result


@router.post("/orders/{order_id}/cancel", summary="撤销订单（需要TOTP验证码）")
async def cancel_order(
    order_id: str,
    request: CancelOrderRequest,
    user: Optional[dict] = Depends(get_current_user_optional),
    session: AsyncSession = Depends(get_db_session),
    totp_service: TotpService = Depends(get_totp_service),
):
    await _verify_totp_for_user(user, request.totp_code, session, totp_service)

    client = _require_client()
    result = await client.cancel_order(order_id)
    return result


# ============================================================================
# Transactions (Live fetch → DB sync → return with notes)
# ============================================================================


@router.get("/transactions", summary="查询交易记录")
async def get_transactions(
    symbol: Optional[str] = Query(None, description="股票代码筛选"),
    limit: int = Query(100, ge=1, le=500, description="返回数量"),
    session: AsyncSession = Depends(get_db_session),
    snb_service: SnbService = Depends(get_snb_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    client = _require_client()

    # 1. 从SNB API实时获取交易记录
    api_result = await client.get_transaction_list(symbol=symbol, limit=limit)

    if api_result.get("success") and api_result.get("data"):
        # 2. Upsert到数据库
        try:
            await snb_service.sync_transactions(
                session, client.account, api_result["data"]
            )
        except Exception as e:
            logger.error(f"交易记录同步失败: {e}")

    # 3. 从数据库查询（包含备注）
    try:
        transactions = await snb_service.get_transactions(
            session, client.account, symbol=symbol, limit=limit
        )
        return {"success": True, "data": transactions}
    except Exception as e:
        logger.error(f"查询交易记录失败: {e}")
        # 回退：直接返回API数据
        return api_result


# ============================================================================
# Transaction Notes
# ============================================================================


@router.put("/transactions/notes", summary="创建或更新交易备注")
async def upsert_transaction_note(
    request: TransactionNoteRequest,
    session: AsyncSession = Depends(get_db_session),
    snb_service: SnbService = Depends(get_snb_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    try:
        note = await snb_service.upsert_note(
            session=session,
            account_id=request.account_id,
            symbol=request.symbol,
            trade_time=request.trade_time,
            side=request.side,
            is_reasonable=request.is_reasonable,
            notes=request.notes,
        )
        return {"success": True, "data": note}
    except Exception as e:
        logger.error(f"保存备注失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Debug: Create Tables
# ============================================================================


@router.post("/debug/create-tables", summary="创建SNB域数据库表")
async def create_snb_tables(session: AsyncSession = Depends(get_db_session)):
    from sqlalchemy import text

    sqls = [
        "CREATE SCHEMA IF NOT EXISTS snb;",
        """
        CREATE TABLE IF NOT EXISTS snb.snb_transactions (
            id VARCHAR(36) PRIMARY KEY,
            account_id VARCHAR(50) NOT NULL,
            symbol VARCHAR(20) NOT NULL,
            trade_time BIGINT NOT NULL,
            side VARCHAR(10) NOT NULL,
            quantity FLOAT NOT NULL,
            price FLOAT NOT NULL,
            commission FLOAT,
            order_id VARCHAR(50),
            raw_data JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_snb_transaction UNIQUE (account_id, symbol, trade_time, side)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_snb_tx_account_symbol ON snb.snb_transactions (account_id, symbol);",
        "CREATE INDEX IF NOT EXISTS idx_snb_tx_trade_time ON snb.snb_transactions (trade_time);",
        """
        CREATE TABLE IF NOT EXISTS snb.snb_transaction_notes (
            id VARCHAR(36) PRIMARY KEY,
            account_id VARCHAR(50) NOT NULL,
            symbol VARCHAR(20) NOT NULL,
            trade_time BIGINT NOT NULL,
            side VARCHAR(10) NOT NULL,
            is_reasonable BOOLEAN,
            notes TEXT DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_snb_transaction_note UNIQUE (account_id, symbol, trade_time, side)
        );
        """,
        "CREATE INDEX IF NOT EXISTS idx_snb_notes_account_symbol ON snb.snb_transaction_notes (account_id, symbol);",
        """
        CREATE TABLE IF NOT EXISTS snb.snb_user_totp (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL UNIQUE,
            encrypted_totp_secret TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_snb_user_totp_user_id UNIQUE (user_id)
        );
        """,
    ]

    results = []
    for sql in sqls:
        try:
            await session.execute(text(sql))
            await session.commit()
            results.append({"sql": sql[:60] + "...", "status": "success"})
        except Exception as e:
            await session.rollback()
            results.append({"sql": sql[:60] + "...", "status": "error", "error": str(e)})

    return {"status": "completed", "message": "SNB tables creation completed", "results": results}
