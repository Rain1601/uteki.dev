## Why

Agent Chat 页面 (`/agent`) 存在双重滚动条问题：`Layout.tsx` 为所有子页面添加了 `p: 3` (24px padding)，而 `AgentChatPage` 设置了 `height: 100vh`，导致实际渲染高度为 `100vh + 48px`，外层 main 容器溢出产生页面级滚动条，叠加消息区域自身的 `overflowY: auto` 形成双重滚动条。同时页面整体的 UI 展示和交互细节需要一次梳理优化。

## What Changes

- **修复双重滚动条**：采用与 `NewsTimelinePage` 相同的负边距 + calc 方案，让 AgentChatPage 填满 Layout 可用空间，消除外层溢出
- **优化消息区域滚动条样式**：使用细窄半透明滚动条，与项目其他页面（NewsTimeline 等）风格统一
- **优化消息区域宽度**：当前固定 `maxWidth: 900px` 在宽屏下右侧大面积空白，考虑适当加宽或让底部输入区域与消息区域宽度一致
- **优化首条消息异常显示**：截图中首条消息显示了原始 request ID（`req_011CXoMFd...`），排查消息渲染逻辑中是否有未处理的 edge case
- **统一底部控制区样式**：模型选择器和 Research 按钮区域的间距和对齐优化
- **清理未使用的导入**：页面中有多个未使用的 import（Drawer, Chip, ThoughtProcessCard, SourcesList 等）

## Capabilities

### New Capabilities
_无新增能力_

### Modified Capabilities
_无 spec 层面的行为变更，仅 UI 样式和布局修复_

## Impact

- **前端文件**：`frontend/src/pages/AgentChatPage.tsx`（主要修改）
- **可能涉及**：`frontend/src/components/ChatMessage.tsx`（滚动条样式）
- **不涉及**：后端 API、数据模型、其他页面
- **风险**：低，纯前端样式修改，不影响功能逻辑
