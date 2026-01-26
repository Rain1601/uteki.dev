# Admin Domain Specification（管理域规格说明）

**Domain**: 配置与系统管理
**Owner**: Admin Module
**Last Updated**: 2026-01-26

---

## ADDED Requirements（新增需求）

### Requirement: API密钥管理

系统应当提供交易所API密钥的安全存储和管理，支持静态加密。

#### Scenario: 用户添加新API密钥
- **WHEN** 用户输入OKX的API密钥、密钥和密码短语
- **THEN** 系统使用AES-256加密凭证
- **THEN** 系统将加密凭证存储在PostgreSQL中
- **THEN** 系统显示掩码密钥（前8个+后4个字符可见）

#### Scenario: 用户测试API密钥连接
- **WHEN** 用户点击API密钥的"测试连接"
- **THEN** 系统向交易所API发起认证请求
- **THEN** 系统显示连接状态（成功/失败）
- **THEN** 系统显示API权限（只读/交易启用）

#### Scenario: 用户删除API密钥
- **WHEN** 用户确认删除API密钥
- **THEN** 系统从数据库中移除加密凭证
- **THEN** 系统停止所有使用该密钥的活跃策略
- **THEN** 系统记录删除事件用于审计

#### Scenario: API密钥配置无效
- **WHEN** 用户输入格式错误的API密钥
- **THEN** 系统在存储前验证密钥格式
- **THEN** 系统显示具体验证错误
- **THEN** 系统阻止保存无效凭证

---

### Requirement: LLM模型配置

系统应当支持多个LLM提供商（OpenAI、Claude、DeepSeek、Qwen、本地），每个模型独立配置。

#### Scenario: 用户配置OpenAI模型
- **WHEN** 用户输入OpenAI API密钥并选择模型（gpt-4、gpt-3.5-turbo）
- **THEN** 系统通过测试请求验证API密钥
- **THEN** 系统存储加密的API密钥
- **THEN** 系统启用OpenAI作为可用LLM提供商

#### Scenario: 用户配置Claude模型
- **WHEN** 用户输入Anthropic API密钥并选择Claude模型
- **THEN** 系统验证API密钥
- **THEN** 系统存储加密的API密钥
- **THEN** 系统启用Claude作为可用LLM提供商

#### Scenario: 用户配置DeepSeek模型
- **WHEN** 用户输入DeepSeek API密钥并选择模型（deepseek-chat、deepseek-coder）
- **THEN** 系统通过测试请求验证API密钥
- **THEN** 系统存储加密的API密钥
- **THEN** 系统配置DeepSeek基础URL
- **THEN** 系统启用DeepSeek作为可用LLM提供商
- **THEN** 系统显示DeepSeek定价信息（更低成本）

#### Scenario: 用户配置Qwen模型
- **WHEN** 用户输入阿里云DashScope API密钥并选择Qwen模型
- **THEN** 系统通过DashScope API验证密钥
- **THEN** 系统存储加密的API密钥
- **THEN** 系统初始化dashscope SDK客户端
- **THEN** 系统获取可用Qwen模型列表
- **THEN** 系统启用Qwen作为可用LLM提供商
- **THEN** 系统显示Qwen区域选项（中国大陆/国际）

#### Scenario: 用户配置本地LLM（Ollama）
- **WHEN** 用户启用本地LLM并输入基础URL
- **THEN** 系统测试到Ollama端点的连接
- **THEN** 系统获取可用模型列表
- **THEN** 系统启用本地LLM作为备用提供商

#### Scenario: 用户设置默认LLM模型
- **WHEN** 用户从已配置提供商中选择默认模型
- **THEN** 系统更新全局配置
- **THEN** 系统对所有新Agent任务使用选定模型
- **THEN** 现有Agent任务继续使用其分配的模型

#### Scenario: LLM API密钥无效
- **WHEN** 用户输入无效的LLM API密钥
- **THEN** 系统从提供商返回验证错误
- **THEN** 系统显示具体错误消息
- **THEN** 系统阻止保存无效配置

---

### Requirement: 使用量监控

系统应当跟踪并显示LLM API使用情况，包括成本估算和速率限制。

#### Scenario: 用户查看当月使用量
- **WHEN** 用户打开管理仪表板
- **THEN** 系统按提供商显示总API调用次数
- **THEN** 系统显示预估成本（美元）
- **THEN** 系统显示按Agent类型的使用量分解
- **THEN** 系统显示速率限制状态

#### Scenario: 用户设置使用限额
- **WHEN** 用户配置月度消费限额
- **THEN** 系统在配置中存储限额
- **THEN** 系统跟踪累计消费
- **THEN** 系统在达到限额80%时发送警告
- **THEN** 系统在达到限额100%时阻止新API调用

#### Scenario: 超过速率限制
- **WHEN** 系统检测到LLM提供商的速率限制
- **THEN** 系统将待处理请求加入队列
- **THEN** 系统实施指数退避
- **THEN** 系统在冷却期后重试
- **THEN** 系统记录速率限制事件

#### Scenario: 用户导出使用报告
- **WHEN** 用户请求日期范围的使用量导出
- **THEN** 系统生成包含所有API调用的CSV
- **THEN** CSV包含时间戳、模型、令牌数、成本
- **THEN** 系统下载报告文件

---

### Requirement: 交易所配置

系统应当支持多个交易所连接，并支持演示/生产模式切换。

#### Scenario: 用户配置OKX交易所
- **WHEN** 用户添加OKX API凭证
- **THEN** 系统通过测试调用验证凭证
- **THEN** 系统存储交易所连接详情
- **THEN** 系统默认启用演示模式

#### Scenario: 用户切换到生产交易
- **WHEN** 用户禁用交易所的演示模式
- **THEN** 系统显示关于真实交易的警告
- **THEN** 系统需要明确确认
- **THEN** 系统切换到主网API端点
- **THEN** 系统记录模式更改事件

#### Scenario: 用户配置币安交易所
- **WHEN** 用户添加币安API凭证
- **THEN** 系统验证凭证
- **THEN** 系统检测测试网vs主网
- **THEN** 系统存储交易所配置

#### Scenario: 用户配置雪盈证券（Interactive Brokers）
- **WHEN** 用户添加雪盈证券API凭证（账户ID、密钥）
- **THEN** 系统通过TWS/IB Gateway验证连接
- **THEN** 系统测试账户权限（股票、期权、期货）
- **THEN** 系统存储交易所配置
- **THEN** 系统检测纸交易（Paper Trading）vs真实账户
- **THEN** 系统显示账户余额和可交易产品

#### Scenario: 雪盈证券特殊配置
- **WHEN** 用户配置雪盈证券高级选项
- **THEN** 系统允许配置TWS连接端口（7496/7497）
- **THEN** 系统允许配置客户端ID
- **THEN** 系统允许选择主账户或子账户
- **THEN** 系统配置市场数据订阅类型
- **THEN** 系统存储雪盈特有的配置参数

#### Scenario: 配置多个交易所
- **WHEN** 用户同时配置了OKX、币安和雪盈证券
- **THEN** 系统允许选择默认交易所
- **THEN** 系统支持同时在多个交易所上交易
- **THEN** 系统分别跟踪每个交易所的订单
- **THEN** 系统识别交易所特定功能（加密货币 vs 股票）

---

### Requirement: 配置文件管理

系统应当支持多个用户配置文件，每个配置文件有独立的配置和数据。

#### Scenario: 用户创建新配置文件
- **WHEN** 用户创建配置文件并命名（如"生产"、"演示"）
- **THEN** 系统创建独立的配置文件记录
- **THEN** 系统初始化该配置文件的空配置
- **THEN** 系统在选择器下拉菜单中显示配置文件

#### Scenario: 用户切换活动配置文件
- **WHEN** 用户从下拉菜单选择不同的配置文件
- **THEN** 系统停止当前配置文件中的所有运行策略
- **THEN** 系统显示确认对话框
- **THEN** 系统切换到选定配置文件
- **THEN** 系统加载配置文件特定数据

#### Scenario: 用户删除配置文件
- **WHEN** 用户确认删除配置文件
- **THEN** 系统验证没有活跃策略在运行
- **THEN** 系统归档配置文件数据
- **THEN** 系统从活跃列表中移除配置文件
- **THEN** 系统阻止删除最后剩余的配置文件

#### Scenario: 配置文件隔离验证
- **WHEN** 用户配置了多个配置文件
- **THEN** 每个配置文件有独立的API密钥
- **THEN** 每个配置文件有独立的交易历史
- **THEN** 每个配置文件有独立的策略实例
- **THEN** 配置文件数据永不混合

---

### Requirement: 系统设置

系统应当提供全局系统配置选项。

#### Scenario: 用户配置通知设置
- **WHEN** 用户启用邮件通知
- **THEN** 系统验证SMTP配置
- **THEN** 系统发送测试通知
- **THEN** 系统存储通知偏好

#### Scenario: 用户配置数据库备份
- **WHEN** 用户启用自动备份
- **THEN** 系统安排每日备份任务
- **THEN** 系统在配置位置存储备份
- **THEN** 系统按保留策略保留备份

#### Scenario: 用户配置日志级别
- **WHEN** 用户设置日志级别（DEBUG、INFO、WARNING、ERROR）
- **THEN** 系统更新日志配置
- **THEN** 系统对所有模块应用新级别
- **THEN** 系统在重启后保持设置

#### Scenario: 用户查看系统健康状态
- **WHEN** 用户打开系统健康仪表板
- **THEN** 系统显示数据库连接状态
- **THEN** 系统显示Redis连接状态
- **THEN** 系统显示ClickHouse连接状态
- **THEN** 系统显示Qdrant连接状态
- **THEN** 系统显示内存和CPU使用率

---

### Requirement: 安全与审计日志

系统应当记录所有管理操作用于安全审计。

#### Scenario: API密钥创建被记录
- **WHEN** 用户创建新API密钥
- **THEN** 系统记录事件及时间戳
- **THEN** 系统记录用户标识（配置文件）
- **THEN** 系统记录掩码密钥详情
- **THEN** 系统在审计表中存储日志

#### Scenario: 配置更改被记录
- **WHEN** 用户修改系统配置
- **THEN** 系统记录旧值
- **THEN** 系统记录新值
- **THEN** 系统记录更改时间戳
- **THEN** 系统标识做出更改的用户

#### Scenario: 用户查看审计日志
- **WHEN** 用户打开审计日志页面
- **THEN** 系统显示按时间顺序的事件
- **THEN** 系统允许按事件类型过滤
- **THEN** 系统允许按日期范围过滤
- **THEN** 系统支持导出审计日志

#### Scenario: 认证尝试失败
- **WHEN** 使用无效的API密钥
- **THEN** 系统记录失败尝试
- **THEN** 系统增加失败计数器
- **THEN** 系统在超过阈值后实施速率限制
- **THEN** 系统发送安全警报

---

### Requirement: 数据导入/导出

系统应当支持导入和导出配置数据。

#### Scenario: 用户导出配置
- **WHEN** 用户点击"导出配置"
- **THEN** 系统生成包含所有设置的JSON
- **THEN** 系统排除敏感的API密钥
- **THEN** 系统包含策略、配置文件、偏好
- **THEN** 系统下载导出文件

#### Scenario: 用户导入配置
- **WHEN** 用户上传配置JSON文件
- **THEN** 系统验证文件结构
- **THEN** 系统显示更改预览
- **THEN** 用户确认导入操作
- **THEN** 系统根据用户选择合并或覆盖

#### Scenario: 导入验证失败
- **WHEN** 用户上传无效配置文件
- **THEN** 系统验证JSON模式
- **THEN** 系统显示具体验证错误
- **THEN** 系统阻止导入损坏数据

#### Scenario: 部分配置导入
- **WHEN** 用户导入包含新配置文件的配置
- **THEN** 系统允许选择要导入的项目
- **THEN** 系统预览与现有数据的冲突
- **THEN** 系统仅导入选定项目

---

### Requirement: 数据源配置

系统应当支持外部数据源配置，包括Financial Modeling Prep（FMP）等市场数据提供商。

#### Scenario: 用户配置FMP数据源
- **WHEN** 用户输入Financial Modeling Prep API密钥
- **THEN** 系统通过测试请求验证API密钥
- **THEN** 系统检测API计划类型（免费/付费）
- **THEN** 系统显示可用数据范围和速率限制
- **THEN** 系统存储加密的API密钥
- **THEN** 系统启用FMP数据源供Agent使用

#### Scenario: FMP数据源测试连接
- **WHEN** 用户点击"测试FMP连接"
- **THEN** 系统调用FMP API获取示例数据
- **THEN** 系统验证响应格式
- **THEN** 系统显示连接状态（成功/失败）
- **THEN** 系统显示API配额信息
- **THEN** 系统记录测试结果

#### Scenario: 用户配置数据源优先级
- **WHEN** 用户有多个数据源（FMP、交易所API）
- **THEN** 系统允许设置数据获取优先级
- **THEN** 系统在主数据源失败时使用备用源
- **THEN** 系统记录数据源切换事件
- **THEN** 系统显示各数据源使用统计

#### Scenario: FMP速率限制监控
- **WHEN** 系统使用FMP API
- **THEN** 系统跟踪API调用计数
- **THEN** 系统在接近速率限制时发送警告
- **THEN** 系统实施请求队列防止超限
- **THEN** 系统在配额重置时恢复正常请求

#### Scenario: 用户查看数据源使用报告
- **WHEN** 用户打开数据源仪表板
- **THEN** 系统显示各数据源的调用次数
- **THEN** 系统显示数据获取成功率
- **THEN** 系统显示平均响应时间
- **THEN** 系统显示成本估算（如适用）
- **THEN** 系统支持按日期范围筛选

---

### Requirement: 功能开关

系统应当提供功能标志以启用/禁用功能。

#### Scenario: 用户禁用AI交易
- **WHEN** 用户将"启用Agent交易"切换为关闭
- **THEN** 系统停止所有Agent发起的交易
- **THEN** 系统仅允许手动交易
- **THEN** 系统持久化设置

#### Scenario: 用户启用新闻监控
- **WHEN** 用户将"启用新闻监控"切换为开启
- **THEN** 系统启动新闻收集调度器
- **THEN** 系统开始存储新闻文章
- **THEN** 系统使新闻对Agent可用

#### Scenario: 用户禁用ClickHouse分析
- **WHEN** 用户将"启用ClickHouse"切换为关闭
- **THEN** 系统回退到PostgreSQL进行查询
- **THEN** 系统显示关于性能降低的警告
- **THEN** 系统禁用ClickHouse连接

#### Scenario: 功能依赖性
- **WHEN** 用户尝试启用Agent交易
- **THEN** 系统验证LLM提供商已配置
- **THEN** 系统验证至少配置了一个交易所
- **THEN** 系统在依赖项缺失时阻止启用

---

## MODIFIED Requirements（修改的需求）

_无 - 这是新增域_

---

## REMOVED Requirements（移除的需求）

_无 - 这是新增域_
