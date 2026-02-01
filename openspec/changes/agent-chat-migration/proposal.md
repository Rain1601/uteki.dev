# Agent Chat Migration Proposal

## Why

uchu_trade 的 Agent Chat 功能是整个平台的核心交互界面，承载了：
- 用户与AI的对话交互
- Deep Research 深度研究模式（网页搜索 + 内容抓取 + 综合分析）
- Multi-Agent 协作模式
- 多模型切换（Claude/OpenAI/DeepSeek/Qwen/Gemini）
- 对话历史管理

当前 uteki.open 的 Chat 功能是从零实现的基础版本，缺少原项目的核心能力（特别是 Research 模式）和优雅的 UI 设计。**迁移的目标**是将经过实战验证的完整功能和用户体验带到新平台，而不是重新造轮子。

## What Changes

### 1. UI/UX 完全迁移

**从当前状态**：
- 简单的左侧栏 + 对话区布局
- 悬停展开的模型选择器（5个模型图标）
- 基础的消息展示

**迁移到原设计**：
- ✨ 优雅的空状态：居中大标题 "What do you want to know today?"
- 🎨 深色主题 (#212121 背景，精致的阴影和毛玻璃效果)
- 🔘 底部固定的模型选择器（5个模型图标水平排列）
- 🔍 Research 模式按钮（左下角，带搜索图标）
- 📜 右上角：历史记录 + 新对话按钮
- 💬 优雅的消息气泡和排版

### 2. Deep Research 模式完整实现

**核心工作流**：
```
用户输入查询
  ↓
LLM 分解为子任务 (思考过程可视化)
  ↓
搜索引擎查找来源 (Google/DuckDuckGo, 实时进度)
  ↓
Web Scraper 抓取内容 (显示抓取进度)
  ↓
LLM 综合分析 (流式返回结果)
  ↓
展示结果 + 来源列表 + 思考过程
```

**特点**：
- 🧠 思考过程可视化（ThoughtProcessCard）
- 📊 实时状态更新（ResearchStatusCard）
- 🔗 来源追溯（SourcesList - 显示所有抓取的URL）
- 🌐 支持多个搜索引擎（Google Custom Search API / DuckDuckGo）
- ⚡ SSE 流式事件（8种事件类型）

### 3. 数据迁移

**从 uchu_trade SQLite**：
- 约 XX 条历史对话
- 对话元数据（标题、创建时间、模型等）
- Research 模式的特殊数据（思考过程、来源列表）

**迁移到 uteki.open PostgreSQL**：
- `agent.chat_conversations` 表
- `agent.chat_messages` 表（支持 research 扩展字段）

### 4. 后端架构迁移

**迁移组件**：
- `DeepResearchOrchestrator` - 研究编排器
- `SearchEngine` - 搜索引擎抽象层（支持 Google/DuckDuckGo）
- `WebScraper` - 网页内容抓取
- `/api/research/stream` - Research 流式 API

**新增依赖**：
- `duckduckgo-search` - DuckDuckGo 搜索SDK
- `beautifulsoup4` / `trafilatura` - 网页内容提取
- `httpx` - 异步 HTTP 客户端

### 5. 前端组件迁移

**从 uchu_trade 迁移**：
- `ThoughtProcessCard.jsx` - 思考过程卡片
- `ResearchStatusCard.jsx` - 研究状态卡片
- `SourcesList.jsx` - 来源列表
- `EnhancedMessage.jsx` - 增强消息组件
- `TypingIndicator.jsx` - 打字指示器

**转换为 TypeScript + React 18**：
- 类型定义完善
- Hooks 优化
- MUI v5 适配

## Capabilities

### New Capabilities

- `deep-research-mode`: Deep Research 深度研究模式（网页搜索、内容抓取、综合分析）
  - 子任务分解
  - 多源搜索（Google/DuckDuckGo）
  - 网页智能抓取
  - 思考过程可视化
  - 来源追溯

- `chat-ui-redesign`: Chat 界面完全重新设计（迁移原 uchu_trade 设计）
  - 空状态优化（居中大标题）
  - 深色主题精致化
  - 模型选择器重新设计（底部固定图标）
  - 消息展示优化（气泡、代码高亮、Markdown）

- `conversation-history-migration`: 对话历史数据迁移
  - SQLite → PostgreSQL 批量迁移
  - Research 特殊数据保留
  - 元数据映射

- `search-engine-abstraction`: 搜索引擎抽象层
  - Google Custom Search API 集成
  - DuckDuckGo 免费搜索
  - 自动降级策略

- `web-content-extraction`: 智能网页内容提取
  - 超时控制
  - 内容长度限制
  - 多种提取策略（Readability / Trafilatura）

### Modified Capabilities

- `chat-streaming`: 流式响应增强
  - 新增 Research 事件类型（8种）
  - 进度追踪优化
  - 错误处理增强

- `multi-model-support`: 多模型支持增强
  - UI 从悬停展开改为底部固定图标
  - 品牌色保留（Claude橙、OpenAI青、DeepSeek蓝、Qwen紫、Gemini彩色）

## Impact

### 代码影响范围

**后端 (Python)**:
```
backend/uteki/domains/agent/
├── research/                  # 新增
│   ├── orchestrator.py       # 研究编排器
│   ├── search_engine.py      # 搜索引擎
│   └── web_scraper.py        # 网页抓取
├── api.py                     # 新增 /research/stream
├── service.py                 # 扩展 research 支持
└── schemas.py                 # 新增 Research 相关 schema
```

**前端 (TypeScript)**:
```
frontend/src/
├── pages/
│   └── AgentChatPage.tsx     # 完全重写（迁移原设计）
├── components/chat/           # 新增
│   ├── ThoughtProcessCard.tsx
│   ├── ResearchStatusCard.tsx
│   ├── SourcesList.tsx
│   ├── EnhancedMessage.tsx
│   └── TypingIndicator.tsx
└── styles/
    └── chat-theme.ts          # 深色主题定义
```

### 数据库影响

**新增字段**：
```sql
-- chat_messages 表扩展
ALTER TABLE agent.chat_messages
ADD COLUMN research_data JSONB;  -- 存储 research 相关数据

-- 结构示例:
{
  "thoughts": ["思考1", "思考2"],
  "sources": [{"domain": "example.com", "count": 5}],
  "sourceUrls": [
    {"title": "...", "url": "...", "snippet": "...", "source": "..."}
  ]
}
```

### 依赖影响

**新增 Python 包**:
```toml
duckduckgo-search = "^6.3.9"
beautifulsoup4 = "^4.12.3"
trafilatura = "^1.12.2"
httpx = "^0.28.1"
```

**可选（Google Search）**:
```toml
google-api-python-client = "^2.158.0"
```

### API 影响

**新增端点**：
- `POST /api/research/stream` - Deep Research 流式API

**修改端点**：
- `POST /api/agent/chat` - 支持 research_mode 参数

### 配置影响

**新增配置项 (.env)**:
```bash
# Google Custom Search (可选)
GOOGLE_CUSTOM_SEARCH_API_KEY=
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=

# Search Engine 配置
DEFAULT_SEARCH_ENGINE=duckduckgo  # google/duckduckgo
MAX_SEARCH_RESULTS=20
MAX_SCRAPE_PAGES=10

# Web Scraper 配置
WEB_SCRAPER_TIMEOUT=10
MAX_CONTENT_LENGTH=3000
```

### 性能影响

**Research 模式资源消耗**：
- 🔍 搜索：~1-2秒（DuckDuckGo）/ ~0.5秒（Google API）
- 🌐 抓取：~5-10秒（10个网页）
- 🤖 分析：~10-30秒（取决于 LLM 和内容长度）
- **总计**：~15-40秒（完整 research 流程）

**优化措施**：
- 并发抓取网页
- 智能内容截断
- 流式返回（用户无需等待全部完成）

### 用户体验影响

**提升**：
- ✨ 更优雅的 UI（原项目验证的设计）
- 🔍 Deep Research 能力（解决复杂研究需求）
- 📊 可视化思考过程（增加透明度和信任）
- 🔗 来源追溯（可验证的信息）

**学习成本**：
- Research 按钮需要引导（首次使用提示）
- 模型选择器位置变化（从悬停变为底部固定）

### 迁移风险

**低风险**：
- UI 重新设计不影响现有数据
- 新增功能（Research）是可选的
- 后端是增量添加，不破坏现有 API

**需注意**：
- Google API 配置可选（无配置自动降级到 DuckDuckGo）
- 网页抓取可能被部分网站阻止（需要 User-Agent 配置）
- Research 模式耗时较长（需要前端加载状态优化）

---

## 预期成果

迁移完成后，uteki.open 将拥有：

1. **经过验证的用户体验** - 原项目的优雅设计直接迁移
2. **Deep Research 能力** - 解决"需要深度研究"的场景
3. **完整的对话历史** - 从 uchu_trade 无缝迁移
4. **生产就绪的功能** - 已在实际使用中打磨的代码

这是一次**低风险、高价值**的迁移，将显著提升 Agent Chat 的竞争力。
