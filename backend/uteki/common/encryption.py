"""Fernet 对称加密工具 — 用于加密存储敏感数据（TOTP 密钥、API 密钥等）"""

import logging
from typing import Optional

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_fernet_instance: Optional[Fernet] = None


def get_fernet() -> Fernet:
    global _fernet_instance
    if _fernet_instance is not None:
        return _fernet_instance

    from uteki.common.config import settings

    key = settings.encryption_key
    if not key:
        logger.warning(
            "ENCRYPTION_KEY 未设置，生成临时密钥。加密数据将在重启后失效！"
        )
        key = Fernet.generate_key().decode()

    if isinstance(key, str):
        key = key.encode()

    _fernet_instance = Fernet(key)
    return _fernet_instance


def encrypt_string(plain_text: str) -> str:
    return get_fernet().encrypt(plain_text.encode()).decode()


def decrypt_string(cipher_text: str) -> str:
    return get_fernet().decrypt(cipher_text.encode()).decode()
