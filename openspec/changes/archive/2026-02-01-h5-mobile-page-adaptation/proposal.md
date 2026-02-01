## Why

当前应用的部分页面在移动端（H5）显示效果不佳，需要在保持现有桌面端样式的基础上，对手机端进行响应式适配，提升移动端用户体验。

## What Changes

- 对所有主要页面进行移动端响应式适配
- 调整布局、字体大小、间距以适应小屏幕
- 优化触摸交互体验
- 确保核心功能在移动端可用

### 需要适配的页面

1. **LoginPage** - 登录页面移动端优化
2. **AdminPage** - 管理页面表格和表单的移动端适配
3. **DemoPage** - 演示页面响应式布局
4. **通用组件** - 确保所有共享组件支持响应式

## Capabilities

### New Capabilities

- `responsive-pages`: 页面级别的响应式布局适配，包括 LoginPage、AdminPage、DemoPage 的移动端样式优化

### Modified Capabilities

（无需修改现有 spec，仅为样式层面的适配）

## Impact

### 受影响的代码

- `frontend/src/pages/LoginPage.tsx` - 移动端布局优化
- `frontend/src/pages/AdminPage.tsx` - 表格和表单响应式
- `frontend/src/pages/DemoPage.tsx` - 演示内容响应式
- `frontend/src/components/*.tsx` - 部分组件的移动端样式调整

### 依赖

- 使用已有的 `useResponsive` hook 进行断点检测
- 复用 MUI 的响应式工具（breakpoints, useMediaQuery）

### 无破坏性变更

- 保持桌面端现有样式不变
- 仅添加移动端特定的样式覆盖
