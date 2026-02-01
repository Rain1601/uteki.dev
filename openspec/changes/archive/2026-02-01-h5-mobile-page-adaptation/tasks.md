## 1. LoginPage 移动端适配

- [x] 1.1 导入 useResponsive hook 并获取 isMobile 状态
- [x] 1.2 调整 Paper 组件移动端样式：移除 maxWidth 限制，添加响应式内边距
- [x] 1.3 调整登录按钮移动端高度至 44px 以上，确保触摸区域符合规范
- [x] 1.4 调整移动端字体大小：标题适当缩小，正文保持 14px 以上

## 2. AdminPage 移动端适配

- [x] 2.1 导入 useResponsive hook 并获取 isMobile 状态
- [x] 2.2 修改 Grid 布局：移动端使用 xs={12} 单列布局
- [x] 2.3 为 TableContainer 添加 sx={{ overflowX: 'auto' }} 实现横向滚动
- [x] 2.4 调整移动端卡片标题区按钮布局：垂直堆叠或使用 IconButton
- [x] 2.5 调整 Dialog 表单移动端样式：输入框 fullWidth，按钮高度 44px
- [x] 2.6 增加表格操作按钮的触摸区域（IconButton 添加适当 padding）

## 3. DemoPage 移动端适配

- [x] 3.1 导入 useResponsive hook 并获取 isMobile 状态
- [x] 3.2 调整统计卡片移动端布局：xs={12} 或 xs={6} 网格
- [x] 3.3 调整按钮演示区移动端布局：使用 flexWrap 和合适的 gap
- [x] 3.4 为 TableContainer 添加横向滚动支持
- [x] 3.5 调整移动端输入框布局：垂直堆叠，宽度 100%

## 4. 通用样式调整

- [x] 4.1 确认 index.css 中已有全局触摸目标优化（44px 最小尺寸）
- [x] 4.2 验证移动端页面内边距统一为 16px（1rem）
- [x] 4.3 验证所有主要按钮移动端高度不小于 44px
