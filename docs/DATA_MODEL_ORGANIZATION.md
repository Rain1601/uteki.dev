# 数据模型组织方式

uteki.open 使用 **DDD (Domain-Driven Design)** 的数据模型组织方式，采用清晰的分层架构。

---

## 📂 整体结构

```
backend/uteki/
├── common/                    # 共享基础组件
│   ├── base.py               # SQLAlchemy基类和Mixins
│   ├── database.py           # 数据库连接管理
│   └── config.py             # 配置管理
│
└── domains/                   # 领域层（DDD）
    ├── admin/                # Admin领域
    │   ├── models.py         # 数据库模型 (SQLAlchemy ORM)
    │   ├── schemas.py        # API数据传输对象 (Pydantic)
    │   ├── repository.py     # 数据访问层
    │   ├── service.py        # 业务逻辑层
    │   └── api.py            # API路由层
    │
    ├── trading/              # Trading领域
    ├── data/                 # Data领域
    ├── agent/                # Agent领域
    ├── evaluation/           # Evaluation领域
    └── dashboard/            # Dashboard领域
```

---

## 🎯 数据模型的三种类型

### 1. **Database Models** (`models.py`) - 数据库层

**用途**: SQLAlchemy ORM模型，映射到数据库表

**位置**: `backend/uteki/domains/{domain}/models.py`

**示例**: `backend/uteki/domains/admin/models.py`

```python
from uteki.common.base import Base, TimestampMixin, UUIDMixin
from sqlalchemy import String, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column

class APIKey(Base, UUIDMixin, TimestampMixin):
    """数据库表: admin.api_keys"""
    __tablename__ = "api_keys"
    __table_args__ = {"schema": "admin"}

    # 数据库字段
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    api_key: Mapped[str] = mapped_column(String(500), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
```

**特点**:
- 继承自 `Base` (SQLAlchemy DeclarativeBase)
- 使用 `Mixin` 复用通用字段（ID、时间戳）
- 定义数据库约束、索引、外键
- 直接映射到PostgreSQL表

---

### 2. **API Schemas** (`schemas.py`) - API层

**用途**: Pydantic模型，用于API请求/响应的数据验证和序列化

**位置**: `backend/uteki/domains/{domain}/schemas.py`

**示例**: `backend/uteki/domains/admin/schemas.py`

```python
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

# 基础Schema
class APIKeyBase(BaseModel):
    provider: str
    display_name: str
    environment: str = "production"

# 创建请求
class APIKeyCreate(APIKeyBase):
    api_key: str
    api_secret: Optional[str] = None

# 更新请求
class APIKeyUpdate(BaseModel):
    display_name: Optional[str] = None
    is_active: Optional[bool] = None

# API响应
class APIKeyResponse(APIKeyBase):
    id: str
    is_active: bool
    has_secret: bool  # 不返回真实密钥，只返回是否存在
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True  # 允许从ORM对象创建
```

**特点**:
- 基于 `Pydantic BaseModel`
- 用于API请求验证和响应序列化
- 不包含敏感信息（如加密后的API密钥）
- 支持继承和组合

---

### 3. **Domain Objects** (可选) - 业务逻辑层

**用途**: 纯Python对象，用于复杂业务逻辑（可选）

**位置**: `backend/uteki/domains/{domain}/entities.py` 或 `value_objects.py`

**示例**: （如果需要）

```python
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

@dataclass
class TradingSignal:
    """交易信号 - 领域值对象"""
    symbol: str
    action: str  # "buy", "sell", "hold"
    confidence: float
    reasoning: str
    price: Optional[Decimal] = None
    quantity: Optional[Decimal] = None

    def is_valid(self) -> bool:
        return 0 <= self.confidence <= 1.0
```

**特点**:
- 纯Python对象（不依赖数据库）
- 封装业务逻辑和规则
- 可以使用 `dataclass` 或普通类
- 当前项目中较少使用，因为逻辑较简单

---

## 🏗️ 数据模型的继承结构

### Base Classes (`common/base.py`)

```python
class Base(DeclarativeBase):
    """所有数据库模型的基类"""
    pass

class TimestampMixin:
    """时间戳Mixin - 自动添加created_at和updated_at"""
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

class UUIDMixin:
    """UUID主键Mixin - 自动添加UUID主键"""
    id: Mapped[str]  # UUID作为字符串存储
```

### 使用方式

```python
# 标准数据库模型模式
class MyModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "my_models"
    __table_args__ = {"schema": "my_domain"}

    # 自动拥有:
    # - id: str (UUID)
    # - created_at: datetime
    # - updated_at: datetime

    # 只需定义业务字段
    name: Mapped[str]
    value: Mapped[int]
```

---

## 📊 数据流转示例

### API请求 → 数据库存储

```
Client Request (JSON)
    ↓
1. APIKeyCreate (Pydantic)     # API层：验证输入
    ↓
2. Service Layer               # 业务层：加密、业务逻辑
    ↓
3. APIKey (SQLAlchemy Model)   # 数据层：存储到数据库
    ↓
PostgreSQL Database
```

### 数据库查询 → API响应

```
PostgreSQL Database
    ↓
1. APIKey (SQLAlchemy Model)   # 数据层：查询数据库
    ↓
2. Service Layer               # 业务层：解密、格式化
    ↓
3. APIKeyResponse (Pydantic)   # API层：序列化响应
    ↓
Client Response (JSON)
```

---

## 🎨 实际代码示例

### 完整的CRUD流程

#### 1. 定义数据库模型

```python
# backend/uteki/domains/admin/models.py

from uteki.common.base import Base, UUIDMixin, TimestampMixin
from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column

class LLMProvider(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "llm_providers"
    __table_args__ = {"schema": "admin"}

    provider: Mapped[str] = mapped_column(String(50))
    model: Mapped[str] = mapped_column(String(100))
    api_key_id: Mapped[str] = mapped_column(String(36))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
```

#### 2. 定义API Schemas

```python
# backend/uteki/domains/admin/schemas.py

from pydantic import BaseModel
from datetime import datetime

class LLMProviderCreate(BaseModel):
    provider: str
    model: str
    api_key_id: str
    is_default: bool = False

class LLMProviderResponse(BaseModel):
    id: str
    provider: str
    model: str
    api_key_id: str
    is_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
```

#### 3. Repository层（数据访问）

```python
# backend/uteki/domains/admin/repository.py

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

class LLMProviderRepository:
    @staticmethod
    async def create(session: AsyncSession, provider: LLMProvider) -> LLMProvider:
        session.add(provider)
        await session.flush()
        return provider

    @staticmethod
    async def get_by_id(session: AsyncSession, provider_id: str):
        stmt = select(LLMProvider).where(LLMProvider.id == provider_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
```

#### 4. Service层（业务逻辑）

```python
# backend/uteki/domains/admin/service.py

from sqlalchemy.ext.asyncio import AsyncSession
from uteki.domains.admin import schemas
from uteki.domains.admin.models import LLMProvider
from uteki.domains.admin.repository import LLMProviderRepository

class LLMProviderService:
    async def create_provider(
        self,
        session: AsyncSession,
        data: schemas.LLMProviderCreate
    ) -> LLMProvider:
        # 业务逻辑：创建数据库模型
        provider = LLMProvider(
            provider=data.provider,
            model=data.model,
            api_key_id=data.api_key_id,
            is_default=data.is_default
        )

        # 调用Repository保存
        return await LLMProviderRepository.create(session, provider)
```

#### 5. API层（路由）

```python
# backend/uteki/domains/admin/api.py

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from uteki.domains.admin import schemas
from uteki.domains.admin.service import llm_provider_service

router = APIRouter()

@router.post("/llm-providers", response_model=schemas.LLMProviderResponse)
async def create_llm_provider(
    data: schemas.LLMProviderCreate,
    session: AsyncSession = Depends(get_db_session)
):
    # 1. Pydantic自动验证输入
    # 2. 调用Service层处理
    provider = await llm_provider_service.create_provider(session, data)

    # 3. Pydantic自动序列化输出
    return provider
```

---

## 🔄 跨Domain的数据模型

### 问题: Domain之间如何共享数据？

#### ❌ 错误方式：直接引用

```python
# ❌ trading domain直接导入admin models
from uteki.domains.admin.models import APIKey  # 违反DDD原则
```

#### ✅ 正确方式1：通过Service层

```python
# ✅ trading domain通过admin service获取配置
from uteki.domains.admin.service import api_key_service

async def get_exchange_client():
    # 调用admin service获取配置
    api_key = await api_key_service.get_api_key_by_provider(
        session, "okx", "production"
    )
    return ExchangeClient(api_key.api_key)
```

#### ✅ 正确方式2：共享Schema（如果需要）

```python
# backend/uteki/common/schemas.py
from pydantic import BaseModel

class ExchangeCredentials(BaseModel):
    """跨domain共享的凭证Schema"""
    api_key: str
    api_secret: str
```

---

## 📐 设计原则

### 1. **单一职责**
- `models.py`: 只负责数据库映射
- `schemas.py`: 只负责API数据验证/序列化
- `repository.py`: 只负责数据访问
- `service.py`: 负责业务逻辑

### 2. **Domain隔离**
- 每个domain有独立的models和schemas
- 跨domain通信通过service层，不直接访问models

### 3. **不泄露敏感信息**
```python
# ❌ 错误：API响应返回加密的密钥
class APIKeyResponse(BaseModel):
    api_key: str  # 暴露加密数据

# ✅ 正确：只返回掩码
class APIKeyResponse(BaseModel):
    has_secret: bool  # 只表示是否存在
```

### 4. **使用Mixin复用**
```python
# ✅ 所有模型自动获得ID和时间戳
class MyModel(Base, UUIDMixin, TimestampMixin):
    # 无需重复定义id, created_at, updated_at
    pass
```

---

## 🗂️ 数据库Schema组织

### PostgreSQL Schemas

```sql
-- 每个domain对应一个PostgreSQL schema
CREATE SCHEMA admin;
CREATE SCHEMA trading;
CREATE SCHEMA data;
CREATE SCHEMA agent;
CREATE SCHEMA evaluation;
CREATE SCHEMA dashboard;
```

### 表命名规范

```python
# 示例：admin domain的表都在admin schema下
__tablename__ = "api_keys"
__table_args__ = {"schema": "admin"}

# 实际表名：admin.api_keys
# 完整访问：SELECT * FROM admin.api_keys
```

---

## 🎯 总结

| 类型 | 文件 | 作用 | 依赖 |
|------|------|------|------|
| **Database Models** | `models.py` | 数据库ORM映射 | SQLAlchemy, common/base |
| **API Schemas** | `schemas.py` | API数据验证/序列化 | Pydantic |
| **Repository** | `repository.py` | 数据访问 | models.py, SQLAlchemy |
| **Service** | `service.py` | 业务逻辑 | repository.py, schemas.py |
| **API Routes** | `api.py` | HTTP路由 | service.py, schemas.py |

### 数据流向

```
HTTP Request
    ↓ (Pydantic validates)
schemas.py (Create)
    ↓
service.py (Business Logic)
    ↓
repository.py (Data Access)
    ↓
models.py (ORM)
    ↓
PostgreSQL Database
    ↓
models.py (ORM)
    ↓
repository.py (Query)
    ↓
service.py (Format)
    ↓
schemas.py (Response)
    ↓ (Pydantic serializes)
HTTP Response
```

---

## 🔗 相关文档

- [ARCHITECTURE.md](ARCHITECTURE.md) - 总体架构设计
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 开发规范
- [DATABASE_STRATEGY.md](../docs-site/architecture/database-strategy.md) - 数据库策略
