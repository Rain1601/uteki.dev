"""
雪盈证券API客户端 - 基于snbpy SDK的异步封装
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


class SnbClient:
    """雪盈证券API异步客户端"""

    def __init__(self, account: str, key: str, env: str = "prod"):
        self.account = account
        self.env = env

        from snbpy.common.domain.snb_config import SnbConfig
        from snbpy.snb_api_client import SnbHttpClient

        config = SnbConfig()
        config.account = account
        config.key = key
        config.sign_type = "SHA256"
        config.timeout = 15

        if env == "prod":
            config.snb_server = "openapi.snbsecurities.com"
            config.snb_port = "443"
            config.schema = "https"
        else:
            config.snb_server = "sandbox.snbsecurities.com"
            config.snb_port = "443"
            config.schema = "https"

        self.client = SnbHttpClient(config)
        self._logged_in = False
        logger.info(f"SNB客户端初始化 - 账号: {account}, 环境: {env}")

    def _sync_login(self):
        result = self.client.login()
        self._logged_in = True
        logger.info(f"SNB登录成功 - 账号: {self.account}")
        return result

    async def _ensure_login(self):
        if not self._logged_in:
            await asyncio.to_thread(self._sync_login)

    async def get_balance(self) -> Dict[str, Any]:
        try:
            await self._ensure_login()
            response = await asyncio.to_thread(self.client.get_balance)

            data = response.data if hasattr(response, "data") else response
            if isinstance(data, dict):
                if "net_liquidation_value" in data and "total_value" not in data:
                    data["total_value"] = data["net_liquidation_value"]
                if "securities_gross_position_value" in data and "market_value" not in data:
                    data["market_value"] = data["securities_gross_position_value"]

            return {"success": True, "data": data}
        except Exception as e:
            logger.error(f"查询资产失败: {e}")
            return {"success": False, "error": str(e)}

    async def get_positions(self) -> Dict[str, Any]:
        try:
            await self._ensure_login()
            response = await asyncio.to_thread(self.client.get_position_list)

            positions = response.data if hasattr(response, "data") else response
            if not isinstance(positions, list):
                positions = [positions] if positions else []

            transformed = []
            for pos in positions:
                quantity = pos.get("position", 0)
                avg_price = pos.get("average_price", 0)
                market_price = pos.get("market_price", 0)
                cost = quantity * avg_price
                market_value = quantity * market_price
                unrealized_pnl = market_value - cost

                transformed.append({
                    **pos,
                    "quantity": quantity,
                    "cost": cost,
                    "market_value": market_value,
                    "unrealized_pnl": unrealized_pnl,
                })

            return {"success": True, "data": transformed}
        except Exception as e:
            logger.error(f"查询持仓失败: {e}")
            return {"success": False, "error": str(e)}

    async def get_orders(
        self, status: Optional[str] = None, limit: int = 100
    ) -> Dict[str, Any]:
        try:
            await self._ensure_login()
            response = await asyncio.to_thread(self.client.get_order_list)

            orders = response.data if hasattr(response, "data") else response
            if not isinstance(orders, list):
                orders = [orders] if orders else []

            if status:
                orders = [o for o in orders if o.get("status") == status]
            if len(orders) > limit:
                orders = orders[:limit]

            return {"success": True, "data": orders}
        except Exception as e:
            logger.error(f"查询订单失败: {e}")
            return {"success": False, "error": str(e)}

    async def place_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        order_type: str = "MKT",
        price: Optional[float] = None,
        time_in_force: str = "DAY",
    ) -> Dict[str, Any]:
        try:
            await self._ensure_login()

            from snbpy.common.constant.snb_constant import (
                SecurityType, OrderSide, Currency, OrderType, TimeInForce,
            )
            import uuid

            # Map simplified order_type to SDK enum
            ot_map = {"MKT": OrderType.MARKET, "LMT": OrderType.LIMIT}
            sdk_order_type = ot_map.get(order_type.upper(), OrderType.MARKET)

            sdk_side = OrderSide.BUY if side.upper() == "BUY" else OrderSide.SELL
            sdk_tif = TimeInForce.GTC if time_in_force.upper() == "GTC" else TimeInForce.DAY

            params = {
                "order_id": str(uuid.uuid4())[:8],
                "security_type": SecurityType.STK,
                "symbol": symbol,
                "exchange": "USEX",
                "side": sdk_side,
                "currency": Currency.USD,
                "quantity": int(quantity),
                "order_type": sdk_order_type,
                "tif": sdk_tif,
                "price": price or 0,
            }

            result = await asyncio.to_thread(self.client.place_order, **params)
            logger.info(f"下单成功: {side} {quantity} {symbol}")
            return {"success": True, "message": "下单成功", "data": result}
        except Exception as e:
            logger.error(f"下单失败: {e}")
            return {"success": False, "error": str(e)}

    async def cancel_order(self, order_id: str) -> Dict[str, Any]:
        try:
            await self._ensure_login()
            result = await asyncio.to_thread(self.client.cancel_order, order_id=order_id)
            logger.info(f"撤单成功: {order_id}")
            return {"success": True, "message": "撤单成功", "data": result}
        except Exception as e:
            logger.error(f"撤单失败: {e}")
            return {"success": False, "error": str(e)}

    async def get_transaction_list(
        self,
        symbol: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        try:
            await self._ensure_login()

            params = {}
            if symbol:
                params["symbol"] = symbol
            if start_date:
                params["start_date"] = start_date
            if end_date:
                params["end_date"] = end_date

            response = await asyncio.to_thread(self.client.get_transaction_list, **params)

            data = response.data if hasattr(response, "data") else response
            # SNB API returns paginated response: {page, size, count, items: [...]}
            if isinstance(data, dict) and "items" in data:
                transactions = data["items"]
            elif isinstance(data, list):
                transactions = data
            else:
                transactions = [data] if data else []
            if len(transactions) > limit:
                transactions = transactions[:limit]

            return {"success": True, "data": transactions}
        except Exception as e:
            logger.error(f"查询成交记录失败: {e}")
            return {"success": False, "error": str(e)}

    async def get_token_status(self) -> Dict[str, Any]:
        try:
            await self._ensure_login()
            response = await asyncio.to_thread(self.client.get_token_status)
            data = response.data if hasattr(response, "data") else response
            return {"success": True, "data": data}
        except Exception as e:
            logger.error(f"查询Token状态失败: {e}")
            return {"success": False, "error": str(e)}


# Singleton
_snb_client: Optional[SnbClient] = None


def get_snb_client() -> Optional[SnbClient]:
    """获取SNB客户端单例，从Settings读取配置"""
    global _snb_client

    if _snb_client is not None:
        return _snb_client

    from uteki.common.config import settings

    if not settings.snb_account or not settings.snb_api_key:
        return None

    _snb_client = SnbClient(
        account=settings.snb_account,
        key=settings.snb_api_key,
        env=settings.snb_env,
    )
    return _snb_client
