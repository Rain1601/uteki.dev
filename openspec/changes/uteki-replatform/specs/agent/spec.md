# Agent Domain Specification（Agent域规格说明）

**Domain**: 统一Agent框架与工具
**Owner**: Agent Module
**Last Updated**: 2026-01-26

---

## ADDED Requirements（新增需求）

### Requirement: 基础Agent框架

系统应当提供抽象BaseAgent类，所有agent实现都继承自它。

#### Scenario: 创建新agent实现
- **WHEN** 开发者创建自定义agent（如TradingAgent）
- **THEN** 开发者从BaseAgent抽象类继承
- **THEN** 开发者实现必需的抽象方法（plan、execute）
- **THEN** 开发者注册可用工具
- **THEN** agent在系统中可用

#### Scenario: Agent用LLM初始化
- **WHEN** agent被实例化
- **THEN** 系统注入配置的LLM提供商（OpenAI/Claude/本地）
- **THEN** agent接收工具注册表
- **THEN** agent初始化内存后端（Qdrant）
- **THEN** agent准备好执行任务

#### Scenario: Agent验证依赖
- **WHEN** agent启动
- **THEN** 系统验证LLM提供商已配置
- **THEN** 系统验证所需工具可用
- **THEN** 系统验证Qdrant连接
- **THEN** 系统在依赖缺失时优雅失败

---

### Requirement: Agent任务执行

系统应当遵循ReAct（Reason → Act → Observe）模式执行agent任务。

#### Scenario: Agent执行任务
- **WHEN** 用户创建任务"分析BTC市场情绪"
- **THEN** agent将任务分解为步骤（plan阶段）
- **THEN** 对于每一步，agent推理采取的行动
- **THEN** agent选择适当的工具
- **THEN** agent执行工具
- **THEN** agent观察工具结果
- **THEN** agent在内存中存储交互
- **THEN** agent继续下一步或结束

#### Scenario: Agent使用多个工具
- **WHEN** agent需要市场数据和新闻情绪
- **THEN** agent首先执行MarketDataTool
- **THEN** agent分析价格趋势
- **THEN** agent其次执行NewsSearchTool
- **THEN** agent关联新闻与价格走势
- **THEN** agent综合最终分析

#### Scenario: 工具执行失败
- **WHEN** 工具返回错误（如API速率限制）
- **THEN** agent观察错误
- **THEN** agent推理重试策略
- **THEN** agent实施指数退避
- **THEN** agent尝试替代工具（如可用）
- **THEN** agent在所有选项耗尽时记录失败

#### Scenario: Agent任务超时
- **WHEN** agent任务超过配置超时（如5分钟）
- **THEN** 系统中断agent执行
- **THEN** 系统存储部分结果
- **THEN** 系统标记任务为"timeout"
- **THEN** 系统记录超时事件

---

### Requirement: 工具系统

系统应当为agent能力提供可插拔工具接口。

#### Scenario: 工具注册元数据
- **WHEN** MarketDataTool被定义
- **THEN** 工具声明名称"get_market_data"
- **THEN** 工具为LLM提供描述
- **THEN** 工具用JSON Schema定义参数
- **THEN** 工具实现execute方法
- **THEN** 系统在工具注册表注册工具

#### Scenario: Agent调用工具
- **WHEN** agent决定使用"get_market_data"工具
- **THEN** agent提供必需参数（symbol、interval）
- **THEN** 系统根据schema验证参数
- **THEN** 系统执行工具
- **THEN** 工具返回ToolResult（成功/错误）
- **THEN** agent接收结构化结果

#### Scenario: 工具访问控制
- **WHEN** agent尝试使用OrderPlacementTool
- **THEN** 系统检查agent是否有权限
- **THEN** 系统验证用户已启用AI交易
- **THEN** 系统允许或拒绝工具执行
- **THEN** 系统记录访问尝试

#### Scenario: 自定义工具创建
- **WHEN** 用户为特定数据源创建自定义工具
- **THEN** 用户定义Tool子类
- **THEN** 用户实现execute方法
- **THEN** 用户提供工具元数据
- **THEN** 系统自动发现并注册工具
- **THEN** 所有agent都可以使用新工具

---

### Requirement: Agent内存（RAG）

系统应当使用Qdrant提供基于向量的内存以检索上下文。

#### Scenario: Agent存储交互
- **WHEN** agent完成任务步骤
- **THEN** 系统生成步骤+结果的文本嵌入
- **THEN** 系统在Qdrant集合中存储嵌入
- **THEN** 系统存储元数据（时间戳、agent类型、任务ID）
- **THEN** 内存可用于未来检索

#### Scenario: Agent检索相似记忆
- **WHEN** agent收到新任务"分析ETH"
- **THEN** agent用任务嵌入查询Qdrant
- **THEN** Qdrant返回前5个相似的历史分析
- **THEN** agent使用上下文指导当前推理
- **THEN** agent引用过去模式

#### Scenario: 内存修剪
- **WHEN** agent内存超过配置限制（如10,000条）
- **THEN** 系统识别最旧或最不相关的记忆
- **THEN** 系统移除低价值记忆
- **THEN** 系统保留最近和高相关性记忆
- **THEN** 系统记录修剪统计

#### Scenario: 多agent内存隔离
- **WHEN** TradingAgent和ResearchAgent都使用内存
- **THEN** 每个agent有独立的Qdrant集合
- **THEN** 记忆不会在agent间交叉
- **THEN** 每个agent构建专门的知识库

---

### Requirement: Agent类型

系统应当为不同任务提供专门的agent实现。

#### Scenario: TradingAgent执行交易任务
- **WHEN** 用户分配任务给TradingAgent
- **THEN** agent可访问MarketDataTool、TechnicalIndicatorTool、OrderPlacementTool
- **THEN** agent分析市场条件
- **THEN** agent可以下单（如获得权限）
- **THEN** agent监控持仓盈亏

#### Scenario: ResearchAgent进行分析
- **WHEN** 用户分配研究任务
- **THEN** agent可访问NewsSearchTool、SentimentAnalysisTool、WebScraperTool
- **THEN** agent从多个来源收集信息
- **THEN** agent综合发现
- **THEN** agent生成研究报告

#### Scenario: EvaluationAgent评估策略
- **WHEN** 用户请求策略评估
- **THEN** agent可访问BacktestTool、StatisticalAnalysisTool
- **THEN** agent运行多次回测
- **THEN** agent分析性能指标
- **THEN** agent提供建议

#### Scenario: 用户创建自定义agent
- **WHEN** 用户定义CustomAgent类
- **THEN** 用户选择要提供的工具
- **THEN** 用户实现自定义规划逻辑
- **THEN** 系统验证agent实现
- **THEN** agent可用于任务分配

---

### Requirement: Agent任务管理

系统应当管理agent任务队列、执行状态和结果。

#### Scenario: 用户创建agent任务
- **WHEN** 用户创建任务，描述"分析BTC趋势"
- **THEN** 用户选择agent类型（TradingAgent）
- **THEN** 用户设置优先级（高/正常/低）
- **THEN** 系统在PostgreSQL存储任务
- **THEN** 系统将任务加入队列
- **THEN** 任务状态为"pending"

#### Scenario: 任务分配给agent
- **WHEN** agent执行器轮询待处理任务
- **THEN** 系统获取最高优先级任务
- **THEN** 系统将任务分配给可用agent实例
- **THEN** 系统更新任务状态为"in_progress"
- **THEN** 系统记录开始时间

#### Scenario: 任务成功完成
- **WHEN** agent完成任务执行
- **THEN** agent返回AgentResult及发现
- **THEN** 系统更新任务状态为"completed"
- **THEN** 系统在数据库存储结果
- **THEN** 系统记录完成时间
- **THEN** 系统通知用户

#### Scenario: 任务失败并报错
- **WHEN** agent遇到不可恢复错误
- **THEN** agent返回AgentResult及错误详情
- **THEN** 系统更新任务状态为"failed"
- **THEN** 系统存储错误消息
- **THEN** 系统记录完整堆栈跟踪
- **THEN** 系统通知用户失败

#### Scenario: 任务失败后重试
- **WHEN** 任务因瞬态错误失败（如API超时）
- **THEN** 系统检查重试计数
- **THEN** 如低于最大重试次数（3次），系统重新加入任务队列
- **THEN** 系统实施指数退避
- **THEN** 系统延迟后重试任务

---

### Requirement: Agent SDK分层架构

系统应当区分LLM API调用层和Agent SDK执行层，提供清晰的分层架构。

#### Scenario: LLM API层纯对话调用
- **WHEN** agent需要进行简单对话
- **THEN** agent调用LLM API层的chat()方法
- **THEN** LLM层仅负责发送请求和返回响应
- **THEN** LLM层不包含Agent逻辑（如工具调用循环）
- **THEN** 响应转换为统一格式返回

#### Scenario: Agent SDK层处理ReAct循环
- **WHEN** agent需要执行带工具的任务
- **THEN** agent调用Agent SDK层的run_with_tools()方法
- **THEN** Agent SDK管理Reason→Act→Observe循环
- **THEN** Agent SDK决定何时调用工具、何时结束
- **THEN** Agent SDK返回完整的执行结果

#### Scenario: 使用OpenAI Assistants原生Agent
- **WHEN** 系统配置使用OpenAI Assistants API
- **THEN** agent使用OpenAIAssistantsSDK
- **THEN** SDK利用OpenAI原生Agent能力
- **THEN** OpenAI自动处理工具调用循环
- **THEN** 系统仅需处理工具执行回调

#### Scenario: 使用自定义ReAct引擎
- **WHEN** 系统配置使用Claude或其他模型
- **THEN** agent使用自研ReActSDK
- **THEN** SDK手动实现Reason-Act-Observe循环
- **THEN** SDK完全控制执行流程和错误处理
- **THEN** SDK支持自定义中断和恢复逻辑

#### Scenario: 业务Agent层使用SDK
- **WHEN** TradingAgent执行交易任务
- **THEN** TradingAgent准备业务上下文和系统提示词
- **THEN** TradingAgent调用Agent SDK执行
- **THEN** TradingAgent处理SDK返回的结果
- **THEN** TradingAgent执行后处理业务逻辑

---

### Requirement: LLM提供商抽象

系统应当用统一接口支持多个LLM提供商，使用官方SDK实现。

#### Scenario: Agent使用OpenAI
- **WHEN** 系统配置了OpenAI API密钥
- **THEN** agent使用OpenAILLM适配器
- **THEN** 适配器初始化openai官方SDK客户端
- **THEN** 适配器调用OpenAI Chat Completions API
- **THEN** 适配器将响应转换为统一格式
- **THEN** 适配器处理token计数和成本计算

#### Scenario: Agent使用Claude
- **WHEN** 系统配置了Anthropic API密钥
- **THEN** agent使用ClaudeLLM适配器
- **THEN** 适配器初始化anthropic官方SDK客户端
- **THEN** 适配器调用Anthropic Messages API
- **THEN** 适配器转换Claude特有的tool格式
- **THEN** 适配器跟踪使用量和成本

#### Scenario: Agent使用DeepSeek
- **WHEN** 系统配置了DeepSeek API密钥
- **THEN** agent使用DeepSeekLLM适配器
- **THEN** 适配器使用OpenAI兼容格式（DeepSeek兼容OpenAI API）
- **THEN** 适配器配置DeepSeek基础URL
- **THEN** 适配器调用DeepSeek API端点
- **THEN** 适配器按DeepSeek定价计算成本

#### Scenario: Agent使用Qwen
- **WHEN** 系统配置了Qwen（通义千问）API密钥
- **THEN** agent使用QwenLLM适配器
- **THEN** 适配器初始化dashscope SDK客户端
- **THEN** 适配器调用阿里云DashScope API
- **THEN** 适配器转换Qwen响应格式
- **THEN** 适配器处理Qwen特有的参数

#### Scenario: Agent使用本地LLM（Ollama）
- **WHEN** 系统配置了Ollama
- **THEN** agent使用LocalLLM适配器
- **THEN** 适配器通过HTTP调用Ollama API端点
- **THEN** 适配器处理流式响应
- **THEN** 无外部API成本

#### Scenario: SDK按需安装
- **WHEN** 用户只配置了OpenAI
- **THEN** 系统仅要求安装openai SDK
- **THEN** 系统不要求安装anthropic、dashscope等其他SDK
- **THEN** 用户后续可通过Poetry extras动态添加其他SDK
- **THEN** 系统启动时仅加载已安装的适配器

#### Scenario: LLM故障切换
- **WHEN** 主LLM提供商（OpenAI）不可用
- **THEN** 系统检测API故障
- **THEN** 系统尝试回退到Claude
- **THEN** 如Claude不可用，系统尝试本地LLM
- **THEN** 系统记录故障切换事件
- **THEN** 系统通知用户切换情况

#### Scenario: LLM成本跟踪
- **WHEN** agent进行LLM API调用
- **THEN** 系统记录使用的token（输入+输出）
- **THEN** 系统根据模型定价计算成本
- **THEN** 系统按用户/配置文件累计成本
- **THEN** 系统在管理仪表板显示成本

---

### Requirement: 并发控制与速率限制

系统应当支持多模型并发执行，并对每个模型实施速率限制。

#### Scenario: 不同模型并发执行
- **WHEN** 同时提交OpenAI任务和Claude任务
- **THEN** 系统在不同执行器中并发处理
- **THEN** 两个任务互不影响，独立执行
- **THEN** 系统显示各自执行进度
- **THEN** 系统分别跟踪各模型的性能指标

#### Scenario: 单模型速率限制
- **WHEN** 短时间内提交10个OpenAI任务
- **THEN** 系统检测OpenAI速率限制（3500 RPM）
- **THEN** 系统将超出限制的任务加入队列
- **THEN** 系统使用令牌桶算法控制速率
- **THEN** 系统按速率逐个执行任务
- **THEN** 系统避免触发API速率限制错误

#### Scenario: Token级别速率限制
- **WHEN** 任务预计消耗大量tokens
- **THEN** 系统在提交前估算token数量
- **THEN** 系统检查TPM限制（如90000 TPM）
- **THEN** 系统在token预算内调度任务
- **THEN** 系统等待token预算恢复后执行

#### Scenario: 任务优先级调度
- **WHEN** 队列中有高优先级和普通优先级任务
- **THEN** 系统使用优先级队列管理任务
- **THEN** 系统优先执行高优先级任务
- **THEN** 系统在并发槽位可用时立即分配
- **THEN** 普通任务等待高优先级任务完成

#### Scenario: 并发数量配置
- **WHEN** 用户配置OpenAI最大并发为5
- **THEN** 系统使用Semaphore限制并发数
- **THEN** 系统最多同时执行5个OpenAI任务
- **THEN** 第6个任务进入队列等待
- **THEN** 任务完成后立即释放槽位给等待任务

#### Scenario: 模型执行器独立管理
- **WHEN** 系统注册多个模型执行器
- **THEN** 每个模型有独立的任务队列
- **THEN** 每个模型有独立的速率限制器
- **THEN** 每个模型有独立的并发控制
- **THEN** 调度器根据任务配置分发到对应执行器

#### Scenario: 速率限制动态调整
- **WHEN** API返回速率限制错误
- **THEN** 系统识别429错误码
- **THEN** 系统动态降低请求速率
- **THEN** 系统实施指数退避
- **THEN** 系统在一段时间后逐步恢复速率

---

### Requirement: Agent流式响应

系统应当通过WebSocket向前端实时流式传输agent推理和工具执行。

#### Scenario: Agent流式传输思考过程
- **WHEN** agent执行任务
- **THEN** agent通过WebSocket发送推理步骤
- **THEN** 前端在步骤发生时显示
- **THEN** 用户看到"正在分析市场数据..."
- **THEN** 用户看到"正在获取新闻情绪..."
- **THEN** 用户看到实时进度

#### Scenario: 工具执行流式传输
- **WHEN** agent调用工具
- **THEN** 系统发送"正在执行工具：get_market_data"
- **THEN** 系统流式传输工具进度（如可用）
- **THEN** 系统发送工具结果
- **THEN** 前端用结果更新UI

#### Scenario: 流式传输中断
- **WHEN** 用户在执行期间取消任务
- **THEN** 系统向agent发送中断信号
- **THEN** agent完成当前工具执行
- **THEN** agent停止进一步步骤
- **THEN** 系统更新任务状态为"cancelled"

---

### Requirement: 内置工具

系统应当为agent提供10+个基本工具。

#### Scenario: MarketDataTool执行
- **WHEN** agent用(symbol="BTC-USDT", interval="1h")调用MarketDataTool
- **THEN** 工具从交易所或ClickHouse获取最新K线
- **THEN** 工具返回OHLCV数据
- **THEN** 工具包含元数据（时间戳、来源）

#### Scenario: TechnicalIndicatorTool执行
- **WHEN** agent用(data=klines, indicator="RSI", period=14)调用TechnicalIndicatorTool
- **THEN** 工具使用ta-lib计算RSI
- **THEN** 工具返回指标值
- **THEN** 工具包含信号解释

#### Scenario: NewsSearchTool执行
- **WHEN** agent用(query="Bitcoin", days=7)调用NewsSearchTool
- **THEN** 工具查询新闻数据库
- **THEN** 工具返回相关文章
- **THEN** 工具包含发布日期和来源

#### Scenario: SentimentAnalysisTool执行
- **WHEN** agent用(text="Bitcoin price surges")调用SentimentAnalysisTool
- **THEN** 工具进行NLP情绪分析
- **THEN** 工具返回情绪评分（-1到1）
- **THEN** 工具包含置信度

#### Scenario: BacktestTool执行
- **WHEN** agent用(strategy_config, date_range)调用BacktestTool
- **THEN** 工具从ClickHouse获取历史数据
- **THEN** 工具运行回测模拟
- **THEN** 工具返回性能指标
- **THEN** 工具包含交易日志

#### Scenario: FMPDataTool执行
- **WHEN** agent用(symbol="AAPL", data_type="profile")调用FMPDataTool
- **THEN** 工具调用Financial Modeling Prep API
- **THEN** 工具返回公司基本信息（行业、市值、描述）
- **THEN** 工具包含数据时间戳和来源

#### Scenario: FMPDataTool获取财报
- **WHEN** agent用(symbol="AAPL", data_type="financials")调用FMPDataTool
- **THEN** 工具获取最近4个季度财报
- **THEN** 工具返回营收、利润、现金流数据
- **THEN** 工具计算关键财务比率
- **THEN** 工具标注财报发布日期

#### Scenario: FMPDataTool获取估值指标
- **WHEN** agent用(symbol="AAPL", data_type="valuation")调用FMPDataTool
- **THEN** 工具获取当前估值指标
- **THEN** 工具返回PE、PB、PS、PEG等比率
- **THEN** 工具对比行业平均值
- **THEN** 工具提供估值分析建议

#### Scenario: StockScreenerTool执行
- **WHEN** agent用筛选条件调用StockScreenerTool
- **THEN** 工具根据市值、PE、增长率等条件筛选
- **THEN** 工具从FMP数据库查询符合条件的股票
- **THEN** 工具返回前20个匹配股票
- **THEN** 工具包含每个股票的关键指标

---

### Requirement: Agent编排

系统应当支持多agent协作和工作流。

#### Scenario: 顺序agent工作流
- **WHEN** 用户创建工作流：ResearchAgent → TradingAgent
- **THEN** ResearchAgent首先执行，生成市场分析
- **THEN** 系统将分析传递给TradingAgent
- **THEN** TradingAgent使用分析做出交易决策
- **THEN** 系统存储工作流执行结果

#### Scenario: 并行agent执行
- **WHEN** 用户同时运行多个agent
- **THEN** 系统生成独立agent实例
- **THEN** agent并发执行
- **THEN** 系统在所有完成时聚合结果
- **THEN** 系统提供组合输出

#### Scenario: Agent委派
- **WHEN** TradingAgent需要研究数据
- **THEN** TradingAgent创建子任务
- **THEN** 系统委派给ResearchAgent
- **THEN** TradingAgent等待结果
- **THEN** TradingAgent将结果纳入决策

---

## MODIFIED Requirements（修改的需求）

_无 - 这是新增域_

---

## REMOVED Requirements（移除的需求）

_无 - 这是新增域_
