## Context

EvaluationPanel 是 IndexAgentPage 的第 6 个 tab（index 5），包含 6 个可视化区块（KPI Cards、Model Radar、Voting Heatmap、Performance Trend、Cost & Latency、Counterfactual），数据来自 5 个 GET 端点 + 1 个 Leaderboard 端点。

当前实现用 `Promise.all` 一次加载 6 个 API，全部完成前整屏 loading；`total_arena_runs === 0` 时直接返回一行空状态文字，6 个区块全部不渲染。

变更范围仅限 `EvaluationPanel.tsx` 一个文件（+ 可能抽取的子组件）。后端无变更。

## Goals / Non-Goals

**Goals:**
- 始终展示 6 个 Section 卡片骨架，让用户看到 Evaluation 的完整能力矩阵
- 每个 Section 独立加载/渲染，数据到达即显示，不互相阻塞
- 空状态提供上下文引导（什么数据、怎么产生、快捷跳转）
- API 错误在对应 Section 内可见，支持单 Section 重试
- 添加全局 Refresh 能力

**Non-Goals:**
- 不改变后端 5 个 endpoint 的接口/返回结构
- 不改变 6 个图表的数据内容和可视化类型（Radar/Line/Bar/Heatmap 保持不变）
- 不引入新的第三方依赖
- 不做 skeleton 动画（保持现有 LoadingDots 风格）

## Decisions

### D1: 独立 fetch hook 替代 Promise.all

**选择**: 将 6 个 API 调用拆分为独立的 `useAsyncData` 自定义 hook，每个管理自己的 `{data, loading, error, reload}` 状态。

**理由**:
- 避免一个慢接口阻塞其他区块渲染
- 每个 Section 可独立重试，不需要重新加载全部 6 个
- 代码更声明式，Section 组件只关心自己的数据

**替代方案**:
- `Promise.allSettled` — 仍然等待全部完成才渲染，只是不因单个失败阻断全部。不够好，因为仍然有整体阻塞。
- React Query / SWR — 功能更强（缓存、refetch interval），但项目未使用，引入新依赖不划算。

### D2: 三态 Section 组件

**选择**: 增强现有 `Section` 组件，接收 `loading`、`error`、`onRetry` props，内部根据状态渲染 loading indicator / error + retry / children。

```tsx
<Section title="..." loading={vm.loading} error={vm.error} onRetry={vm.reload}>
  {/* 图表内容 — 仅在 data 存在时渲染 */}
</Section>
```

**理由**:
- 状态渲染逻辑集中在 Section，各图表区块不需要重复写 `if loading ... if error ...`
- 保持现有 Section 的视觉外观，只是增加内部状态分支

### D3: EmptyGuide 组件

**选择**: 新建 `EmptyGuide` 内联组件（在 EvaluationPanel.tsx 内部），接收 `title`（一句话说明）、`hint`（操作引导）、`actionLabel` + `onAction`（可选按钮）。

```tsx
<EmptyGuide
  title="Voting patterns between models"
  hint="Run Arena with 2+ models to generate cross-voting data"
  actionLabel="Go to Arena"
  onAction={() => { /* 切换到 Arena tab */ }}
/>
```

**理由**:
- 足够简单，不需要独立文件
- 6 个 Section 的空状态引导文案不同，但组件结构统一
- `onAction` 需要切换 tab，通过 props 回调或 URL hash 实现

**Tab 切换机制**: EvaluationPanel 无法直接控制 IndexAgentPage 的 `activeTab`。方案：通过 `onNavigate` prop 传入回调，IndexAgentPage 传 `setActiveTab`。

### D4: 全局 Refresh 按钮位置

**选择**: 在 KPI Cards 行的右侧放置一个 IconButton（Refresh icon），点击触发所有 6 个 hook 的 `reload()`。

**理由**:
- 不占用额外垂直空间
- KPI Cards 是页面第一行，refresh 按钮放在这里最直觉
- 使用 MUI `IconButton` + `Refresh` icon，保持轻量

### D5: Voting Heatmap 改用 MUI Table

**选择**: 将原生 `<table>` 替换为 MUI `Table` / `TableHead` / `TableBody` / `TableCell`，复用 LeaderboardTable 的 `tableCellSx` / `tableHeadSx` 样式模式。

**理由**:
- 与项目其他表格（LeaderboardTable、DecisionTimeline）风格一致
- MUI Table 自带 hover 效果、响应式支持

## Risks / Trade-offs

**6 个并发请求** → 页面加载时同时发 6 个 API。对于单用户应用问题不大；如果需要，可以在后端合并为一个 `/evaluation/all` 端点，但目前不值得增加复杂度。

**Tab 切换耦合** → EmptyGuide 的 "Go to Arena" 按钮需要跨组件切换 tab。通过 props 回调传递 `setActiveTab` 函数，简单但形成了 EvaluationPanel → IndexAgentPage 的隐式依赖。可接受，因为是同页面内的父子关系。

**数据一致性窗口** → 6 个 API 独立加载意味着在极短时间窗口内可能看到不一致的数据（比如 overview 显示 5 runs 但 trend 显示 4 runs 的数据）。实际影响极小，用户不会注意到毫秒级的数据差异。
