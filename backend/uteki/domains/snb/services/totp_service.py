"""每用户 TOTP 管理服务"""

import logging
from typing import Optional

import pyotp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.common.config import settings
from uteki.common.encryption import encrypt_string, decrypt_string
from uteki.domains.snb.models.snb_user_totp import SnbUserTotp

logger = logging.getLogger(__name__)


class TotpService:

    async def get_totp_status(self, session: AsyncSession, user_id: str) -> bool:
        query = select(SnbUserTotp).where(SnbUserTotp.user_id == user_id)
        result = await session.execute(query)
        return result.scalar_one_or_none() is not None

    async def setup_totp(
        self, session: AsyncSession, user_id: str
    ) -> dict:
        import base64
        from io import BytesIO
        import qrcode

        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=settings.snb_account or "SNB",
            issuer_name="Uteki Trading",
        )

        encrypted = encrypt_string(secret)

        # Upsert
        query = select(SnbUserTotp).where(SnbUserTotp.user_id == user_id)
        result = await session.execute(query)
        existing = result.scalar_one_or_none()
        if existing:
            existing.encrypted_totp_secret = encrypted
        else:
            session.add(SnbUserTotp(user_id=user_id, encrypted_totp_secret=encrypted))
        await session.commit()

        img = qrcode.make(provisioning_uri)
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()

        return {
            "secret": secret,
            "provisioning_uri": provisioning_uri,
            "qr_code_base64": f"data:image/png;base64,{qr_base64}",
        }

    async def verify_totp(
        self, session: AsyncSession, user_id: str, code: str
    ) -> bool:
        query = select(SnbUserTotp).where(SnbUserTotp.user_id == user_id)
        result = await session.execute(query)
        record = result.scalar_one_or_none()
        if record is None:
            return False

        secret = decrypt_string(record.encrypted_totp_secret)
        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=1)


_totp_service: Optional[TotpService] = None


def get_totp_service() -> TotpService:
    global _totp_service
    if _totp_service is None:
        _totp_service = TotpService()
    return _totp_service
