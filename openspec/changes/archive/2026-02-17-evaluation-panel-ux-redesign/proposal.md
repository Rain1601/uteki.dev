## Why

EvaluationPanel 当前采用"全有或全无"的渲染策略：`total_arena_runs === 0` 时整个页面被一行静态文字 "No evaluation data yet" 替代，用户看到一个死胡同，无法理解这个 tab 提供什么能力、也不知道怎样产生数据。即使有部分数据（比如跑过 Arena 但还没产生 Counterfactual），6 个区块也是各自显示毫无引导的 "No X data" 文字。整体交互体验缺乏渐进式披露、错误可见性和上下文引导。

## What Changes

### 1. 消除全页空状态阻断
- 移除 `if (empty) return <全屏空消息>` 的二元逻辑
- 始终渲染 6 个 Section 卡片骨架，让用户一眼看到 Evaluation 的全部能力维度

### 2. 每个 Section 独立管理 loading/empty/error 状态
- 将 6 个 API 调用从 `Promise.all` 改为独立的 state + useEffect，数据到达即渲染，不互相阻塞
- 每个 Section 有三态：加载中 (skeleton/spinner) → 有数据 (图表) → 空数据 (引导卡片)
- API 失败时在对应 Section 内显示错误提示 + 重试按钮，而不是静默吞掉

### 3. 空状态引导卡片
- 每个 Section 的空状态替换为上下文引导：
  - 解释这个区块展示什么（一句话）
  - 告诉用户需要什么操作来产生数据（如 "Run Arena to generate voting data"）
  - 提供一个可点击的快捷操作（如跳转到 Arena tab）
- 设计一个统一的 `EmptyGuide` 组件复用于所有 Section

### 4. 添加全局 Refresh 按钮
- 在页面顶部（KPI Cards 旁边或上方）添加刷新按钮，用于手动重新加载所有数据

### 5. 布局和样式微调
- Voting Heatmap 从原生 `<table>` 改为 MUI `Table` 组件，与项目其他表格风格一致
- Section 组件支持独立的 loading 和 error 渲染 slot

## Capabilities

### New Capabilities
- `evaluation-panel-interaction`: Evaluation 面板的交互模式 — 独立加载、渐进渲染、空状态引导、错误恢复

### Modified Capabilities
_无。后端 5 个 endpoint 和数据结构不变。_

## Impact

- **前端文件**: `frontend/src/components/index/EvaluationPanel.tsx` — 重写交互逻辑和状态管理
- **后端**: 无变更
- **API 接口**: 无变更（5 个 GET endpoint 保持不变）
- **依赖**: 无新增依赖（继续使用 recharts + MUI）
