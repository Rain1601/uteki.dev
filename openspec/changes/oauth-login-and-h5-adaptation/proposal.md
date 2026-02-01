## Why

当前系统缺乏用户身份认证机制，所有用户共享同一个默认身份，无法实现个性化功能和数据隔离。同时，移动端用户体验差，UI 未针对小屏幕进行适配，影响用户在手机上使用 Agent 对话功能。

## What Changes

### OAuth 登录
- 添加 GitHub OAuth 登录流程（授权 → 回调 → 获取用户信息）
- 添加 Google OAuth 登录流程（授权 → 回调 → 获取用户信息）
- 生成系统内部 UID，关联 OAuth provider 和 provider user ID
- 实现 JWT token 机制用于会话管理
- 前端添加登录按钮和登录状态管理
- 对话历史与用户 UID 关联

### H5 移动端适配
- 响应式布局适配（侧边栏、对话区域）
- 触摸友好的交互设计（按钮大小、间距）
- 移动端专用导航模式（底部导航或抽屉式侧边栏）
- 虚拟键盘适配（输入框不被遮挡）
- 移动端性能优化（减少不必要的动画）

## Capabilities

### New Capabilities

- `oauth-login`: OAuth 登录能力，支持 GitHub 和 Google 第三方登录，生成系统 UID 并关联 OAuth 账号，包含 JWT 会话管理
- `h5-responsive`: H5 移动端响应式适配，包括布局适配、触摸交互优化、移动端导航模式

### Modified Capabilities

（无现有 specs 需要修改）

## Impact

### 后端
- `uteki/domains/admin/`: 用户模型已有 oauth_provider/oauth_id 字段，需实现完整 OAuth 流程
- `uteki/domains/admin/api.py`: 添加 OAuth 相关端点（/auth/github, /auth/google, /auth/callback）
- `uteki/domains/agent/`: 对话和消息需关联 user_id
- 新增依赖：`python-jose` (JWT), `httpx` (OAuth HTTP 请求)

### 前端
- `src/pages/`: 添加登录页面或登录弹窗组件
- `src/components/`: 添加响应式布局组件
- `src/hooks/`: 添加 useAuth hook 管理登录状态
- `src/styles/`: 添加移动端媒体查询样式
- 新增依赖：可能需要 `@react-oauth/google`

### 部署配置
- 已配置：GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
- 需确保：OAuth 回调 URL 配置正确

### 数据库
- 现有 `auth.users` 表已包含 oauth 字段，需验证结构完整性
- 对话表 `agent.chat_conversations` 已有 user_id 字段
