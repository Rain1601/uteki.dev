# Data Domain Specification（数据域规格说明）

**Domain**: 多资产数据获取、存储与管理
**Owner**: Data Module
**Last Updated**: 2026-01-27

---

## ADDED Requirements（新增需求）

### Requirement: 加密货币数据采集

系统应当从多个交易所采集加密货币K线、深度、交易数据。

#### Scenario: 采集历史日K线数据
- **WHEN** 用户请求BTC-USDT最近3年的日K线
- **THEN** 系统从OKX或Binance API批量获取
- **THEN** 系统验证数据完整性（无缺失日期）
- **THEN** 系统在ClickHouse的klines表存储
- **THEN** 系统记录数据源和更新时间
- **THEN** 系统显示导入进度和完成状态

#### Scenario: 每日K线更新
- **WHEN** 每日收盘后（UTC 00:00）
- **THEN** 系统从交易所API获取最新日K线
- **THEN** 系统验证收盘价、成交量
- **THEN** 系统追加到ClickHouse
- **THEN** 系统验证时间戳连续性
- **THEN** 系统在获取失败时重试并记录

#### Scenario: 多交易对并发采集
- **WHEN** 用户配置监控50个交易对
- **THEN** 系统每日并发获取所有交易对数据
- **THEN** 系统为每个交易对独立处理
- **THEN** 系统维护采集状态
- **THEN** 系统在单个交易对失败时不影响其他
- **THEN** 系统记录采集成功率

#### Scenario: 日K线数据验证
- **WHEN** 系统采集日K线数据
- **THEN** 系统验证OHLCV合法性（open ≤ high, low ≤ close等）
- **THEN** 系统验证日期连续性
- **THEN** 系统检测异常价格跳跃（>20%单日）
- **THEN** 系统标记可疑数据供人工审查
- **THEN** 系统记录验证失败详情

---

### Requirement: 链上数据采集

系统应当采集区块链链上数据，包括交易量、地址活跃度、资金流向。

#### Scenario: 采集BTC链上指标
- **WHEN** 系统定时采集BTC链上数据
- **THEN** 系统调用区块链浏览器API（如Blockchain.com、Glassnode）
- **THEN** 系统获取活跃地址数、交易笔数、平均费用
- **THEN** 系统获取大额转账监控（鲸鱼转账）
- **THEN** 系统在ClickHouse存储每日链上指标
- **THEN** 系统计算链上指标变化趋势

#### Scenario: 采集ETH链上指标
- **WHEN** 系统采集以太坊链上数据
- **THEN** 系统获取Gas费用、燃烧量
- **THEN** 系统获取DeFi TVL（总锁仓价值）
- **THEN** 系统获取稳定币供应量变化
- **THEN** 系统存储DeFi相关指标
- **THEN** 系统提供链上数据查询API

#### Scenario: 交易所流入流出监控
- **WHEN** 系统监控资金流向
- **THEN** 系统跟踪交易所钱包地址
- **THEN** 系统计算每日流入流出净值
- **THEN** 系统识别大额转入（潜在抛压）
- **THEN** 系统识别大额转出（潜在囤币）
- **THEN** 系统生成资金流向报告

#### Scenario: 链上数据API速率限制
- **WHEN** 使用付费/免费链上数据API
- **THEN** 系统跟踪API调用配额
- **THEN** 系统实施速率限制
- **THEN** 系统在接近限制时降低采集频率
- **THEN** 系统在超限时使用备用数据源
- **THEN** 系统记录API使用统计

---

### Requirement: 股票数据采集

系统应当采集美股指数、个股K线、财务数据。

#### Scenario: 采集SP500成分股
- **WHEN** 系统初始化股票数据
- **THEN** 系统从FMP获取SP500成分股列表
- **THEN** 系统获取每只股票的权重
- **THEN** 系统在PostgreSQL存储成分股目录
- **THEN** 系统定期更新成分股变化（季度调整）
- **THEN** 系统为每只成分股采集历史数据

#### Scenario: 采集NASDAQ100成分股
- **WHEN** 系统采集科技指数成分
- **THEN** 系统从FMP获取NASDAQ100列表
- **THEN** 系统标识科技巨头（FAANG等）
- **THEN** 系统存储行业分类
- **THEN** 系统跟踪成分股调整历史

#### Scenario: 采集个股日K线
- **WHEN** 用户请求AAPL的10年日K线
- **THEN** 系统从FMP API批量获取
- **THEN** 系统调整复权价格（考虑分红、拆股）
- **THEN** 系统在ClickHouse存储
- **THEN** 系统标注特殊事件（财报日、分红日）
- **THEN** 系统验证价格连续性
- **THEN** 系统每日更新最新数据

#### Scenario: 采集公司财务数据
- **WHEN** 系统采集AAPL财务指标
- **THEN** 系统从FMP获取季报、年报
- **THEN** 系统提取营收、利润、现金流
- **THEN** 系统计算财务比率（PE、PB、ROE等）
- **THEN** 系统在PostgreSQL存储标准化财务表
- **THEN** 系统在ClickHouse存储时间序列财务指标
- **THEN** 系统支持多年历史对比

#### Scenario: 采集财报原文
- **WHEN** 公司发布10-K、10-Q财报
- **THEN** 系统从SEC EDGAR下载PDF
- **THEN** 系统在MinIO/S3存储原文件
- **THEN** 系统提取文本并生成embedding
- **THEN** 系统在Qdrant存储向量供语义搜索
- **THEN** 系统关联财报到公司和季度

#### Scenario: 采集公司事件
- **WHEN** 公司发生重大事件
- **THEN** 系统从FMP获取公司公告
- **THEN** 系统识别事件类型（分红、拆股、并购）
- **THEN** 系统在PostgreSQL存储事件时间线
- **THEN** 系统关联事件到K线图表
- **THEN** 系统供Agent查询历史事件影响

---

### Requirement: 大宗商品数据采集

系统应当采集贵金属、有色金属、农产品、能源的价格数据。

#### Scenario: 采集黄金价格
- **WHEN** 系统采集贵金属数据
- **THEN** 系统从商品交易所API获取黄金现货价格
- **THEN** 系统获取黄金期货合约价格
- **THEN** 系统在ClickHouse存储日K线
- **THEN** 系统跟踪COMEX库存变化
- **THEN** 系统计算黄金/白银比率

#### Scenario: 采集工业金属
- **WHEN** 系统采集铜、铝等有色金属
- **THEN** 系统从LME（伦敦金属交易所）获取价格
- **THEN** 系统获取库存数据
- **THEN** 系统跟踪全球产量和需求
- **THEN** 系统在ClickHouse存储
- **THEN** 系统供宏观分析使用

#### Scenario: 采集农产品价格
- **WHEN** 系统采集大豆、玉米、小麦价格
- **THEN** 系统从CBOT（芝加哥期货交易所）获取
- **THEN** 系统获取天气数据（影响产量）
- **THEN** 系统跟踪库存消费比
- **THEN** 系统存储季节性价格模式

#### Scenario: 采集能源价格
- **WHEN** 系统采集原油、天然气价格
- **THEN** 系统从NYMEX获取WTI原油价格
- **THEN** 系统获取布伦特原油价格
- **THEN** 系统跟踪EIA库存报告
- **THEN** 系统关联OPEC产量决策
- **THEN** 系统计算能源相关性矩阵

#### Scenario: 商品数据源优先级
- **WHEN** 主数据源不可用
- **THEN** 系统尝试备用数据源（FMP、Yahoo Finance）
- **THEN** 系统验证数据一致性
- **THEN** 系统在差异超过阈值时警告
- **THEN** 系统记录数据源切换日志

---

### Requirement: 数据存储架构

系统应当使用分层存储策略，优化查询性能和存储成本。

#### Scenario: ClickHouse时序数据存储
- **WHEN** 存储K线、财务时间序列
- **THEN** 系统使用MergeTree引擎
- **THEN** 系统按(symbol, timestamp)分区
- **THEN** 系统按时间范围分区（月度）
- **THEN** 系统实施数据压缩（zstd）
- **THEN** 系统实现10-20x压缩率
- **THEN** 查询速度：扫描1亿行 < 1秒

#### Scenario: PostgreSQL元数据存储
- **WHEN** 存储资产目录、配置
- **THEN** 系统在PostgreSQL存储
- **THEN** 系统使用关系表（assets、exchanges、data_sources）
- **THEN** 系统建立外键约束保证一致性
- **THEN** 系统为常用查询建立索引
- **THEN** 系统定期vacuum维护

#### Scenario: Qdrant向量存储
- **WHEN** 存储财报、新闻embedding
- **THEN** 系统使用text-embedding-ada-002生成向量
- **THEN** 系统在Qdrant存储768维向量
- **THEN** 系统为每个文档存储元数据（公司、日期、类型）
- **THEN** 系统支持语义搜索（相似财报、相关新闻）
- **THEN** 系统维护collection分类（earnings、news、filings）

#### Scenario: MinIO文件存储
- **WHEN** 存储财报PDF、原始数据备份
- **THEN** 系统在MinIO创建bucket（documents、backups）
- **THEN** 系统按对象类型和日期组织路径
- **THEN** 系统设置生命周期策略（90天后归档）
- **THEN** 系统启用版本控制防止误删
- **THEN** 系统提供签名URL供临时访问

#### Scenario: 数据分区策略
- **WHEN** ClickHouse表增长到TB级
- **THEN** 系统按月分区历史数据
- **THEN** 系统按天分区最近3个月
- **THEN** 系统定期merge小分区
- **THEN** 系统drop过期分区（如5年前数据）
- **THEN** 系统保持热数据查询高效

#### Scenario: 冷热数据分离
- **WHEN** 数据超过1年
- **THEN** 系统将冷数据移至低成本存储
- **THEN** 系统保持热数据（<1年）在SSD
- **THEN** 系统在查询冷数据时接受较慢速度
- **THEN** 系统透明切换无需用户感知

---

### Requirement: 数据质量保证

系统应当验证数据完整性、准确性，并处理异常值。

#### Scenario: K线数据验证
- **WHEN** 接收新K线数据
- **THEN** 系统验证OHLCV合法性（open ≤ high, low ≤ close等）
- **THEN** 系统验证时间戳顺序
- **THEN** 系统检测异常价格跳跃（>20%单根）
- **THEN** 系统标记可疑数据供人工审查
- **THEN** 系统记录验证失败详情

#### Scenario: 财务数据一致性
- **WHEN** 采集财务报表
- **THEN** 系统验证资产 = 负债 + 股东权益
- **THEN** 系统验证现金流平衡
- **THEN** 系统对比同比、环比变化合理性
- **THEN** 系统在异常时标记并警告
- **THEN** 系统保留原始数据和修正数据

#### Scenario: 缺失数据处理
- **WHEN** 检测到数据缺失
- **THEN** 系统记录缺失时间段
- **THEN** 系统标记数据状态为"incomplete"
- **THEN** 系统定期重试获取缺失数据
- **THEN** 系统在无法获取时用NULL标记
- **THEN** 系统在查询时警告用户数据不完整

#### Scenario: 重复数据去重
- **WHEN** 从多源采集相同数据
- **THEN** 系统基于(symbol, timestamp)去重
- **THEN** 系统保留最早采集的版本
- **THEN** 系统在数据冲突时记录差异
- **THEN** 系统允许配置优先级策略

#### Scenario: 数据新鲜度监控
- **WHEN** 系统监控日线数据更新
- **THEN** 系统跟踪每个资产的最新数据日期
- **THEN** 系统在数据超过1个交易日未更新时警告
- **THEN** 系统在仪表板显示数据新鲜度状态
- **THEN** 系统记录更新失败原因

#### Scenario: 数据源健康检查
- **WHEN** 系统定期检查数据源
- **THEN** 系统每5分钟测试API可用性
- **THEN** 系统跟踪成功率和响应时间
- **THEN** 系统在连续失败3次后切换备用源
- **THEN** 系统发送数据源故障通知
- **THEN** 系统在管理页面显示健康状态

---

### Requirement: 数据查询API

系统应当提供统一的数据查询接口供Agent和策略使用。

#### Scenario: Agent查询K线数据
- **WHEN** TradingAgent需要BTC-USDT最近100根1h K线
- **THEN** Agent调用DataService.get_klines()
- **THEN** DataService从ClickHouse查询
- **THEN** DataService返回标准化OHLCV格式
- **THEN** DataService包含数据源和时间戳元数据
- **THEN** 查询响应时间 < 100ms

#### Scenario: Agent查询财务数据
- **WHEN** Agent需要AAPL最近4个季度财报
- **THEN** Agent调用DataService.get_financials()
- **THEN** DataService查询PostgreSQL或ClickHouse
- **THEN** DataService返回标准化财务指标
- **THEN** DataService计算同比、环比增长
- **THEN** DataService包含财报发布日期

#### Scenario: Agent语义搜索财报
- **WHEN** Agent想了解"苹果供应链风险"
- **THEN** Agent调用DataService.search_documents()
- **THEN** DataService将查询转为embedding
- **THEN** DataService在Qdrant向量搜索
- **THEN** DataService返回最相关的财报段落
- **THEN** DataService包含来源文档和相似度分数

#### Scenario: 批量数据查询优化
- **WHEN** Agent需要50只股票的K线
- **THEN** Agent调用DataService.batch_get_klines()
- **THEN** DataService使用单个SQL查询
- **THEN** DataService并行处理和序列化
- **THEN** DataService返回字典格式{symbol: klines}
- **THEN** 批量查询比单个快10x

#### Scenario: 数据查询缓存
- **WHEN** 频繁查询相同历史数据
- **THEN** DataService使用Redis缓存结果
- **THEN** 缓存键：hash(query_params)
- **THEN** 缓存TTL：1小时（日线数据变化不频繁）
- **THEN** DataService在缓存命中时直接返回
- **THEN** 缓存命中率 > 80%
- **THEN** 系统每日收盘后清除当日数据缓存

---

### Requirement: 历史数据初始化

系统应当提供初次部署时的历史数据导入流程。

#### Scenario: 用户首次启动系统
- **WHEN** 用户首次部署uteki.open
- **THEN** 系统检测数据库为空
- **THEN** 系统显示数据初始化向导
- **THEN** 系统询问需要导入的资产类型
- **THEN** 用户选择：加密货币（BTC、ETH）、美股（SP500）
- **THEN** 系统开始后台下载历史数据

#### Scenario: 分阶段数据导入
- **WHEN** 系统初始化大量数据
- **THEN** 系统优先导入核心资产（BTC、ETH、主要指数）
- **THEN** 系统在后台继续导入其他资产
- **THEN** 系统显示导入进度条
- **THEN** 系统允许部分数据可用时即开始使用
- **THEN** 系统在全部完成后通知

#### Scenario: 数据导入失败重试
- **WHEN** 数据导入中途失败
- **THEN** 系统记录已完成的部分
- **THEN** 系统保存断点状态
- **THEN** 系统在重启后从断点继续
- **THEN** 系统实施指数退避重试
- **THEN** 系统在连续失败后人工介入

#### Scenario: 预打包数据包（可选）
- **WHEN** 用户网络受限或API配额不足
- **THEN** 系统提供预下载的数据包（如Parquet格式）
- **THEN** 用户从GitHub Releases下载
- **THEN** 系统导入数据包到ClickHouse
- **THEN** 系统验证数据完整性
- **THEN** 系统仅增量更新缺失部分

#### Scenario: 数据更新调度
- **WHEN** 历史数据导入完成
- **THEN** 系统启动定时任务
- **THEN** 系统每日UTC 00:00后更新收盘日K线
- **THEN** 系统每季度更新财务数据
- **THEN** 系统每日更新链上数据和商品价格
- **THEN** 系统维护数据新鲜度

---

### Requirement: 数据导出与备份

系统应当支持数据导出和定期备份。

#### Scenario: 用户导出K线数据
- **WHEN** 用户请求导出BTC-USDT 2023年K线
- **THEN** 系统从ClickHouse查询
- **THEN** 系统生成CSV或Parquet文件
- **THEN** 系统压缩数据（gzip）
- **THEN** 系统提供下载链接
- **THEN** 系统在24小时后删除导出文件

#### Scenario: 数据库自动备份
- **WHEN** 系统配置每日备份
- **THEN** 系统在UTC 00:00执行备份
- **THEN** 系统备份PostgreSQL（pg_dump）
- **THEN** 系统备份ClickHouse元数据
- **THEN** 系统在MinIO存储备份文件
- **THEN** 系统保留最近30天备份

#### Scenario: 增量备份策略
- **WHEN** ClickHouse数据量TB级
- **THEN** 系统仅增量备份新数据
- **THEN** 系统每周全量备份一次
- **THEN** 系统每日增量备份
- **THEN** 系统压缩备份文件
- **THEN** 系统验证备份可恢复性

#### Scenario: 数据恢复
- **WHEN** 用户需要恢复数据
- **THEN** 系统列出可用备份点
- **THEN** 用户选择恢复时间点
- **THEN** 系统停止数据写入
- **THEN** 系统从备份恢复
- **THEN** 系统验证数据完整性后恢复服务

---

## MODIFIED Requirements（修改的需求）

_无 - 这是新增域_

---

## REMOVED Requirements（移除的需求）

_无 - 这是新增域_
