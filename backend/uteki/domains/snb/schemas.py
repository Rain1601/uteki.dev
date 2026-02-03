"""SNB域 Pydantic schemas"""

from pydantic import BaseModel, Field
from typing import Optional, Any, List
from datetime import datetime


class PlaceOrderRequest(BaseModel):
    """下单请求"""
    symbol: str = Field(..., description="股票代码")
    side: str = Field(..., description="买卖方向 BUY/SELL")
    quantity: float = Field(..., gt=0, description="数量")
    order_type: str = Field(default="MKT", description="订单类型 MKT/LMT")
    price: Optional[float] = Field(None, gt=0, description="限价单价格")
    time_in_force: str = Field(default="DAY", description="有效期 DAY/GTC")
    totp_code: str = Field(..., min_length=6, max_length=6, description="TOTP验证码 (Google Authenticator)")


class CancelOrderRequest(BaseModel):
    """撤单请求"""
    totp_code: str = Field(..., min_length=6, max_length=6, description="TOTP验证码 (Google Authenticator)")


class TransactionNoteRequest(BaseModel):
    """交易备注请求"""
    account_id: str = Field(..., description="账户ID")
    symbol: str = Field(..., description="股票代码")
    trade_time: int = Field(..., description="交易时间戳（毫秒）")
    side: str = Field(..., description="交易方向 BUY/SELL")
    is_reasonable: Optional[bool] = Field(None, description="是否合理")
    notes: str = Field(default="", description="备注内容")


class SnbResponse(BaseModel):
    """通用SNB响应"""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    message: Optional[str] = None
