## Context

当前 uteki.open 是一个部署在 Google Cloud Run 上的 AI 对话平台，包含：
- **后端**: FastAPI + PostgreSQL (Supabase)
- **前端**: React + MUI + Vite

现状：
- 用户模型 (`auth.users`) 已存在 `oauth_provider`, `oauth_id` 字段
- 部署配置已包含 Google/GitHub OAuth credentials
- 前端构建已接收 `VITE_GOOGLE_CLIENT_ID`, `VITE_GITHUB_CLIENT_ID`
- 当前所有用户使用默认 `user_id='default'`

约束：
- Cloud Run 无状态，需使用 JWT 进行会话管理
- 需同时支持桌面端和移动端
- OAuth 回调需处理跨域问题

## Goals / Non-Goals

**Goals:**
- 实现完整的 GitHub/Google OAuth 登录流程
- 生成系统内部 UID 并与 OAuth 账号关联
- 使用 JWT 实现无状态会话管理
- 前端支持登录状态管理和 token 刷新
- H5 响应式布局，支持 320px - 1920px 屏幕宽度
- 移动端友好的导航和交互

**Non-Goals:**
- 不实现用户名密码登录（仅 OAuth）
- 不实现用户权限/角色系统（本期）
- 不实现多端同步登录状态
- 不做原生 App 适配（仅 H5 网页）

## Decisions

### D1: OAuth 流程选择 - 后端代理模式

**选择**: 后端处理完整 OAuth 流程，前端只负责跳转和接收 token

**备选方案**:
- A) 前端 SDK 模式 (如 @react-oauth/google) - 前端直接与 OAuth provider 交互
- B) 后端代理模式 - 前端跳转到后端 OAuth URL，后端处理回调

**理由**:
- 后端代理更安全，client_secret 不暴露给前端
- 统一处理 GitHub 和 Google，前端代码更简单
- 便于后续添加更多 OAuth provider

**流程**:
```
前端 → GET /api/auth/{provider}/login → 302 跳转到 OAuth provider
OAuth provider → GET /api/auth/{provider}/callback → 后端验证并生成 JWT
后端 → 302 跳转回前端并携带 token (URL fragment 或 cookie)
```

### D2: Token 存储 - HttpOnly Cookie + CSRF Token

**选择**: JWT 存储在 HttpOnly Cookie，CSRF token 存储在 localStorage

**备选方案**:
- A) localStorage 存储 JWT - 简单但有 XSS 风险
- B) HttpOnly Cookie - 安全但需处理 CSRF
- C) Memory + Refresh Token - 最安全但实现复杂

**理由**:
- HttpOnly Cookie 防止 XSS 窃取 token
- 配合 SameSite=Lax 和 CSRF token 防止 CSRF 攻击
- Cloud Run 前后端同域（同一 run.app），Cookie 无跨域问题

### D3: 移动端导航 - 抽屉式侧边栏

**选择**: 移动端使用抽屉式侧边栏，点击汉堡菜单打开

**备选方案**:
- A) 底部 Tab 导航 - 类似原生 App
- B) 抽屉式侧边栏 - 保持与桌面端一致
- C) 顶部下拉菜单 - 节省空间

**理由**:
- 抽屉式与桌面端侧边栏结构一致，代码复用度高
- 对话型应用主要操作在中间区域，侧边栏使用频率较低
- MUI Drawer 组件成熟，支持手势滑动

### D4: 响应式断点

**选择**: 使用 MUI 默认断点，主要关注 `sm` (600px) 分界

| 断点 | 宽度 | 布局 |
|------|------|------|
| xs | 0-599px | 移动端：隐藏侧边栏，全屏对话 |
| sm | 600-899px | 平板：可选侧边栏 |
| md+ | 900px+ | 桌面端：固定侧边栏 |

## Risks / Trade-offs

### R1: OAuth 回调 URL 配置
**风险**: 开发/生产环境回调 URL 不同，配置错误导致登录失败
**缓解**:
- 使用环境变量 `OAUTH_REDIRECT_BASE`
- 在 OAuth provider 控制台配置多个回调 URL

### R2: Token 过期处理
**风险**: JWT 过期后用户需重新登录，体验差
**缓解**:
- 设置较长的 token 有效期 (7 天)
- 实现静默刷新机制 (refresh token)
- 前端拦截 401 响应，自动跳转登录

### R3: 移动端虚拟键盘遮挡
**风险**: 输入框被虚拟键盘遮挡
**缓解**:
- 使用 `visualViewport` API 检测键盘高度
- 输入框获取焦点时自动滚动到可视区域
- 设置 `meta viewport` 禁止缩放

### R4: 首次登录用户数据迁移
**风险**: 未登录用户的对话历史在登录后丢失
**缓解**:
- 本期不处理，登录后重新开始
- 后续可考虑合并 `default` 用户数据到真实用户
