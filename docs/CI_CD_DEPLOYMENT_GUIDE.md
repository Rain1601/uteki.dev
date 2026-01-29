# CI/CD 自动部署完全指南

**目标：** 实现 `git push` 到 master 分支后，自动部署到 Google Cloud Run，数据在云端保存，与本地环境完全隔离。

**预计时间：** 2-3 小时（首次配置）

---

## 📋 前置要求

- [ ] GitHub 账号
- [ ] Google 账号
- [ ] 本地已安装 Git
- [ ] 本地已安装 Docker（可选，用于本地测试）
- [ ] 信用卡（用于 Google Cloud 验证，不会扣费）

---

## 第一部分：Google Cloud 初始设置

### 步骤 1：创建 Google Cloud 项目（15分钟）

#### 1.1 注册 Google Cloud

1. 访问：https://console.cloud.google.com/
2. 点击右上角 **"开始免费试用"**
3. 填写信息：
   - 国家：选择你的国家
   - 账号类型：个人
   - 付款方式：添加信用卡（验证用，获得 $300 免费额度）
4. 完成注册

#### 1.2 创建新项目

1. 点击顶部项目选择器
2. 点击 **"新建项目"**
3. 填写项目信息：
   ```
   项目名称: uteki-production
   项目 ID: uteki-prod-[随机数字]（自动生成）
   ```
4. 点击 **"创建"**
5. 等待项目创建完成（约30秒）

#### 1.3 启用必要的 API

1. 在搜索框搜索并启用以下 API：

**Cloud Run API:**
```
左侧菜单 → APIs & Services → Library
搜索: Cloud Run API
点击 → 启用
```

**Cloud Build API:**
```
搜索: Cloud Build API
点击 → 启用
```

**Artifact Registry API:**
```
搜索: Artifact Registry API
点击 → 启用
```

**Secret Manager API:**
```
搜索: Secret Manager API
点击 → 启用
```

**等待所有 API 启用完成（约 2-3 分钟）**

---

### 步骤 2：创建服务账号（10分钟）

服务账号用于 GitHub Actions 访问 Google Cloud。

#### 2.1 创建服务账号

1. 左侧菜单 → **IAM & Admin** → **Service Accounts**
2. 点击 **"+ CREATE SERVICE ACCOUNT"**
3. 填写信息：
   ```
   Service account name: github-actions
   Service account ID: github-actions（自动生成）
   Description: Service account for GitHub Actions CI/CD
   ```
4. 点击 **"CREATE AND CONTINUE"**

#### 2.2 授予权限

在 "Grant this service account access to project" 页面，添加以下角色：

```
- Cloud Run Admin
- Service Account User
- Cloud Build Editor
- Artifact Registry Administrator
- Secret Manager Secret Accessor
```

**操作步骤：**
1. 点击 **"Select a role"** 下拉框
2. 搜索并选择上述每个角色
3. 点击 **"+ ADD ANOTHER ROLE"** 添加下一个
4. 全部添加完成后，点击 **"CONTINUE"**
5. 第三步可以跳过，点击 **"DONE"**

#### 2.3 创建密钥

1. 找到刚创建的 `github-actions` 服务账号
2. 点击右侧 **三个点** → **Manage keys**
3. 点击 **"ADD KEY"** → **"Create new key"**
4. 选择 **JSON** 格式
5. 点击 **"CREATE"**
6. 密钥文件会自动下载到本地（文件名类似：`uteki-prod-xxxx.json`）

**⚠️ 重要：** 妥善保管这个 JSON 文件，稍后会用到！

---

### 步骤 3：配置数据库（20分钟）

我们使用 Supabase 作为云端数据库（免费且易用）。

#### 3.1 创建 Supabase 项目

1. 访问：https://supabase.com/
2. 点击 **"Start your project"**
3. 使用 GitHub 账号登录
4. 点击 **"New project"**
5. 选择组织（或创建新组织）
6. 填写项目信息：
   ```
   Name: uteki-production
   Database Password: [生成强密码，务必保存！]
   Region: Northeast Asia (Seoul) - 选择离用户最近的区域
   Pricing Plan: Free
   ```
7. 点击 **"Create new project"**
8. 等待项目初始化（约 2 分钟）

#### 3.2 获取数据库连接信息

1. 项目创建完成后，点击左侧 **"Project Settings"** → **"Database"**
2. 找到 **Connection string** 部分
3. 复制 **URI** 格式的连接串（类似下面的格式）：
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
4. 保存这个连接串，稍后会用到

#### 3.3 创建数据库 Schema

1. 点击左侧 **"SQL Editor"**
2. 点击 **"+ New query"**
3. 复制粘贴以下 SQL（创建必要的 schema）：

```sql
-- 创建 admin schema
CREATE SCHEMA IF NOT EXISTS admin;

-- 创建 agent schema
CREATE SCHEMA IF NOT EXISTS agent;

-- 创建 user schema
CREATE SCHEMA IF NOT EXISTS user;

-- 授予权限
GRANT USAGE ON SCHEMA admin TO postgres;
GRANT USAGE ON SCHEMA agent TO postgres;
GRANT USAGE ON SCHEMA user TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA admin TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA agent TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA user TO postgres;
```

4. 点击 **"Run"** 执行
5. 确认执行成功（显示 "Success. No rows returned"）

---

## 第二部分：OAuth 配置

### 步骤 4：配置 Google OAuth（10分钟）

#### 4.1 创建 OAuth 客户端

1. 回到 Google Cloud Console：https://console.cloud.google.com/
2. 确保选择了 `uteki-production` 项目
3. 左侧菜单 → **APIs & Services** → **OAuth consent screen**

#### 4.2 配置同意屏幕

1. 选择 **External**（外部用户）
2. 点击 **"CREATE"**
3. 填写应用信息：
   ```
   App name: Uteki
   User support email: [你的邮箱]
   Developer contact email: [你的邮箱]
   ```
4. 点击 **"SAVE AND CONTINUE"**
5. Scopes 页面：点击 **"ADD OR REMOVE SCOPES"**
   - 选择：`/auth/userinfo.email`
   - 选择：`/auth/userinfo.profile`
   - 选择：`openid`
6. 点击 **"UPDATE"** → **"SAVE AND CONTINUE"**
7. Test users 页面：可以跳过，点击 **"SAVE AND CONTINUE"**
8. 点击 **"BACK TO DASHBOARD"**

#### 4.3 创建凭据

1. 点击左侧 **"Credentials"** 标签
2. 点击 **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. 填写信息：
   ```
   Application type: Web application
   Name: Uteki Web Client

   Authorized JavaScript origins:
   - http://localhost:5173 (本地开发)
   - https://uteki-prod-[你的项目ID].run.app (云端，稍后会更新)

   Authorized redirect URIs:
   - http://localhost:5173/auth/google/callback
   - https://uteki-prod-[你的项目ID].run.app/auth/google/callback
   ```
4. 点击 **"CREATE"**
5. 弹出窗口显示：
   ```
   Client ID: xxxxxxxxx.apps.googleusercontent.com
   Client Secret: GOCSPX-xxxxxxxxxxxxx
   ```
6. **复制并保存** 这两个值到记事本

---

### 步骤 5：配置 GitHub OAuth（5分钟）

#### 5.1 创建 OAuth App

1. 访问 GitHub：https://github.com/settings/developers
2. 点击 **"New OAuth App"**
3. 填写信息：
   ```
   Application name: Uteki
   Homepage URL: http://localhost:5173
   Authorization callback URL: http://localhost:5173/auth/github/callback
   ```
4. 点击 **"Register application"**

#### 5.2 获取凭据

1. 在应用页面，可以看到 **Client ID**
2. 点击 **"Generate a new client secret"**
3. **复制并保存** Client ID 和 Client Secret

#### 5.3 添加生产环境 URL（部署后更新）

稍后部署完成后，需要回来添加：
```
Homepage URL: https://your-domain.com
Callback URL: https://your-domain.com/auth/github/callback
```

---

## 第三部分：GitHub 配置

### 步骤 6：添加 GitHub Secrets（10分钟）

GitHub Secrets 用于安全存储敏感信息。

#### 6.1 打开项目的 Secrets 设置

1. 访问你的 GitHub 仓库
2. 点击 **Settings** 标签
3. 左侧菜单 → **Secrets and variables** → **Actions**
4. 点击 **"New repository secret"**

#### 6.2 添加以下 Secrets

逐个添加以下密钥（点击 "New repository secret" 添加每一个）：

**GCP_SA_KEY** (Google Cloud 服务账号密钥)
```
Name: GCP_SA_KEY
Value: [粘贴步骤 2.3 下载的 JSON 文件的完整内容]
```

**GCP_PROJECT_ID**
```
Name: GCP_PROJECT_ID
Value: uteki-prod-[你的项目ID]
```

**DATABASE_URL** (Supabase 连接串)
```
Name: DATABASE_URL
Value: postgresql://postgres:[密码]@db.xxxxx.supabase.co:5432/postgres
```

**GOOGLE_CLIENT_ID**
```
Name: GOOGLE_CLIENT_ID
Value: [步骤 4.3 获取的 Google Client ID]
```

**GOOGLE_CLIENT_SECRET**
```
Name: GOOGLE_CLIENT_SECRET
Value: [步骤 4.3 获取的 Google Client Secret]
```

**GITHUB_CLIENT_ID**
```
Name: GITHUB_CLIENT_ID
Value: [步骤 5.2 获取的 GitHub Client ID]
```

**GITHUB_CLIENT_SECRET**
```
Name: GITHUB_CLIENT_SECRET
Value: [步骤 5.2 获取的 GitHub Client Secret]
```

**SECRET_KEY** (JWT 密钥，用于会话加密)
```
Name: SECRET_KEY
Value: [生成随机字符串，可以使用以下命令生成]
```

**生成 SECRET_KEY 的方法：**
```bash
# 在终端运行
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## 第四部分：项目代码配置

### 步骤 7：创建 Dockerfile（15分钟）

#### 7.1 创建后端 Dockerfile

在 `backend/` 目录创建 `Dockerfile`：

```bash
cd backend
touch Dockerfile
```

文件内容：

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY pyproject.toml poetry.lock* ./

# 安装 Poetry 和依赖
RUN pip install poetry && \
    poetry config virtualenvs.create false && \
    poetry install --no-dev --no-interaction --no-ansi

# 复制应用代码
COPY . .

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# 运行数据库迁移和启动服务
CMD python -m uteki.scripts.init_db && \
    uvicorn uteki.main:app --host 0.0.0.0 --port $PORT
```

#### 7.2 创建 .dockerignore

在 `backend/` 目录创建 `.dockerignore`：

```
__pycache__
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
.venv/
pip-log.txt
pip-delete-this-directory.txt
.tox/
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
*.log
.git
.gitignore
.mypy_cache
.pytest_cache
.hypothesis
*.db
*.sqlite
.env
.env.local
```

#### 7.3 创建前端 Dockerfile

在 `frontend/` 目录创建 `Dockerfile`：

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建生产版本
RUN npm run build

# 生产镜像
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### 7.4 创建 nginx 配置

在 `frontend/` 目录创建 `nginx.conf`：

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

### 步骤 8：创建环境配置文件（10分钟）

#### 8.1 后端环境变量

在 `backend/` 创建 `.env.example`（模板文件）：

```env
# 数据库配置
DATABASE_URL=postgresql://postgres:password@localhost:5432/uteki

# OAuth 配置
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# 安全配置
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# 环境
ENVIRONMENT=development
```

在 `backend/` 创建 `.env.local`（本地开发配置）：

```env
DATABASE_URL=sqlite:///./uteki_local.db

GOOGLE_CLIENT_ID=[你的 Google Client ID]
GOOGLE_CLIENT_SECRET=[你的 Google Client Secret]
GITHUB_CLIENT_ID=[你的 GitHub Client ID]
GITHUB_CLIENT_SECRET=[你的 GitHub Client Secret]

SECRET_KEY=[生成的随机密钥]
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

ENVIRONMENT=development
```

#### 8.2 前端环境变量

在 `frontend/` 创建 `.env.development`（本地开发）：

```env
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=[你的 Google Client ID]
VITE_GITHUB_CLIENT_ID=[你的 GitHub Client ID]
```

在 `frontend/` 创建 `.env.production`（生产环境）：

```env
VITE_API_URL=https://uteki-api-[your-id].run.app
VITE_GOOGLE_CLIENT_ID=[你的 Google Client ID]
VITE_GITHUB_CLIENT_ID=[你的 GitHub Client ID]
```

---

### 步骤 9：创建 GitHub Actions 工作流（15分钟）

在项目根目录创建 `.github/workflows/deploy.yml`：

```bash
mkdir -p .github/workflows
touch .github/workflows/deploy.yml
```

文件内容：

```yaml
name: Deploy to Google Cloud Run

on:
  push:
    branches:
      - main
      - master

env:
  GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  GCP_REGION: us-central1
  BACKEND_SERVICE: uteki-backend
  FRONTEND_SERVICE: uteki-frontend

jobs:
  deploy-backend:
    name: Deploy Backend
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for GCP
        run: gcloud auth configure-docker

      - name: Build Docker image
        run: |
          cd backend
          docker build -t gcr.io/$GCP_PROJECT_ID/$BACKEND_SERVICE:$GITHUB_SHA .
          docker push gcr.io/$GCP_PROJECT_ID/$BACKEND_SERVICE:$GITHUB_SHA

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy $BACKEND_SERVICE \
            --image gcr.io/$GCP_PROJECT_ID/$BACKEND_SERVICE:$GITHUB_SHA \
            --region $GCP_REGION \
            --platform managed \
            --allow-unauthenticated \
            --set-env-vars="DATABASE_URL=${{ secrets.DATABASE_URL }}" \
            --set-env-vars="GOOGLE_CLIENT_ID=${{ secrets.GOOGLE_CLIENT_ID }}" \
            --set-env-vars="GOOGLE_CLIENT_SECRET=${{ secrets.GOOGLE_CLIENT_SECRET }}" \
            --set-env-vars="GITHUB_CLIENT_ID=${{ secrets.GITHUB_CLIENT_ID }}" \
            --set-env-vars="GITHUB_CLIENT_SECRET=${{ secrets.GITHUB_CLIENT_SECRET }}" \
            --set-env-vars="SECRET_KEY=${{ secrets.SECRET_KEY }}" \
            --set-env-vars="ENVIRONMENT=production" \
            --memory 512Mi \
            --cpu 1 \
            --max-instances 10 \
            --min-instances 0 \
            --timeout 300

      - name: Get Backend URL
        id: backend-url
        run: |
          URL=$(gcloud run services describe $BACKEND_SERVICE --region $GCP_REGION --format 'value(status.url)')
          echo "url=$URL" >> $GITHUB_OUTPUT
          echo "Backend deployed to: $URL"

  deploy-frontend:
    name: Deploy Frontend
    runs-on: ubuntu-latest
    needs: deploy-backend

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for GCP
        run: gcloud auth configure-docker

      - name: Get Backend URL
        id: get-backend-url
        run: |
          URL=$(gcloud run services describe $BACKEND_SERVICE --region $GCP_REGION --format 'value(status.url)')
          echo "backend_url=$URL" >> $GITHUB_OUTPUT

      - name: Build Docker image with API URL
        run: |
          cd frontend
          docker build \
            --build-arg VITE_API_URL=${{ steps.get-backend-url.outputs.backend_url }} \
            --build-arg VITE_GOOGLE_CLIENT_ID=${{ secrets.GOOGLE_CLIENT_ID }} \
            --build-arg VITE_GITHUB_CLIENT_ID=${{ secrets.GITHUB_CLIENT_ID }} \
            -t gcr.io/$GCP_PROJECT_ID/$FRONTEND_SERVICE:$GITHUB_SHA .
          docker push gcr.io/$GCP_PROJECT_ID/$FRONTEND_SERVICE:$GITHUB_SHA

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy $FRONTEND_SERVICE \
            --image gcr.io/$GCP_PROJECT_ID/$FRONTEND_SERVICE:$GITHUB_SHA \
            --region $GCP_REGION \
            --platform managed \
            --allow-unauthenticated \
            --memory 256Mi \
            --cpu 1 \
            --max-instances 5

      - name: Get Frontend URL
        run: |
          URL=$(gcloud run services describe $FRONTEND_SERVICE --region $GCP_REGION --format 'value(status.url)')
          echo "Frontend deployed to: $URL"
          echo "🚀 Deployment complete! Visit: $URL"
```

---

### 步骤 10：更新前端 Dockerfile 支持构建参数（5分钟）

修改 `frontend/Dockerfile`，添加构建参数支持：

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 接收构建参数
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GITHUB_CLIENT_ID

# 设置为环境变量
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_GITHUB_CLIENT_ID=$VITE_GITHUB_CLIENT_ID

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建生产版本
RUN npm run build

# 生产镜像
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

---

## 第五部分：本地测试与部署

### 步骤 11：本地测试（15分钟）

#### 11.1 测试后端

```bash
cd backend

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install poetry
poetry install

# 运行数据库初始化
python -m uteki.scripts.init_db

# 启动后端
uvicorn uteki.main:app --reload --port 8000
```

访问：http://localhost:8000/docs 查看 API 文档

#### 11.2 测试前端

打开新终端：

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问：http://localhost:5173

#### 11.3 测试 OAuth 登录

1. 点击前端的 Google 登录按钮
2. 确认能正常跳转到 Google 授权页面
3. 授权后能返回应用并登录成功
4. 同样测试 GitHub 登录

---

### 步骤 12：首次部署（20分钟）

#### 12.1 提交所有更改

```bash
# 在项目根目录
git add .
git commit -m "feat: add CI/CD configuration for Google Cloud Run deployment"
git push origin main
```

#### 12.2 监控部署进度

1. 访问 GitHub 仓库
2. 点击 **"Actions"** 标签
3. 可以看到工作流正在运行
4. 点击工作流查看详细日志

#### 12.3 等待部署完成

- Backend 部署：约 5-8 分钟
- Frontend 部署：约 3-5 分钟
- 总计：约 10-15 分钟

#### 12.4 获取部署 URL

部署完成后，在 Actions 日志的最后会显示：

```
Backend deployed to: https://uteki-backend-xxxxx.run.app
Frontend deployed to: https://uteki-frontend-xxxxx.run.app
```

保存这两个 URL！

---

### 步骤 13：更新 OAuth 回调 URL（5分钟）

#### 13.1 更新 Google OAuth

1. 回到 Google Cloud Console → APIs & Services → Credentials
2. 点击你的 OAuth 客户端
3. 在 "Authorized redirect URIs" 添加：
   ```
   https://uteki-frontend-xxxxx.run.app/auth/google/callback
   ```
4. 点击 **"SAVE"**

#### 13.2 更新 GitHub OAuth

1. 回到 GitHub OAuth App 设置
2. 更新 Callback URL：
   ```
   https://uteki-frontend-xxxxx.run.app/auth/github/callback
   ```
3. 点击 **"Update application"**

---

### 步骤 14：配置自定义域名（可选，15分钟）

如果你有自己的域名（例如 `uteki.app`）：

#### 14.1 在 Cloud Run 中映射域名

```bash
# 前端
gcloud run domain-mappings create \
  --service uteki-frontend \
  --domain uteki.app \
  --region us-central1

# 后端（使用子域名）
gcloud run domain-mappings create \
  --service uteki-backend \
  --domain api.uteki.app \
  --region us-central1
```

#### 14.2 更新 DNS 记录

Google Cloud 会显示需要添加的 DNS 记录，在你的域名提供商（如 Namecheap）添加：

```
Type: CNAME
Name: www
Value: ghs.googlehosted.com

Type: A
Name: @
Value: [Google Cloud 提供的 IP]
```

#### 14.3 等待 SSL 证书生成

- DNS 传播：5-30 分钟
- SSL 证书自动生成：10-30 分钟
- 完成后可以通过 HTTPS 访问你的域名

---

## 🎉 部署完成！

### 验证清单

- [ ] 访问云端前端 URL，页面正常显示
- [ ] Google OAuth 登录成功
- [ ] GitHub OAuth 登录成功
- [ ] 创建测试数据，刷新页面数据仍然存在
- [ ] 本地数据库和云端数据库完全隔离

---

## 日常使用流程

### 开发新功能

```bash
# 1. 在本地开发
cd backend
source venv/bin/activate
uvicorn uteki.main:app --reload

# 2. 本地测试通过后提交
git add .
git commit -m "feat: add new feature"
git push origin main

# 3. 自动部署到云端（无需手动操作）
# 访问 GitHub Actions 查看部署进度
```

### 查看云端日志

```bash
# 查看后端日志
gcloud run services logs read uteki-backend \
  --region us-central1 \
  --limit 100

# 查看前端日志
gcloud run services logs read uteki-frontend \
  --region us-central1 \
  --limit 100
```

### 回滚到上一个版本

```bash
# 列出所有版本
gcloud run revisions list \
  --service uteki-backend \
  --region us-central1

# 回滚到指定版本
gcloud run services update-traffic uteki-backend \
  --to-revisions [版本名称]=100 \
  --region us-central1
```

---

## 故障排查

### 问题 1：部署失败 - "Permission denied"

**解决方案：**
```bash
# 检查服务账号权限
gcloud projects get-iam-policy $GCP_PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:github-actions*"
```

### 问题 2：数据库连接失败

**解决方案：**
1. 检查 DATABASE_URL 格式是否正确
2. 在 Supabase 检查 IP 白名单（应该允许所有 IP）
3. 检查数据库密码是否正确

### 问题 3：OAuth 回调 URL 不匹配

**解决方案：**
1. 确认 Google/GitHub OAuth 设置中的回调 URL 与实际部署 URL 一致
2. 确保包含 `/auth/google/callback` 或 `/auth/github/callback` 路径

### 问题 4：前端无法连接后端

**解决方案：**
1. 检查 `frontend/.env.production` 中的 `VITE_API_URL` 是否正确
2. 检查后端是否允许跨域（CORS 配置）
3. 查看浏览器控制台的网络请求错误

---

## 成本监控

### 设置预算提醒

1. Google Cloud Console → Billing → Budgets & alerts
2. 点击 **"CREATE BUDGET"**
3. 设置预算：例如 $10/月
4. 设置提醒：50%, 90%, 100%
5. 添加邮箱接收通知

### 查看当前费用

```bash
# 查看本月费用
gcloud billing accounts list

# 详细费用报告
# 访问: https://console.cloud.google.com/billing
```

---

## 附录：常用命令

### Cloud Run 管理

```bash
# 列出所有服务
gcloud run services list --region us-central1

# 查看服务详情
gcloud run services describe uteki-backend --region us-central1

# 更新环境变量
gcloud run services update uteki-backend \
  --update-env-vars KEY=VALUE \
  --region us-central1

# 删除服务
gcloud run services delete uteki-backend --region us-central1
```

### 数据库管理

```bash
# 备份 Supabase 数据库
# 在 Supabase Dashboard → Database → Backups

# 本地连接到云端数据库（调试用）
psql "postgresql://postgres:[密码]@db.xxxxx.supabase.co:5432/postgres"
```

---

## 安全最佳实践

1. ✅ 永远不要将 `.env` 文件提交到 Git
2. ✅ 定期轮换 SECRET_KEY 和 OAuth 密钥
3. ✅ 使用 GitHub Secrets 存储所有敏感信息
4. ✅ 启用 Google Cloud 的安全扫描
5. ✅ 定期备份 Supabase 数据库
6. ✅ 监控异常流量和错误日志

---

## 获取帮助

- **Google Cloud 文档**: https://cloud.google.com/run/docs
- **Supabase 文档**: https://supabase.com/docs
- **GitHub Actions 文档**: https://docs.github.com/actions
- **项目 Issue**: 在 GitHub 仓库创建 Issue

---

**文档版本：** 1.0
**最后更新：** 2026-01-30
**维护者：** Uteki Team
