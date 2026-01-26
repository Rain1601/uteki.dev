# 贡献指南

感谢你考虑为uteki.open做出贡献！

---

## 行为准则

- 尊重所有贡献者
- 保持专业和建设性的讨论
- 欢迎新手和各种背景的贡献者

---

## 如何贡献

### 报告问题

在创建issue之前，请：

1. 搜索现有issue，避免重复
2. 使用issue模板
3. 提供清晰的复现步骤
4. 包含环境信息（OS、Python版本、Docker版本）

### 提交代码

1. **Fork仓库**

2. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   # 或
   git checkout -b fix/your-bug-fix
   ```

3. **遵循代码规范**（见下文）

4. **编写测试**
   ```bash
   cd backend
   poetry run pytest
   ```

5. **确保代码质量**
   ```bash
   # 代码检查
   poetry run ruff check .

   # 类型检查
   poetry run mypy .

   # 代码格式化
   poetry run ruff format .
   ```

6. **提交代码**
   ```bash
   git add .
   git commit -m "feat: add your feature"
   # 遵循Conventional Commits规范（见下文）
   ```

7. **创建Pull Request**
   - 清晰描述改动内容
   - 链接相关issue
   - 等待code review

---

## 代码规范

### Python后端

#### 1. 代码组织

**Domain结构**:
```python
backend/uteki/domains/{domain}/
├── __init__.py
├── models.py       # SQLAlchemy模型
├── schemas.py      # Pydantic schemas
├── repository.py   # 数据访问层
├── service.py      # 业务逻辑层
└── api.py          # FastAPI路由
```

**Agent扩展**: ❌ 不要创建新domain，✅ 在`agent/agents/`下扩展

```python
# ✅ 正确
backend/uteki/domains/agent/agents/my_agent.py

# ❌ 错误
backend/uteki/domains/my_agent/
```

#### 2. 命名规范

- **文件名**: 小写+下划线 `my_module.py`
- **类名**: 大驼峰 `MyClass`
- **函数名**: 小写+下划线 `my_function()`
- **常量**: 大写+下划线 `MY_CONSTANT`

#### 3. 类型注解

```python
# ✅ 使用类型注解
def get_user(user_id: str) -> Optional[User]:
    pass

# ❌ 缺少类型注解
def get_user(user_id):
    pass
```

#### 4. 异步优先

```python
# ✅ 使用async/await
async def fetch_data() -> dict:
    async with session.get(url) as resp:
        return await resp.json()

# ❌ 同步IO（除非必要）
def fetch_data() -> dict:
    resp = requests.get(url)
    return resp.json()
```

#### 5. 错误处理

```python
# ✅ 明确的错误处理
async def get_user(user_id: str) -> User:
    user = await repository.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# ❌ 忽略错误
async def get_user(user_id: str):
    return await repository.get_by_id(user_id)
```

### TypeScript前端

#### 1. 组件组织

```typescript
frontend/src/
├── components/      # 通用组件
│   ├── Button.tsx
│   └── Modal.tsx
├── pages/          # 页面组件
│   ├── admin/
│   └── agents/
├── hooks/          # 自定义hooks
├── stores/         # Zustand状态
└── utils/          # 工具函数
```

#### 2. 命名规范

- **组件**: 大驼峰 `MyComponent.tsx`
- **hooks**: 小驼峰+use前缀 `useMyHook.ts`
- **utils**: 小驼峰 `myUtil.ts`

#### 3. 类型定义

```typescript
// ✅ 明确的接口定义
interface User {
  id: string
  email: string
  username: string
}

function UserCard({ user }: { user: User }) {
  // ...
}

// ❌ 使用any
function UserCard({ user }: { user: any }) {
  // ...
}
```

---

## 文档规范

### ❌ 禁止的行为

- ❌ 在`docs/`目录随意创建markdown文件
- ❌ 使用中文文件名
- ❌ 省略代码块语言标识
- ❌ 使用绝对URL链接

### ✅ 正确的方式

1. **在`docs-site/`创建文档**

```bash
# ✅ 正确
docs-site/guide/my-feature.md

# ❌ 错误
docs/my-feature.md
```

2. **使用英文文件名**

```bash
# ✅ 正确
docs-site/guide/custom-agent.md

# ❌ 错误
docs-site/guide/自定义Agent.md
```

3. **明确代码语言**

````md
✅ 正确
```python
def hello():
    pass
```

❌ 错误
```
def hello():
    pass
```
````

4. **使用相对路径**

```md
✅ [快速开始](/getting-started/quickstart)
❌ [快速开始](https://docs.uteki.open/getting-started/quickstart)
```

5. **添加frontmatter**

```md
---
title: 页面标题
description: 页面描述
---

# 页面标题

内容...
```

### 文档本地预览

```bash
cd docs-site
pnpm install
pnpm docs:dev
```

访问 http://localhost:5173

---

## Git提交规范

### Conventional Commits

格式: `<type>(<scope>): <subject>`

#### Type类型

- `feat`: 新功能
- `fix`: Bug修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构（不是新功能也不是修复）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具链相关

#### 示例

```bash
# 新功能
git commit -m "feat(agent): add investing agent"

# Bug修复
git commit -m "fix(trading): handle order rejection"

# 文档
git commit -m "docs: update quickstart guide"

# 重构
git commit -m "refactor(admin): simplify API key service"
```

---

## Pull Request流程

### PR检查清单

提交PR前，确保：

- [ ] 代码通过所有测试
- [ ] 代码通过linter检查
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 遵循了代码规范
- [ ] 提交信息符合Conventional Commits

### Code Review

PR会经过以下检查：

1. **自动化测试**
   - pytest单元测试
   - ruff代码检查
   - mypy类型检查

2. **人工审查**
   - 代码质量
   - 架构设计
   - 文档完整性
   - 测试覆盖率

3. **合并条件**
   - 至少1个approve
   - 所有checks通过
   - 无冲突

---

## 架构决策记录 (ADR)

如果你的改动涉及重要的架构决策，请创建ADR：

```bash
docs-site/architecture/adr/NNN-title.md
```

格式参考: [ADR-004: 文档系统选型](/docs-site/architecture/adr/004-documentation.md)

---

## 测试规范

### 后端测试

```python
# tests/domains/admin/test_api_key_service.py

import pytest
from uteki.domains.admin.service import api_key_service

@pytest.mark.asyncio
async def test_create_api_key(db_session):
    """测试创建API密钥"""
    data = APIKeyCreate(
        provider="test",
        display_name="Test Key",
        api_key="test-key-123"
    )

    result = await api_key_service.create_api_key(db_session, data)

    assert result.provider == "test"
    assert result.display_name == "Test Key"
```

### 前端测试

```typescript
// src/components/__tests__/Button.test.tsx

import { render, screen } from '@testing-library/react'
import { Button } from '../Button'

test('renders button with text', () => {
  render(<Button>Click me</Button>)
  expect(screen.getByText('Click me')).toBeInTheDocument()
})
```

---

## 常见问题

### Q: 如何添加新的Agent类型？

A: 参考 [Agent扩展策略](/docs/ARCHITECTURE.md#agent-domain-扩展策略)

### Q: 如何添加新的数据库表？

A: 在对应domain的`models.py`中定义，然后运行数据库初始化

### Q: 如何添加文档？

A: 在`docs-site/`对应目录创建markdown文件，遵循文档规范

### Q: 如何本地测试？

A: 运行 `./scripts/verify_system.sh`

---

## 获取帮助

- 💬 [GitHub Discussions](https://github.com/yourusername/uteki.open/discussions)
- 🐛 [报告Bug](https://github.com/yourusername/uteki.open/issues)
- 📖 [文档站点](https://docs.uteki.open)

---

## 许可证

贡献的代码将使用MIT许可证发布。
