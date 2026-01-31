# 本地开发指南

## 快速开始

### 1. 启动本地后端（包含 Agent Chat 功能）

```bash
cd /Users/rain/PycharmProjects/uteki.open/backend
python -m uteki.main_dev
```

后端将启动在: **http://localhost:8888**

### 2. 启动前端

```bash
cd /Users/rain/PycharmProjects/uteki.open/frontend
npm run dev
```

前端将启动在: **http://localhost:5173**

---

## 本地 vs 云端环境

### 本地开发环境
- ✅ **所有功能已启用**：Admin API, Agent Chat API
- 📁 **数据库**: SQLite (`./data/uteki.db`)
- 🔑 **配置**: `.env` 文件
- 🌐 **访问**: http://localhost:5173

### 云端生产环境
- ⚠️ **基础功能**: 健康检查、数据库连接
- ❌ **暂未启用**: Admin API, Agent Chat API (启动超时问题待解决)
- 🗄️ **数据库**: Supabase PostgreSQL
- 🔒 **配置**: GitHub Secrets
- 🌐 **访问**: https://uteki-frontend-ob52o276la-uc.a.run.app

**数据完全隔离** - 本地修改不会影响云端数据

---

## 测试 Agent Chat 功能

### 方式1: 通过前端界面

1. 访问 http://localhost:5173/agent
2. 点击"新建会话"
3. 在聊天框输入消息
4. 观察流式响应

### 方式2: 通过 API 文档

1. 访问 http://localhost:8888/docs
2. 找到 **agent** 标签
3. 测试以下端点:
   - `POST /api/agent/conversations` - 创建会话
   - `POST /api/agent/chat` - 发送消息（流式）
   - `POST /api/agent/chat/sync` - 发送消息（非流式）

### 方式3: 使用 curl

```bash
# 创建会话
curl -X POST http://localhost:8888/api/agent/conversations \
  -H "Content-Type: application/json" \
  -d '{"title": "测试会话", "mode": "chat"}'

# 发送消息（流式）
curl -X POST http://localhost:8888/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": null,
    "message": "你好，请介绍一下自己",
    "mode": "chat",
    "stream": true
  }'
```

---

## 前置条件

### 必需的环境变量

在 `backend/.env` 文件中配置:

```bash
# 数据库配置（本地使用 SQLite）
DATABASE_TYPE=sqlite
SQLITE_DB_PATH=./data/uteki.db

# LLM API Keys (至少配置一个)
OPENAI_API_KEY=sk-...
# 或
ANTHROPIC_API_KEY=sk-ant-...
# 或
DASHSCOPE_API_KEY=sk-...  # Qwen
```

### 数据库初始化

首次运行需要初始化数据库:

```bash
cd backend
# 创建数据库表结构
alembic upgrade head
```

### 创建 LLM Provider 配置

在使用 Agent Chat 前，需要配置 LLM Provider:

1. 访问 http://localhost:5173/admin
2. 进入 "LLM Providers" 标签
3. 创建一个 Provider 配置:
   - Provider: `openai`, `anthropic`, 或 `dashscope`
   - Model: `gpt-4`, `claude-3-opus`, 等
   - 选择对应的 API Key

---

## 常见问题

### Q: 启动报错 "No module named 'email_validator'"

```bash
pip install pydantic[email]
```

### Q: Agent Chat 返回 404

确保:
1. 本地运行的是 `main_dev.py` 而不是 `main.py`
2. 后端启动日志显示 "All domain routers registered"

### Q: Agent Chat 返回 500 错误

检查:
1. 是否已创建 LLM Provider 配置
2. 是否已创建 API Key 配置
3. API Key 是否有效

### Q: 数据库连接失败

**SQLite 模式** (默认，推荐本地开发):
- 确保 `DATABASE_TYPE=sqlite`
- 数据库文件会自动创建在 `./data/uteki.db`

**PostgreSQL 模式** (可选):
- 需要本地运行 PostgreSQL 或使用 Docker
- 配置 `DATABASE_TYPE=postgresql`

---

## 开发工作流

### 推荐流程

1. **本地开发和测试**
   ```bash
   # 启动本地后端（所有功能）
   python -m uteki.main_dev

   # 启动前端
   npm run dev

   # 测试功能
   ```

2. **提交代码**
   ```bash
   git add .
   git commit -m "feature: ..."
   git push origin main
   ```

3. **自动部署到云端**
   - GitHub Actions 自动触发
   - 仅部署基础功能（健康检查）
   - Agent/Admin 功能待云端启动问题解决后启用

### 数据库迁移

```bash
# 创建迁移
alembic revision --autogenerate -m "描述"

# 应用迁移
alembic upgrade head

# 回滚迁移
alembic downgrade -1
```

---

## 下一步

1. ✅ 本地测试 Agent Chat 功能
2. 🔍 调查 Cloud Run 启动超时问题
3. 🚀 解决后重新启用云端完整功能

---

## 技术支持

遇到问题？
- 查看后端日志: 终端输出
- 查看前端控制台: 浏览器 DevTools
- 检查健康状态: http://localhost:8888/health
