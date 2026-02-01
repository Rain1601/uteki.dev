# Agent Chat Migration - Technical Design

## Context

### Current State

**uteki.open (Target Platform)**:
- 基础 Chat 功能已实现（backend/uteki/domains/agent/）
- 支持 4 个 LLM 提供商（Claude, OpenAI, DeepSeek, Qwen）
- 统一的 LLM Adapter 架构
- PostgreSQL 数据库（chat_conversations, chat_messages 表）
- 流式响应（SSE）
- MUI v5 + TypeScript + React 18 前端

**uchu_trade (Source Platform)**:
- 成熟的 Chat 功能（/frontend/src/pages/ChatAgent.js, ~3300 行）
- **Deep Research 模式**完整实现（网页搜索 + 内容抓取 + LLM 分析）
- 优雅的 UI 设计（深色主题，精致的动画和交互）
- SQLite 数据库（包含历史对话数据）
- Material-UI v4 + JavaScript + React 17

### Constraints

**技术约束**:
- 必须保持 uteki.open 现有架构（DDD, Domain 隔离）
- 必须使用现有的 LLM Adapter（不能引入新的 LLM 客户端）
- 前端必须使用 TypeScript（迁移时需要类型化）
- 数据库 schema 不能破坏性变更（只能增量添加）

**业务约束**:
- 迁移过程中不能影响现有用户使用
- Research 模式可选（不强制开启）
- 必须保留所有历史对话数据

**资源约束**:
- Google Custom Search API 需要配置（每天 100 次免费额度）
- 无配置时自动降级到 DuckDuckGo（完全免费）
- 网页抓取有速率限制（避免被封禁）

### Stakeholders

- **用户**: 需要更强大的 Research 能力和更好的 UI
- **开发者**: 需要清晰的架构和可维护的代码
- **运维**: 需要可靠的迁移方案和回滚策略

---

## Goals / Non-Goals

### Goals

1. **完整迁移 Deep Research 功能**
   - 搜索引擎集成（Google/DuckDuckGo）
   - 网页内容智能提取
   - 思考过程可视化
   - 来源追溯

2. **UI/UX 完全对标原设计**
   - 深色主题（#212121 背景）
   - 空状态优化（居中大标题）
   - 模型选择器重新设计（底部固定）
   - 消息展示优化（气泡、代码高亮）

3. **数据无损迁移**
   - 所有历史对话
   - Research 特殊数据（thoughts, sources）
   - 元数据（创建时间、模型等）

4. **架构清晰可维护**
   - 模块化设计（Research 独立模块）
   - 抽象层清晰（SearchEngine, WebScraper）
   - 易于扩展（新增搜索引擎、新增提取策略）

### Non-Goals

1. **不迁移 Multi-Agent 协作模式**（uchu_trade 的另一个功能，本次不包含）
2. **不迁移策略代码生成功能**（与 Trading Domain 相关，不在此范围）
3. **不优化 Research 性能**（保持原有性能特征，优化是后续任务）
4. **不支持其他搜索引擎**（只支持 Google/DuckDuckGo，Bing/Baidu 等后续添加）

---

## Decisions

### Decision 1: 后端架构 - 独立 Research 模块

**选择**: 在 `backend/uteki/domains/agent/research/` 创建独立模块

**理由**:
- ✅ 符合 DDD 原则（Research 是一个子领域）
- ✅ 代码隔离（不污染现有 Chat 逻辑）
- ✅ 易于测试（可以独立测试 Research 流程）
- ✅ 易于扩展（未来可以添加更多 Research 策略）

**替代方案**:
- ❌ 直接在 service.py 中添加 Research 逻辑
  - 会导致 service.py 过于庞大（违反 SRP）
  - Research 逻辑与 Chat 逻辑耦合

**模块结构**:
```python
backend/uteki/domains/agent/research/
├── __init__.py
├── orchestrator.py      # 研究编排器（核心逻辑）
├── search_engine.py     # 搜索引擎抽象层
├── web_scraper.py       # 网页内容提取
└── schemas.py           # Research 专用 Pydantic 模型
```

---

### Decision 2: 搜索引擎抽象 - Strategy Pattern

**选择**: 使用策略模式统一 Google 和 DuckDuckGo

**理由**:
- ✅ 易于切换搜索引擎（配置驱动）
- ✅ 自动降级（Google API 失败 → DuckDuckGo）
- ✅ 统一接口（`search(query, max_results)` 返回 `List[SearchResult]`）

**实现**:
```python
class SearchEngine:
    def __init__(self, engine: str = "google", api_key: str = None):
        if engine == "google" and api_key:
            self.strategy = GoogleSearchStrategy(api_key)
        else:
            self.strategy = DuckDuckGoSearchStrategy()

    async def search(self, query: str, max_results: int) -> List[SearchResult]:
        return await self.strategy.search(query, max_results)
```

**替代方案**:
- ❌ 直接在 Orchestrator 中 if/else 判断
  - 不符合 OCP（每次添加搜索引擎都要修改 Orchestrator）
- ❌ 两个独立的 Orchestrator
  - 代码重复，维护成本高

---

### Decision 3: 网页内容提取 - 多策略 Fallback

**选择**: 优先 Trafilatura，失败则降级到 BeautifulSoup

**理由**:
- ✅ Trafilatura 是专业的内容提取库（效果更好）
- ✅ BeautifulSoup 更通用（兜底方案）
- ✅ 两层保障（提高成功率）

**实现**:
```python
class WebScraper:
    async def scrape(self, url: str) -> ScrapedContent:
        try:
            # Strategy 1: Trafilatura (智能提取)
            content = trafilatura.extract(html)
            if content:
                return ScrapedContent(url=url, content=content, method="trafilatura")
        except:
            pass

        # Strategy 2: BeautifulSoup (通用提取)
        soup = BeautifulSoup(html, 'html.parser')
        content = soup.get_text()
        return ScrapedContent(url=url, content=content, method="beautifulsoup")
```

**替代方案**:
- ❌ 只用 Trafilatura
  - 某些网站可能失败（无降级方案）
- ❌ 只用 BeautifulSoup
  - 提取效果不如 Trafilatura（噪音多）

---

### Decision 4: 流式事件协议 - 沿用 uchu_trade 设计

**选择**: 使用 8 种 SSE 事件类型

**理由**:
- ✅ 经过实战验证（uchu_trade 已使用）
- ✅ 粒度适中（既详细又不过度）
- ✅ 前端可以精确控制 UI 状态

**事件类型**:
```typescript
type ResearchEvent =
  | { type: 'research_start', data: { query: string, timestamp: string } }
  | { type: 'thought', data: { content: string } }
  | { type: 'status', data: { message: string } }
  | { type: 'plan_created', data: { subtasks: string[] } }
  | { type: 'sources_update', data: { count: number, sources: Source[] } }
  | { type: 'sources_complete', data: { total: number, urls: SourceUrl[] } }
  | { type: 'source_read', data: { title: string } }
  | { type: 'content_chunk', data: { chunk: string } }
  | { type: 'research_complete', data: {} }
  | { type: 'error', data: { message: string } };
```

**替代方案**:
- ❌ 只用 3 种事件（start, chunk, end）
  - 前端无法展示详细进度
- ❌ 用 WebSocket
  - 对于单向流（服务器 → 客户端）SSE 更简单

---

### Decision 5: 数据库 Schema - JSONB 扩展字段

**选择**: 在 `chat_messages` 表添加 `research_data JSONB` 字段

**理由**:
- ✅ 向后兼容（现有消息不受影响）
- ✅ 灵活存储（Research 数据结构复杂）
- ✅ PostgreSQL 原生支持 JSONB 查询

**Schema**:
```sql
ALTER TABLE agent.chat_messages
ADD COLUMN research_data JSONB;

-- 示例数据
{
  "thoughts": ["思考1", "思考2"],
  "sources": [{"domain": "example.com", "count": 5}],
  "sourceUrls": [
    {"title": "...", "url": "...", "snippet": "...", "source": "..."}
  ],
  "query_decomposition": ["子任务1", "子任务2"],
  "search_duration_ms": 2500,
  "scrape_duration_ms": 8000,
  "analysis_duration_ms": 15000
}
```

**替代方案**:
- ❌ 创建独立的 `research_sessions` 表
  - 过度设计（Research 数据与消息强绑定）
  - 需要额外的 JOIN 查询
- ❌ 多个独立字段（thoughts TEXT[], sources JSONB, ...）
  - Schema 变更复杂
  - 不够灵活

---

### Decision 6: 前端架构 - 完全重写 AgentChatPage

**选择**: 不增量修改，而是基于 uchu_trade 的 ChatAgent.js 重写

**理由**:
- ✅ 原设计已验证（用户体验好）
- ✅ 代码组织清晰（uchu_trade 经过多次重构）
- ✅ 避免技术债（当前代码过于简单，不适合增量添加复杂功能）

**迁移策略**:
1. 保留 uchu_trade 的组件结构
2. 转换为 TypeScript（添加类型定义）
3. 升级到 MUI v5（API 有变化）
4. 适配 React 18（Hooks 优化）

**替代方案**:
- ❌ 增量添加 Research 功能
  - 代码混乱（新旧代码风格不一致）
  - 难以保持原有的 UX 体验

---

### Decision 7: 组件迁移 - TypeScript 化 + 独立文件

**选择**: 将 uchu_trade 的内联组件提取为独立文件

**理由**:
- ✅ 符合 React 最佳实践（组件独立）
- ✅ 易于测试（可以单独测试组件）
- ✅ 易于复用（其他页面也可以使用）

**组件清单**:
```
frontend/src/components/chat/
├── ThoughtProcessCard.tsx      # 思考过程卡片
├── ResearchStatusCard.tsx      # 研究状态卡片
├── SourcesList.tsx             # 来源列表
├── EnhancedMessage.tsx         # 增强消息（支持 Markdown, 代码高亮）
├── TypingIndicator.tsx         # 打字指示器
└── ModelSelector.tsx           # 模型选择器（底部固定图标）
```

**类型定义**:
```typescript
// ThoughtProcessCard.tsx
interface ThoughtProcessCardProps {
  thoughts: string[];
  onExpand?: () => void;
}

// SourcesList.tsx
interface Source {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface SourcesListProps {
  sources: Source[];
  maxDisplay?: number;
}
```

---

### Decision 8: 样式迁移 - Material-UI v4 → v5

**选择**: 使用 MUI v5 的 `sx` prop + `makeStyles` 混合方案

**理由**:
- ✅ `sx` prop 更简洁（适合小范围样式）
- ✅ `makeStyles` 适合复杂样式（如 uchu_trade 的动画）
- ✅ 兼容性好（不需要大规模重构）

**示例**:
```typescript
// 使用 makeStyles（复杂样式）
const useStyles = makeStyles((theme) => ({
  container: {
    height: '100vh',
    backgroundColor: '#212121',
    animation: '$slideDown 0.5s ease',
  },
  '@keyframes slideDown': {
    '0%': { transform: 'translateY(-100px)', opacity: 0 },
    '100%': { transform: 'translateY(0)', opacity: 1 },
  },
}));

// 使用 sx prop（简单样式）
<Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'rgba(255,255,255,0.04)' }}>
```

**替代方案**:
- ❌ 全部用 styled-components
  - 与 MUI 集成不够紧密
- ❌ 全部用内联样式
  - 无法使用伪类、动画

---

## Risks / Trade-offs

### Risk 1: Google API 配额限制

**风险**: Google Custom Search API 每天只有 100 次免费额度

**影响**: 高频使用时可能超限

**缓解措施**:
- ✅ 自动降级到 DuckDuckGo（无额度限制）
- ✅ 配置优先级（.env 中配置 DEFAULT_SEARCH_ENGINE）
- ✅ 前端提示（告知用户当前使用的搜索引擎）
- ✅ 未来可添加缓存层（相同查询复用结果）

---

### Risk 2: 网页抓取被阻止

**风险**: 部分网站可能检测爬虫并返回 403/429

**影响**: 无法抓取内容，Research 质量下降

**缓解措施**:
- ✅ 设置真实的 User-Agent
- ✅ 超时控制（10秒超时，避免长时间等待）
- ✅ 错误处理（抓取失败不中断整个流程）
- ✅ 降级策略（只用搜索结果的 snippet）

---

### Risk 3: Research 耗时过长

**风险**: 完整 Research 流程 15-40秒，用户可能不耐烦

**影响**: 用户体验下降

**缓解措施**:
- ✅ 流式返回（实时展示进度）
- ✅ 可中断（用户可以随时取消）
- ✅ 进度可视化（ResearchStatusCard 显示当前阶段）
- ✅ 思考过程展示（让用户知道系统在工作）

**Trade-off**: 更快的 Research（减少抓取页面）vs 更高质量的结果（抓取更多页面）
- **选择**: 默认抓取 10 个页面（平衡质量和速度）
- **可配置**: 用户可以在设置中调整

---

### Risk 4: 数据迁移失败

**风险**: SQLite → PostgreSQL 迁移过程中数据损坏

**影响**: 用户丢失历史对话

**缓解措施**:
- ✅ 先备份 SQLite 数据库
- ✅ 迁移脚本支持试运行（--dry-run 模式）
- ✅ 迁移后验证（对比记录数、抽样检查）
- ✅ 保留 SQLite 文件（迁移后不删除）

---

### Risk 5: TypeScript 迁移引入 Bug

**风险**: JavaScript → TypeScript 转换时可能引入类型错误

**影响**: 前端功能异常

**缓解措施**:
- ✅ 渐进式迁移（先迁移核心组件，再迁移辅助组件）
- ✅ 严格类型检查（tsconfig 启用 strict 模式）
- ✅ 充分测试（每个组件都要测试）
- ✅ 保留原 uchu_trade 代码作为参考

---

## Migration Plan

### Phase 1: 后端基础 (Week 1)

**任务**:
1. 创建 `research/` 模块
2. 实现 `SearchEngine`（Google + DuckDuckGo）
3. 实现 `WebScraper`（Trafilatura + BeautifulSoup）
4. 实现 `DeepResearchOrchestrator`
5. 添加 `/api/research/stream` 端点

**验证**:
- 单元测试覆盖率 > 80%
- 手动测试 Research 流程（Postman/curl）

---

### Phase 2: 数据库迁移 (Week 1-2)

**任务**:
1. 添加 `research_data JSONB` 字段
2. 编写迁移脚本（SQLite → PostgreSQL）
3. 迁移测试（使用 uchu_trade 的 SQLite 备份）

**脚本**:
```python
# scripts/migrate_chat_history.py
async def migrate():
    # 1. 连接源数据库（SQLite）
    # 2. 连接目标数据库（PostgreSQL）
    # 3. 批量迁移 conversations
    # 4. 批量迁移 messages
    # 5. 验证数据完整性
```

**验证**:
- 记录数一致
- 抽样检查数据内容
- Research 数据完整性

---

### Phase 3: 前端组件 (Week 2)

**任务**:
1. 创建独立组件（ThoughtProcessCard, SourcesList 等）
2. 转换为 TypeScript
3. 升级到 MUI v5
4. 单元测试

**验证**:
- Storybook 展示所有组件
- Jest 测试覆盖率 > 70%

---

### Phase 4: 完整集成 (Week 2-3)

**任务**:
1. 重写 AgentChatPage.tsx
2. 集成 Research 功能
3. 集成新 UI 设计
4. 端到端测试

**验证**:
- 手动测试所有功能
- 性能测试（Research 耗时）
- 浏览器兼容性测试

---

### Phase 5: 上线 (Week 3)

**任务**:
1. 配置生产环境（.env）
2. 部署后端
3. 部署前端
4. 监控

**Rollback 策略**:
- 如果出现严重 Bug，回滚到上一版本
- 数据迁移不可回滚（已在 Phase 2 备份）

---

## Open Questions

### Q1: 是否需要支持多语言搜索？

**当前**: 只支持英文查询（region=us-en）

**问题**: 中文用户可能搜索中文内容

**选项**:
- A. 保持英文（简化实现）
- B. 根据用户语言自动切换 region
- C. 让用户手动选择 region

**建议**: 先实现 A，后续根据用户反馈决定

---

### Q2: Research 数据是否需要缓存？

**当前**: 每次查询都重新搜索

**问题**: 相同查询重复搜索浪费资源

**选项**:
- A. 不缓存（简化实现）
- B. Redis 缓存（TTL 1 小时）
- C. PostgreSQL 缓存表

**建议**: 先实现 A，观察实际使用情况再决定

---

### Q3: 是否需要支持导出 Research 报告？

**当前**: Research 结果只在对话中展示

**问题**: 用户可能想保存或分享 Research 报告

**选项**:
- A. 不支持导出
- B. 导出为 Markdown 文件
- C. 导出为 PDF

**建议**: Phase 1 不实现，后续根据需求添加

---

## Summary

这是一次**低风险、高价值**的迁移：

- ✅ 复用经过验证的设计（uchu_trade）
- ✅ 架构清晰（Research 独立模块）
- ✅ 渐进式迁移（分阶段验证）
- ✅ 有回滚策略（数据备份 + 版本回滚）

预计 **3 周**完成全部迁移，届时 uteki.open 将拥有业界领先的 Deep Research 能力。
