## Context

当前应用已有基础的响应式支持：
- `useResponsive` hook 提供 `isMobile`、`isTablet`、`isDesktop`、`isSmallScreen` 断点检测
- `useKeyboardVisibility` hook 检测虚拟键盘状态
- 侧边栏（HoverSidebar）已适配移动端使用 SwipeableDrawer
- AgentChatPage 已有基础的移动端布局

需要适配的页面：LoginPage、AdminPage、DemoPage 以及相关组件

MUI 断点定义：
- xs: 0px
- sm: 600px（移动端阈值）
- md: 900px（平板/桌面阈值）

## Goals / Non-Goals

**Goals:**
- LoginPage 在移动端居中显示，表单宽度自适应
- AdminPage 表格在移动端可横向滚动或改为卡片列表
- DemoPage 内容在移动端垂直堆叠
- 所有页面的字体、间距、按钮大小符合移动端触摸规范

**Non-Goals:**
- 不重新设计桌面端 UI
- 不改变现有功能逻辑
- 不添加移动端专属功能（如手势导航）

## Decisions

### 1. 响应式策略：Mobile-first 条件样式

**选择**: 使用 `useResponsive` hook + sx prop 条件样式

**理由**:
- 已有 hook 提供断点检测
- MUI sx prop 支持响应式值
- 避免引入额外 CSS-in-JS 库

**替代方案考虑**:
- CSS Media Queries：需要额外 CSS 文件，与 MUI 主题分离
- styled-components：增加依赖，团队不熟悉

### 2. AdminPage 表格适配

**选择**: 移动端使用可横向滚动的容器 + 简化列

**理由**:
- 保持数据完整性
- MUI Table 原生支持
- 实现简单

**替代方案考虑**:
- 卡片列表：实现复杂，需要重构数据展示逻辑
- 折叠行：用户体验不佳

### 3. 触摸区域标准

**选择**: 最小触摸目标 44x44px（Apple HIG 标准）

**理由**:
- 行业标准
- 已在 index.css 中定义全局规则

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 表格在极小屏幕上仍然难以阅读 | 提供字体缩放或关键列优先显示 |
| 不同设备像素密度导致显示差异 | 使用 rem/em 相对单位 |
| 测试覆盖不足 | 使用 Chrome DevTools 模拟多种设备 |
