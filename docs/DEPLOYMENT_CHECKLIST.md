# 🚀 CI/CD 部署检查清单

**目标：** git push → 自动部署到云端 → 数据隔离

**预计时间：** 2-3 小时

---

## ✅ 阶段一：Google Cloud 设置（30分钟）

- [ ] 注册 Google Cloud 账号（获得 $300 免费额度）
- [ ] 创建项目：`uteki-production`
- [ ] 启用 API：
  - [ ] Cloud Run API
  - [ ] Cloud Build API
  - [ ] Artifact Registry API
  - [ ] Secret Manager API
- [ ] 创建服务账号：`github-actions`
- [ ] 授予权限：Cloud Run Admin, Service Account User, Cloud Build Editor, Artifact Registry Admin, Secret Manager Accessor
- [ ] 下载服务账号 JSON 密钥文件（妥善保存！）

---

## ✅ 阶段二：数据库设置（20分钟）

- [ ] 注册 Supabase 账号
- [ ] 创建项目：`uteki-production`
- [ ] 选择区域：Northeast Asia (Seoul)
- [ ] 保存数据库密码
- [ ] 复制 Database URI：`postgresql://postgres:...`
- [ ] 运行 SQL 创建 schemas（admin, agent, user）

---

## ✅ 阶段三：OAuth 配置（15分钟）

### Google OAuth
- [ ] Google Cloud Console → APIs & Services → OAuth consent screen
- [ ] 配置应用信息
- [ ] 创建 OAuth Client ID（Web Application）
- [ ] 保存 Client ID 和 Client Secret

### GitHub OAuth
- [ ] GitHub Settings → Developer Settings → OAuth Apps
- [ ] 创建新应用
- [ ] 保存 Client ID
- [ ] 生成并保存 Client Secret

---

## ✅ 阶段四：GitHub Secrets（15分钟）

在 GitHub 仓库 Settings → Secrets and variables → Actions 添加：

- [ ] `GCP_SA_KEY`（服务账号 JSON 完整内容）
- [ ] `GCP_PROJECT_ID`（项目 ID）
- [ ] `DATABASE_URL`（Supabase 连接串）
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `GITHUB_CLIENT_ID`
- [ ] `GITHUB_CLIENT_SECRET`
- [ ] `SECRET_KEY`（运行 `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` 生成）

---

## ✅ 阶段五：项目代码配置（45分钟）

### 后端
- [ ] 创建 `backend/Dockerfile`
- [ ] 创建 `backend/.dockerignore`
- [ ] 创建 `backend/.env.example`
- [ ] 创建 `backend/.env.local`（本地开发用）
- [ ] 更新 `.gitignore` 确保 `.env.local` 被忽略

### 前端
- [ ] 创建 `frontend/Dockerfile`
- [ ] 创建 `frontend/.dockerignore`
- [ ] 创建 `frontend/nginx.conf`
- [ ] 创建 `frontend/.env.development`
- [ ] 创建 `frontend/.env.production`
- [ ] 更新 `.gitignore` 确保 `.env.*` 被忽略

### GitHub Actions
- [ ] 创建 `.github/workflows/deploy.yml`

---

## ✅ 阶段六：本地测试（20分钟）

### 后端测试
- [ ] 安装依赖：`poetry install`
- [ ] 初始化数据库：`python -m uteki.scripts.init_db`
- [ ] 启动服务：`uvicorn uteki.main:app --reload`
- [ ] 访问 http://localhost:8000/docs 确认 API 正常

### 前端测试
- [ ] 安装依赖：`npm install`
- [ ] 启动服务：`npm run dev`
- [ ] 访问 http://localhost:5173 确认页面正常
- [ ] 测试 Google OAuth 登录
- [ ] 测试 GitHub OAuth 登录

---

## ✅ 阶段七：首次部署（20分钟）

- [ ] 提交所有代码：`git add . && git commit -m "feat: add CI/CD"`
- [ ] 推送到 GitHub：`git push origin main`
- [ ] 访问 GitHub Actions 查看部署进度
- [ ] 等待部署完成（约 10-15 分钟）
- [ ] 记录部署 URL：
  - Backend: `https://uteki-backend-_______.run.app`
  - Frontend: `https://uteki-frontend-_______.run.app`

---

## ✅ 阶段八：更新 OAuth 回调（10分钟）

### Google OAuth
- [ ] 添加生产环境回调 URL：`https://uteki-frontend-xxx.run.app/auth/google/callback`

### GitHub OAuth
- [ ] 更新回调 URL：`https://uteki-frontend-xxx.run.app/auth/github/callback`

---

## ✅ 阶段九：验证部署（10分钟）

- [ ] 访问云端前端 URL
- [ ] 测试 Google OAuth 登录
- [ ] 测试 GitHub OAuth 登录
- [ ] 创建测试数据
- [ ] 刷新页面，数据仍存在
- [ ] 确认本地和云端数据库隔离

---

## 🎉 完成！

### 环境隔离验证

**本地环境：**
- 地址：http://localhost:5173
- 数据库：SQLite (uteki_local.db)
- 配置：`.env.local`

**云端环境：**
- 地址：https://uteki-frontend-xxx.run.app
- 数据库：Supabase (云端 PostgreSQL)
- 配置：GitHub Secrets

---

## 📊 日常使用

### 开发流程

```bash
# 1. 本地开发和测试
git checkout -b feature/new-feature
# ... 开发代码 ...
npm run dev  # 本地测试

# 2. 提交代码
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature

# 3. 创建 PR 并合并到 main

# 4. 自动部署（无需任何操作）
# 访问 GitHub Actions 查看进度
```

### 查看日志

```bash
# 后端日志
gcloud run services logs read uteki-backend --region us-central1 --limit 50

# 前端日志
gcloud run services logs read uteki-frontend --region us-central1 --limit 50
```

---

## 💰 预计成本

**第一年：**
- Google Cloud：$0（免费套餐 + $300 赠金）
- Supabase：$0（免费套餐）
- 域名（可选）：$12/年
- **总计：≈ $0-12/年**

---

## 📚 文档位置

- 完整指南：`docs/CI_CD_DEPLOYMENT_GUIDE.md`
- 本检查清单：`docs/DEPLOYMENT_CHECKLIST.md`

---

## ⚠️ 重要提示

1. ✅ 永远不要提交 `.env` 文件
2. ✅ 所有密钥存储在 GitHub Secrets
3. ✅ 本地使用 `.env.local`，云端使用环境变量
4. ✅ 定期备份 Supabase 数据库
5. ✅ 设置 Google Cloud 预算提醒

---

**文档版本：** 1.0
**最后更新：** 2026-01-30
