## Context

`AgentChatPage` 渲染在 `Layout.tsx` 内部，Layout 为所有子页面添加了 `p: 3` (24px) 的 padding。AgentChatPage 设置了 `height: 100vh`，导致总高度 = 100vh + 48px，外层 main 容器溢出产生页面级滚动条。同时消息区域有自己的 `overflowY: auto`，形成双重滚动条。

当前消息区域 `maxWidth: 900px` 在宽屏下右侧大面积空白。底部控制区（Research 按钮 + 模型选择器）也有相同的 maxWidth 约束，视觉上不够充分利用空间。

## Goals / Non-Goals

**Goals:**
- 消除双重滚动条，页面只保留消息区域的单一滚动
- 统一滚动条样式为细窄半透明，与 NewsTimelinePage 等页面一致
- 优化宽屏下的内容宽度利用
- 清理未使用的 import

**Non-Goals:**
- 不重构组件结构或拆分文件
- 不修改聊天功能逻辑（发送、流式响应、Research 模式等）
- 不修改 Layout.tsx（影响全局）
- 不处理移动端特有的样式问题（本次聚焦桌面端）

## Decisions

### 1. 负边距 + calc 方案消除外层溢出

采用与 `NewsTimelinePage` 相同的已验证方案：

```tsx
// AgentChatPage root Box
sx={{
  height: 'calc(100vh - 48px)',  // 减去 Layout 的上下 padding
  m: -3,                         // 负边距抵消 Layout 的 p: 3
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',            // 防止外层溢出
}}
```

**为何不修改 Layout.tsx**：Layout 是全局组件，修改会影响所有页面。负边距方案是页面级的局部处理，已有 NewsTimelinePage 作为成功先例。

### 2. 消息区域宽度从 900px 放宽到 1000px

`maxWidth: 900px` 在 1920px 屏幕下右侧空白约 500px。放宽到 1000px 更好地利用空间，同时不至于过宽影响阅读体验。底部输入区域保持同步。

### 3. 滚动条样式统一

```css
&::-webkit-scrollbar { width: 6px }
&::-webkit-scrollbar-track { background: transparent }
&::-webkit-scrollbar-thumb { background: rgba(brand, 0.3); border-radius: 3px }
```

与 NewsTimelinePage 左侧面板的滚动条样式一致。

### 4. 清理未使用 import

移除 `Drawer`, `Chip`, `ThoughtProcessCard`, `SourcesList`, `chatModes`, `getProviderColor`, `setSelectedMode` 等未使用的引用，减少编译警告。

## Risks / Trade-offs

- **负边距方案耦合 Layout padding 值**：如果 Layout 的 `p: 3` 改变，负边距需要同步更新。目前 NewsTimelinePage 已有相同耦合，可接受。→ 如果未来需要解耦，可以考虑在 Layout 中对特定路由禁用 padding。
- **maxWidth 放宽到 1000px**：更宽的文本区域可能稍微降低长段落的可读性。→ 1000px 仍在推荐阅读宽度范围内（60-80字符/行对于中文约需 800-1200px）。
