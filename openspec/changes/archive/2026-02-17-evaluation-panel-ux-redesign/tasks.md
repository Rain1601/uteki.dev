## 1. useAsyncData hook + 独立数据加载

- [x] 1.1 在 EvaluationPanel.tsx 内定义 `useAsyncData<T>(fetcher)` hook，返回 `{data, loading, error, reload}`，mount 时自动 fetch
- [x] 1.2 将 6 个 API 调用从 `Promise.all` + 集中 state 改为 6 个独立的 `useAsyncData` 调用（overview / votingMatrix / trend / costModels / cfModels / leaderboard）
- [x] 1.3 移除全局 `loading` state 和集中式 `load` callback

## 2. Section 组件三态增强

- [x] 2.1 给 Section 组件增加 `loading?: boolean`、`error?: string | null`、`onRetry?: () => void` props
- [x] 2.2 Section 内部：`loading` 为 true 时渲染 `<LoadingDots>` 居中；`error` 非空时渲染错误文字 + MUI `Button`（Retry）；否则渲染 children
- [x] 2.3 移除各图表区块内部的 `? ... : <Typography>No X data</Typography>` 三元判断，改为在 Section 层统一处理

## 3. EmptyGuide 组件 + 空状态引导文案

- [x] 3.1 在 EvaluationPanel.tsx 内定义 `EmptyGuide({title, hint, actionLabel?, onAction?})` 组件，渲染一句话描述 + 操作提示 + 可选按钮
- [x] 3.2 为 6 个 Section 配置各自的 EmptyGuide 文案：
  - Overview KPI: "System-wide performance metrics" / "Run Arena to start generating data" / "Go to Arena"
  - Model Radar: "Multi-dimensional model comparison" / "Run Arena and make decisions to populate leaderboard" / "Go to Arena"
  - Voting Heatmap: "Voting patterns between models" / "Run Arena with 2+ models to generate cross-voting data" / "Go to Arena"
  - Performance Trend: "Model latency, cost, and success trends over time" / "Run Arena multiple times to see trends emerge" / "Go to Arena"
  - Cost & Latency: "Per-model operational metrics" / "Run Arena to collect latency and cost data" / "Go to Arena"
  - Counterfactual: "Compare adopted vs missed returns" / "Counterfactual data is generated automatically after decisions age 7+ days" / 无按钮
- [x] 3.3 在 Section children 中判断 `data 为空/零值` 时渲染 EmptyGuide，否则渲染图表

## 4. onNavigate prop + IndexAgentPage 集成

- [x] 4.1 给 EvaluationPanel 添加 `onNavigate?: (tabIndex: number) => void` prop
- [x] 4.2 IndexAgentPage 传入 `onNavigate={setActiveTab}` 给 EvaluationPanel
- [x] 4.3 EmptyGuide 的 "Go to Arena" 按钮调用 `onNavigate(0)` 切换到 Arena tab

## 5. 全局 Refresh 按钮

- [x] 5.1 在 KPI Cards 行右侧添加 MUI `IconButton`（Refresh icon），绑定一个 `reloadAll` 函数
- [x] 5.2 `reloadAll` 调用所有 6 个 `useAsyncData` 的 `reload()` 方法

## 6. KPI Cards 零值渲染

- [x] 6.1 移除 `const empty = !overview?.total_arena_runs; if (empty) return ...` 全页阻断逻辑
- [x] 6.2 KPI Cards 区域：overview loading 时显示 Section loading 态；overview data 存在时渲染 KPI（含 0 值）；overview 为 null 且无 error 时渲染 EmptyGuide

## 7. Voting Heatmap MUI Table 迁移

- [x] 7.1 将原生 `<table>/<thead>/<tbody>/<tr>/<td>/<th>` 替换为 MUI `Table/TableHead/TableBody/TableRow/TableCell`
- [x] 7.2 应用与 LeaderboardTable 一致的 `tableCellSx` / `tableHeadSx` 样式
- [x] 7.3 保持 heatmap 背景色逻辑（approve 绿 / reject 红 / 渐变透明度）和 MuiTooltip

## 8. 验证

- [x] 8.1 无 Arena 数据时：6 个 Section 卡片全部可见，各自显示 EmptyGuide
- [x] 8.2 有 Arena 数据但无 Counterfactual 时：前 5 个 Section 显示图表，Counterfactual 显示 EmptyGuide
- [x] 8.3 点击 EmptyGuide "Go to Arena" 按钮 → 切换到 Arena tab
- [x] 8.4 点击 Refresh 按钮 → 所有 Section 重新加载
- [x] 8.5 TypeScript 编译无新增错误（`npx tsc --noEmit`）
