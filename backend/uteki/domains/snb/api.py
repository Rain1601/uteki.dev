"""
SNB (雪盈证券) API路由
仅本地部署可用 — 通过环境变量 SNB_ACCOUNT / SNB_API_KEY 配置
下单/撤单需要 Google Authenticator TOTP 验证码（每用户独立密钥）
"""

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import logging

from uteki.common.database import db_manager
from uteki.domains.auth.deps import get_current_user
from uteki.domains.snb.schemas import (
    PlaceOrderRequest, CancelOrderRequest, TransactionNoteRequest, SnbResponse,
)
from uteki.common.cache import get_cache_service
from uteki.domains.snb.services.snb_client import get_snb_client_async, reset_snb_client
from uteki.domains.snb.services.snb_service import SnbService, get_snb_service
from uteki.domains.snb.services.totp_service import TotpService, get_totp_service

logger = logging.getLogger(__name__)

router = APIRouter()

_TTL = 86400


def _today() -> str:
    return date.today().isoformat()


async def get_db_session():
    async with db_manager.get_postgres_session() as session:
        yield session


async def _require_client():
    """获取SNB客户端，未配置时抛出503"""
    client = await get_snb_client_async()
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="SNB未配置。请在 Admin > Exchanges 中配置雪盈证券 API Key 和 Account。"
        )
    return client


async def _verify_totp_for_user(
    user: dict,
    code: str,
    session: AsyncSession,
    totp_service: TotpService,
) -> None:
    """验证 TOTP — 通过数据库中用户密钥验证"""
    valid = await totp_service.verify_totp(session, user["user_id"], code)
    if not valid:
        raise HTTPException(status_code=403, detail="TOTP验证码无效或已过期")


# ============================================================================
# TOTP Setup
# ============================================================================


@router.get("/totp/status", summary="TOTP配置状态")
async def get_totp_status(
    user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    totp_service: TotpService = Depends(get_totp_service),
):
    configured = await totp_service.get_totp_status(session, user["user_id"])
    return {"configured": configured}


@router.post("/totp/setup", summary="生成TOTP密钥和QR码")
async def setup_totp(
    user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    totp_service: TotpService = Depends(get_totp_service),
):
    """生成新的 TOTP 密钥并加密存入数据库，返回 QR 码供 Google Authenticator 扫描。"""
    result = await totp_service.setup_totp(session, user["user_id"])
    return result


# ============================================================================
# Connection Status
# ============================================================================


@router.get("/status", summary="SNB连接状态")
async def get_status(
    user: dict = Depends(get_current_user),
):
    client = await _require_client()
    result = await client.get_token_status()
    return result


@router.post("/reconnect", summary="重新连接SNB（清除缓存并重新加载凭证）")
async def reconnect(
    user: dict = Depends(get_current_user),
):
    reset_snb_client()
    client = await _require_client()
    result = await client.get_token_status()
    return result


# ============================================================================
# Account Data (Real-time from SNB API) — 读取不需要TOTP
# ============================================================================


@router.get("/balance", summary="查询账户资产")
async def get_balance(
    user: dict = Depends(get_current_user),
):
    cache = get_cache_service()
    async def _fetch():
        client = await _require_client()
        return await client.get_balance()
    return await cache.get_or_set(
        f"uteki:snb:balance:{_today()}", _fetch, ttl=60,
    )


@router.get("/positions", summary="查询持仓")
async def get_positions(
    user: dict = Depends(get_current_user),
):
    cache = get_cache_service()
    async def _fetch():
        client = await _require_client()
        return await client.get_positions()
    return await cache.get_or_set(
        f"uteki:snb:positions:{_today()}", _fetch, ttl=60,
    )


@router.get("/orders", summary="查询订单")
async def get_orders(
    status: Optional[str] = Query(None, description="订单状态筛选"),
    limit: int = Query(100, ge=1, le=500, description="返回数量"),
    user: dict = Depends(get_current_user),
):
    cache = get_cache_service()
    cache_key = f"uteki:snb:orders:{_today()}:{status}:{limit}"
    async def _fetch():
        client = await _require_client()
        return await client.get_orders(status=status, limit=limit)
    return await cache.get_or_set(cache_key, _fetch, ttl=30)


# ============================================================================
# Order Management — 写操作需要 TOTP
# ============================================================================


@router.post("/orders", summary="下单（需要TOTP验证码）")
async def place_order(
    request: PlaceOrderRequest,
    user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    totp_service: TotpService = Depends(get_totp_service),
):
    if request.order_type.upper() == "LMT" and request.price is None:
        raise HTTPException(status_code=422, detail="限价单必须提供价格")

    await _verify_totp_for_user(user, request.totp_code, session, totp_service)

    client = await _require_client()
    result = await client.place_order(
        symbol=request.symbol,
        side=request.side,
        quantity=request.quantity,
        order_type=request.order_type,
        price=request.price,
        time_in_force=request.time_in_force,
    )
    logger.info(f"[AUDIT] Order placed by {user['user_id']}: {request.side} {request.quantity} {request.symbol}")
    await get_cache_service().delete_pattern("uteki:snb:")
    return result


@router.post("/orders/{order_id}/cancel", summary="撤销订单（需要TOTP验证码）")
async def cancel_order(
    order_id: str,
    request: CancelOrderRequest,
    user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    totp_service: TotpService = Depends(get_totp_service),
):
    await _verify_totp_for_user(user, request.totp_code, session, totp_service)

    client = await _require_client()
    result = await client.cancel_order(order_id)
    logger.info(f"[AUDIT] Order cancelled by {user['user_id']}: {order_id}")
    await get_cache_service().delete_pattern("uteki:snb:")
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
    user: dict = Depends(get_current_user),
):
    client = await _require_client()

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
    user: dict = Depends(get_current_user),
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
