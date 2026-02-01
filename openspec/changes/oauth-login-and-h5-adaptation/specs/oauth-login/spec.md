## ADDED Requirements

### Requirement: GitHub OAuth 登录
系统 SHALL 支持用户通过 GitHub 账号进行 OAuth 登录认证。

#### Scenario: 发起 GitHub 登录
- **WHEN** 用户点击 "使用 GitHub 登录" 按钮
- **THEN** 系统跳转到 GitHub OAuth 授权页面

#### Scenario: GitHub 授权成功回调
- **WHEN** 用户在 GitHub 授权页面点击 "Authorize"
- **THEN** 系统接收 GitHub 回调，获取用户信息，生成 JWT token，跳转回应用首页

#### Scenario: GitHub 授权取消
- **WHEN** 用户在 GitHub 授权页面点击取消
- **THEN** 系统跳转回登录页面，显示 "登录已取消" 提示

### Requirement: Google OAuth 登录
系统 SHALL 支持用户通过 Google 账号进行 OAuth 登录认证。

#### Scenario: 发起 Google 登录
- **WHEN** 用户点击 "使用 Google 登录" 按钮
- **THEN** 系统跳转到 Google OAuth 授权页面

#### Scenario: Google 授权成功回调
- **WHEN** 用户在 Google 授权页面同意授权
- **THEN** 系统接收 Google 回调，获取用户信息，生成 JWT token，跳转回应用首页

#### Scenario: Google 授权失败
- **WHEN** 用户在 Google 授权页面拒绝授权
- **THEN** 系统跳转回登录页面，显示 "登录已取消" 提示

### Requirement: 系统 UID 生成与 OAuth 账号关联
系统 SHALL 为每个 OAuth 用户生成唯一的系统内部 UID，并关联其 OAuth provider 和 provider user ID。

#### Scenario: 首次 OAuth 登录创建用户
- **WHEN** 用户首次使用 OAuth 登录
- **THEN** 系统创建新用户记录，生成 UUID 作为系统 UID，关联 oauth_provider 和 oauth_id

#### Scenario: 已有用户 OAuth 登录
- **WHEN** 用户使用之前登录过的 OAuth 账号再次登录
- **THEN** 系统识别已有用户，返回该用户的系统 UID

#### Scenario: 不同 OAuth provider 同一邮箱
- **WHEN** 用户使用 GitHub 登录后，再用相同邮箱的 Google 账号登录
- **THEN** 系统创建新的用户记录（不自动合并）

### Requirement: JWT Token 会话管理
系统 SHALL 使用 JWT token 进行无状态会话管理。

#### Scenario: Token 生成
- **WHEN** OAuth 登录成功
- **THEN** 系统生成包含 user_id 的 JWT token，有效期 7 天

#### Scenario: Token 验证
- **WHEN** 用户发起需要认证的 API 请求
- **THEN** 系统从 Cookie 中读取 JWT token 并验证有效性

#### Scenario: Token 过期
- **WHEN** JWT token 已过期
- **THEN** 系统返回 401 Unauthorized，前端跳转到登录页面

#### Scenario: Token 无效
- **WHEN** JWT token 格式错误或签名无效
- **THEN** 系统返回 401 Unauthorized

### Requirement: 用户登出
系统 SHALL 支持用户主动登出。

#### Scenario: 用户点击登出
- **WHEN** 用户点击 "登出" 按钮
- **THEN** 系统清除 Cookie 中的 JWT token，跳转到登录页面

### Requirement: 登录状态展示
前端 SHALL 展示当前用户的登录状态。

#### Scenario: 已登录用户
- **WHEN** 用户已登录
- **THEN** 页面显示用户头像/名称和登出按钮

#### Scenario: 未登录用户
- **WHEN** 用户未登录
- **THEN** 页面显示登录按钮

### Requirement: 对话历史与用户关联
系统 SHALL 将对话历史与当前登录用户的 UID 关联。

#### Scenario: 登录用户创建对话
- **WHEN** 已登录用户发起新对话
- **THEN** 对话记录关联该用户的系统 UID

#### Scenario: 登录用户查看对话历史
- **WHEN** 已登录用户查看对话历史
- **THEN** 仅显示该用户自己的对话记录

#### Scenario: 未登录用户
- **WHEN** 未登录用户尝试发起对话
- **THEN** 系统提示用户需要先登录
