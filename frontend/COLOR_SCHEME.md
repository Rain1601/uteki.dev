# uteki.open 配色系统（蓝色主题）

基于 uchu_trade 实际使用的蓝色配色，带编号标注方便修改。

## 核心主题色

| 编号 | 颜色       | 色值                        | 用途                             | 文件位置              |
|------|------------|-----------------------------|---------------------------------|-----------------------|
| C1   | 道奇蓝     | #6495ed                     | 主色调（按钮、标题、图标、选中） | src/theme/colors.ts   |
| C2   | 浅蓝       | #90caf9                     | 次要按钮、徽章、标题高亮         | src/theme/colors.ts   |
| C3   | 紫蓝渐变   | #667eea → #764ba2           | 部分卡片背景、装饰               | src/theme/colors.ts   |
| C4   | 深蓝灰     | #7d9bb8 / #8ca8c2           | 分析卡片、Pending状态            | src/theme/colors.ts   |
| C5   | 翠绿       | #2EE5AC                     | 成功状态、正向数据（辅助色）     | src/theme/colors.ts   |

## 背景色系

### 深色主题

| 编号 | 名称       | 色值                 | 用途           | 使用位置                    |
|------|------------|----------------------|----------------|-----------------------------|
| BG1  | 极深黑     | #0a0a0a              | 最底层背景     | background.deepest          |
| BG2  | 主背景     | #181c1f / #212121    | Body/Root      | background.primary          |
| BG3  | 次背景     | #1E1E1E              | Paper/卡片     | background.secondary        |
| BG4  | 卡片背景   | #262830              | 内容卡片       | background.tertiary         |
| BG5  | 悬浮状态   | #2e3039              | Hover效果      | background.hover            |

### 浅色主题（柔和版）

| 编号 | 名称       | 色值                 | 用途           | 使用位置                    |
|------|------------|----------------------|----------------|-----------------------------|
| BG1  | 浅灰       | #e8eaed              | 最底层背景     | background.deepest          |
| BG2  | 柔和主背景 | #f5f7f9              | Body/Root      | background.primary          |
| BG3  | 浅灰蓝     | #eef1f5              | Paper/Drawer   | background.secondary        |
| BG4  | 卡片背景   | #e8ecf1              | 内容卡片       | background.tertiary         |
| BG5  | 悬浮状态   | #d4dae2              | Hover效果      | background.hover            |

## 状态颜色

| 编号 | 名称       | 色值                 | 场景                 |
|------|------------|----------------------|----------------------|
| S1   | 成功/完成  | #4caf50 / #66bb6a    | 绿色确认、正向数据   |
| S2   | 警告       | #ff9800 / #ffc107    | 橙黄色提示           |
| S3   | 错误/失败  | #f44336 / #ef5350    | 红色警告、负向数据   |
| S4   | 信息       | #90caf9 / #64b5f6    | 蓝色信息、已完成     |
| S5   | 分析中     | #b39ddb / #ba68c8    | 紫色进度状态         |

## 交易特有配色

| 编号 | 类型 | 色值                 | 用途           |
|------|------|----------------------|----------------|
| T1   | 买入 | #1b5e20 / #4caf50    | Buy按钮、看涨  |
| T2   | 卖出 | #b71c1c / #f44336    | Sell按钮、看跌 |
| T3   | 中性 | #90caf9              | 持有建议       |

## 文字颜色

### 深色主题

| 编号 | 层级     | 色值                 | 用途           |
|------|----------|----------------------|----------------|
| TXT1 | 主文字   | #ffffff              | 标题、重要内容 |
| TXT2 | 次要文字 | #e5e7eb              | 描述文字       |
| TXT3 | 静音文字 | #8b8d94              | 辅助信息       |
| TXT4 | 禁用文字 | #6b6d74              | 不可用状态     |

### 浅色主题

| 编号 | 层级     | 色值                 | 用途           |
|------|----------|----------------------|----------------|
| TXT1 | 主文字   | #1a2332              | 标题、重要内容 |
| TXT2 | 次要文字 | #5b6b7f              | 描述文字       |
| TXT3 | 静音文字 | #8591a3              | 辅助信息       |
| TXT4 | 禁用文字 | #b8c1cc              | 不可用状态     |

## 按钮配色使用规则

```tsx
// C1 - 主要按钮（道奇蓝）
<Button variant="contained" color="primary">主要操作</Button>

// C2 - 次要按钮（浅蓝边框）
<Button variant="outlined" color="primary">次要操作</Button>

// S1 - 成功按钮（绿色）
<Button variant="contained" color="success">成功</Button>

// S3 - 危险按钮（红色）
<Button variant="contained" color="error">删除</Button>

// S2 - 警告按钮（橙色）
<Button variant="contained" color="warning">警告</Button>

// S4 - 信息按钮（浅蓝）
<Button variant="contained" color="info">信息</Button>

// C3 - 紫蓝渐变按钮
<Button variant="contained" sx={{
  background: theme.button.gradient.bg
}}>
  渐变特效
</Button>

// C4 - 深蓝灰按钮
<Button variant="contained" sx={{ bgcolor: theme.button.muted.bg }}>
  静音操作
</Button>
```

## 渐变效果

```tsx
// C1 - 道奇蓝渐变
background: theme.effects.gradient.primary  // #6495ed → #5578d9

// C3 - 紫蓝渐变
background: theme.effects.gradient.secondary  // #667eea → #764ba2

// C2 → C1 浅蓝到道奇蓝
background: theme.effects.gradient.light  // #90caf9 → #6495ed
```

## Sidebar 选中状态

```tsx
// 使用 C1 道奇蓝作为选中状态
sx={{
  '&.Mui-selected': {
    backgroundColor: 'rgba(100, 149, 237, 0.12)',  // C1 with opacity
    borderLeft: `3px solid ${theme.brand.primary}`,  // C1
  },
}}
```

## 如何修改配色

1. 打开 `src/theme/colors.ts`
2. 找到对应的编号（如 C1, BG2, S1 等）
3. 修改对应的色值
4. 保存后前端会自动热更新

### 示例：修改主题色 C1

```typescript
// 在 src/theme/colors.ts 中
brand: {
  primary: '#6495ed',      // C1 - 道奇蓝主色 <- 修改这里
  secondary: '#90caf9',    // C2 - 浅蓝次要色
  // ...
}
```

## 配色预览

访问 http://localhost:5173/colors 查看所有配色的实时预览。

## 主要配色文件

- **主题定义**: `src/theme/colors.ts`
- **MUI主题**: `src/theme/muiTheme.ts`
- **全局样式**: `src/index.css`
- **Tailwind配置**: `tailwind.config.js`

## 配色特点

### 深色模式
1. **深色护眼** - 深黑背景 (#0a0a0a ~ #2e3039) 减少蓝光
2. **蓝色为主** - #6495ed 道奇蓝作为品牌识别色
3. **层次分明** - 背景色渐进式分层 (BG1-BG5)
4. **状态明确** - 绿/红/橙/蓝 对应 成功/错误/警告/信息
5. **渐变丰富** - 紫蓝渐变 #667eea → #764ba2 用于装饰

### 浅色模式（柔和优化版）
1. **柔和背景** - 浅灰蓝色背景 (#f5f7f9) 替代刺眼的纯白
2. **蓝灰色调** - 文字使用蓝灰色调 (#1a2332) 降低对比度
3. **和谐过渡** - 背景、边框、阴影都使用蓝灰色系，与蓝色主题和谐
4. **视觉舒适** - 减少白色亮度，长时间使用不刺眼
5. **输入对比** - 输入框使用纯白 (#ffffff) 形成适度对比

## 与翠绿色版本的区别

| 项目     | 翠绿色版本 (旧)        | 蓝色版本 (新/实际)     |
|----------|------------------------|------------------------|
| 主色调   | #2EE5AC 翠绿           | #6495ed 道奇蓝         |
| 次要色   | #f57ad0 粉红           | #90caf9 浅蓝           |
| 渐变     | 绿色渐变               | 紫蓝渐变               |
| 成功状态 | 使用主色（翠绿）       | #4caf50 绿色（独立）   |
| 用途     | 定义中存在，实际少用   | 实际页面大量使用       |
