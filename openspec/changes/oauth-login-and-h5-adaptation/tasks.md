## 1. 后端 OAuth 基础设施

- [x] 1.1 添加 `python-jose` 依赖用于 JWT 处理
- [x] 1.2 创建 `uteki/domains/auth/` 模块结构
- [x] 1.3 实现 JWT token 生成和验证工具函数
- [x] 1.4 创建 `get_current_user` 依赖注入函数
- [x] 1.5 添加 CSRF token 生成和验证中间件

## 2. 后端 GitHub OAuth

- [x] 2.1 实现 `GET /api/auth/github/login` 端点（重定向到 GitHub）
- [x] 2.2 实现 `GET /api/auth/github/callback` 端点（处理回调）
- [x] 2.3 获取 GitHub 用户信息（user ID, email, name, avatar）
- [x] 2.4 调用 `get_or_create_oauth_user` 创建/获取系统用户

## 3. 后端 Google OAuth

- [x] 3.1 实现 `GET /api/auth/google/login` 端点（重定向到 Google）
- [x] 3.2 实现 `GET /api/auth/google/callback` 端点（处理回调）
- [x] 3.3 获取 Google 用户信息（user ID, email, name, avatar）
- [x] 3.4 复用 `get_or_create_oauth_user` 创建/获取系统用户

## 4. 后端会话管理

- [x] 4.1 实现 `POST /api/auth/logout` 端点（清除 Cookie）
- [x] 4.2 实现 `GET /api/auth/me` 端点（获取当前用户信息）
- [x] 4.3 配置 JWT Cookie（HttpOnly, SameSite=Lax, Secure）
- [x] 4.4 添加 token 过期时间配置（默认 7 天）

## 5. 后端认证集成

- [x] 5.1 修改 `agent/api.py` 对话端点添加用户认证
- [x] 5.2 修改对话创建逻辑，使用实际 user_id
- [x] 5.3 修改对话查询逻辑，过滤当前用户的对话
- [x] 5.4 添加未认证用户的 401 响应处理

## 6. 前端认证 Hook

- [x] 6.1 创建 `src/hooks/useAuth.ts` hook
- [x] 6.2 实现 `login(provider)` 函数（跳转到后端 OAuth URL）
- [x] 6.3 实现 `logout()` 函数（调用后端登出接口）
- [x] 6.4 实现 `getCurrentUser()` 函数（获取当前用户）
- [x] 6.5 创建 AuthContext 用于全局状态管理

## 7. 前端登录 UI

- [x] 7.1 创建 `LoginPage.tsx` 登录页面组件
- [x] 7.2 添加 GitHub 登录按钮（图标 + 文字）
- [x] 7.3 添加 Google 登录按钮（图标 + 文字）
- [x] 7.4 添加登录状态加载指示器
- [x] 7.5 处理登录错误提示

## 8. 前端用户状态展示

- [x] 8.1 创建 `UserMenu.tsx` 组件（头像 + 下拉菜单）
- [x] 8.2 在侧边栏底部显示用户信息
- [x] 8.3 添加登出按钮和确认对话框
- [x] 8.4 实现登录/未登录状态切换显示

## 9. 前端路由保护

- [x] 9.1 创建 `ProtectedRoute` 组件
- [x] 9.2 未登录用户重定向到登录页
- [x] 9.3 登录成功后重定向回原页面
- [x] 9.4 处理 401 响应自动跳转登录

## 10. H5 响应式布局基础

- [x] 10.1 配置 MUI 断点（xs/sm/md）
- [x] 10.2 设置 viewport meta 标签（禁止缩放）
- [x] 10.3 创建响应式布局容器组件
- [x] 10.4 添加 CSS 媒体查询工具类

## 11. H5 侧边栏适配

- [x] 11.1 将侧边栏改为 MUI Drawer 组件
- [x] 11.2 移动端使用临时抽屉模式（temporary）
- [x] 11.3 桌面端使用永久模式（permanent）
- [x] 11.4 添加汉堡菜单按钮（移动端）
- [x] 11.5 实现手势滑动关闭抽屉

## 12. H5 对话区域适配

- [x] 12.1 对话区域全宽布局（移动端）
- [x] 12.2 消息气泡宽度自适应
- [x] 12.3 输入框底部固定定位
- [x] 12.4 发送按钮调整为图标按钮

## 13. H5 触摸优化

- [x] 13.1 增加按钮和可点击元素的触摸区域
- [x] 13.2 调整元素间距符合触摸规范
- [x] 13.3 添加触摸反馈效果（ripple）
- [x] 13.4 优化列表项点击区域

## 14. H5 虚拟键盘处理

- [x] 14.1 监听 visualViewport resize 事件
- [x] 14.2 键盘弹出时调整输入区域位置
- [x] 14.3 确保输入框不被键盘遮挡
- [x] 14.4 键盘收起时恢复布局

## 15. H5 性能优化

- [x] 15.1 使用 `prefers-reduced-motion` 减少动画
- [ ] 15.2 实现消息列表虚拟滚动（超过 50 条）
- [x] 15.3 用户头像使用适当尺寸
- [ ] 15.4 添加骨架屏加载状态

## 16. 测试和部署

- [ ] 16.1 本地测试 OAuth 流程（需配置回调 URL）
- [ ] 16.2 测试移动端布局（Chrome DevTools 模拟）
- [x] 16.3 更新 deploy.yml 添加 OAUTH_REDIRECT_BASE 环境变量
- [ ] 16.4 部署到 Cloud Run 并验证
- [ ] 16.5 在真实移动设备上测试
