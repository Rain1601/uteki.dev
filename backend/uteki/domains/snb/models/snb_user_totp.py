"""每用户 TOTP 密钥 — Fernet 加密存储"""

from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from uteki.common.base import Base, TimestampMixin, UUIDMixin, get_table_args


class SnbUserTotp(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "snb_user_totp"
    __table_args__ = get_table_args(
        UniqueConstraint("user_id", name="uq_snb_user_totp_user_id"),
        schema="snb",
    )

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    encrypted_totp_secret: Mapped[str] = mapped_column(Text, nullable=False)
