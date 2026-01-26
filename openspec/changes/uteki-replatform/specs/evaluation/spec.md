# Evaluation Domain Specification（评估域规格说明）

**Domain**: Agent与策略性能评估
**Owner**: Evaluation Module
**Last Updated**: 2026-01-26

---

## ADDED Requirements（新增需求）

### Requirement: Agent性能指标

系统应当跨多个维度跟踪和评估agent性能。

#### Scenario: 计算准确度指标
- **WHEN** 系统评估agent任务完成情况
- **THEN** 系统对比agent预测vs实际结果
- **THEN** 系统计算准确度百分比
- **THEN** 系统存储带时间戳的指标
- **THEN** 系统更新滚动平均准确度

#### Scenario: 计算响应延迟
- **WHEN** agent完成任务
- **THEN** 系统测量从任务创建到完成的时间
- **THEN** 系统计算P50、P95、P99百分位
- **THEN** 系统与基准对比
- **THEN** 系统在延迟下降时标记

#### Scenario: 计算成本效率
- **WHEN** agent使用LLM API
- **THEN** 系统跟踪消耗的总token数
- **THEN** 系统计算每个任务的成本
- **THEN** 系统对比成本vs产生的价值
- **THEN** 系统识别成本优化机会

#### Scenario: 计算可靠性评分
- **WHEN** 系统在时间段内评估agent
- **THEN** 系统计算成功率（完成/总任务数）
- **THEN** 系统计算错误率
- **THEN** 系统识别常见失败模式
- **THEN** 系统分配可靠性评分（0-100）

#### Scenario: 计算一致性指标
- **WHEN** agent多次执行类似任务
- **THEN** 系统对比输出的相似度
- **THEN** 系统测量响应中的变化
- **THEN** 系统计算一致性评分
- **THEN** 系统标记高方差为潜在问题

---

### Requirement: 策略性能评估

系统应当用综合指标评估策略性能。

#### Scenario: 计算策略回报
- **WHEN** 用户评估时间段内的策略
- **THEN** 系统从ClickHouse查询所有交易
- **THEN** 系统计算总回报百分比
- **THEN** 系统计算年化回报
- **THEN** 系统与买入持有基准对比

#### Scenario: 计算夏普比率
- **WHEN** 系统评估风险调整后回报
- **THEN** 系统计算日回报率
- **THEN** 系统计算回报标准差
- **THEN** 系统应用夏普比率公式
- **THEN** 系统与行业基准对比

#### Scenario: 计算最大回撤
- **WHEN** 系统分析策略权益曲线
- **THEN** 系统识别权益峰值
- **THEN** 系统识别后续低谷
- **THEN** 系统计算最大峰谷跌幅
- **THEN** 系统用百分比表示

#### Scenario: 计算胜率
- **WHEN** 系统评估交易结果
- **THEN** 系统统计盈利vs亏损交易
- **THEN** 系统计算胜率百分比
- **THEN** 系统按交易类型分段（多/空）
- **THEN** 系统与预期对比

#### Scenario: 计算盈利因子
- **WHEN** 系统评估交易盈利能力
- **THEN** 系统求和总盈利
- **THEN** 系统求和总亏损
- **THEN** 系统计算比率（盈利/亏损）
- **THEN** 系统解释结果（>1 = 盈利）

---

### Requirement: A/B测试框架

系统应当支持A/B测试以对比agent或策略变体。

#### Scenario: 创建A/B测试
- **WHEN** 用户创建测试"GPT-4 vs Claude-3-Opus for trading"
- **THEN** 用户定义变体A（GPT-4 TradingAgent）
- **THEN** 用户定义变体B（Claude-3 TradingAgent）
- **THEN** 用户设置测试时长（如30天）
- **THEN** 用户定义成功指标（如准确度）
- **THEN** 系统存储测试配置

#### Scenario: 执行A/B测试
- **WHEN** 测试激活
- **THEN** 系统随机分配任务给变体A或B（50/50分流）
- **THEN** 系统分别跟踪每个变体的性能
- **THEN** 系统确保任务类型均匀分配
- **THEN** 系统在测试期间累积结果

#### Scenario: 分析A/B测试结果
- **WHEN** 测试完成或用户查看中期结果
- **THEN** 系统计算每个变体的指标
- **THEN** 系统进行统计显著性检验
- **THEN** 系统确定获胜者（如统计显著）
- **THEN** 系统提供置信度（如95%）

#### Scenario: 多指标A/B测试
- **WHEN** 用户评估多个维度（准确度、成本、延迟）
- **THEN** 系统跟踪每个变体的所有指标
- **THEN** 系统为每个指标分配权重
- **THEN** 系统计算综合评分
- **THEN** 系统基于加权评分推荐变体

#### Scenario: A/B测试提前停止
- **WHEN** 一个变体明显占优（如99%置信度）
- **THEN** 系统提前检测统计显著性
- **THEN** 系统建议停止测试
- **THEN** 用户可以停止或继续收集数据

---

### Requirement: 评估报告

系统应当生成综合评估报告。

#### Scenario: 生成agent性能报告
- **WHEN** 用户请求最近30天的agent性能报告
- **THEN** 系统查询所有agent任务数据
- **THEN** 系统计算所有指标（准确度、延迟、成本、可靠性）
- **THEN** 系统生成图表（时间序列、分布）
- **THEN** 系统包含按类型的任务分解
- **THEN** 系统导出为PDF或HTML

#### Scenario: 生成策略性能报告
- **WHEN** 用户请求策略报告
- **THEN** 系统从ClickHouse获取交易历史
- **THEN** 系统计算性能指标
- **THEN** 系统生成权益曲线图表
- **THEN** 系统包含交易日志表
- **THEN** 系统提供可操作建议

#### Scenario: 生成对比报告
- **WHEN** 用户对比3个策略
- **THEN** 系统获取所有策略数据
- **THEN** 系统标准化指标以供对比
- **THEN** 系统生成并排表格
- **THEN** 系统高亮每个指标的最佳表现者
- **THEN** 系统提供建议

#### Scenario: 定期报告生成
- **WHEN** 用户配置每周邮件报告
- **THEN** 系统每周自动生成报告
- **THEN** 系统通过配置的邮箱发送
- **THEN** 系统在数据库归档报告
- **THEN** 用户可以访问历史报告

---

### Requirement: 基准对比

系统应当将策略与标准基准对比。

#### Scenario: 与买入持有对比
- **WHEN** 用户评估策略
- **THEN** 系统计算同期买入持有回报
- **THEN** 系统对比策略回报vs买入持有
- **THEN** 系统计算alpha（超额回报）
- **THEN** 系统显示对比图表

#### Scenario: 与市场指数对比
- **WHEN** 用户以S&P 500为基准
- **THEN** 系统获取该期间指数数据
- **THEN** 系统计算策略与指数的相关性
- **THEN** 系统计算beta（市场敏感度）
- **THEN** 系统显示风险回报散点图

#### Scenario: 自定义基准
- **WHEN** 用户定义自定义基准策略
- **THEN** 系统并行运行基准策略
- **THEN** 系统跟踪基准性能
- **THEN** 系统对比用户策略vs基准
- **THEN** 系统计算相对性能

---

### Requirement: 实时评估仪表板

系统应当提供显示评估指标的实时仪表板。

#### Scenario: 查看agent仪表板
- **WHEN** 用户打开/evaluate页面
- **THEN** 系统显示agent选择器下拉菜单
- **THEN** 用户选择TradingAgent
- **THEN** 系统加载实时指标
- **THEN** 系统显示KPI卡片（准确度、延迟、成本、可靠性）
- **THEN** 系统显示趋势图表
- **THEN** 系统每30秒自动刷新

#### Scenario: 深入任务分解
- **WHEN** 用户点击任务分解部分
- **THEN** 系统显示按类型分组的任务
- **THEN** 系统显示每个任务类型的成功率
- **THEN** 系统识别有问题的任务类型
- **THEN** 用户可以点击查看单个任务详情

#### Scenario: 查看历史趋势
- **WHEN** 用户选择日期范围（最近7天）
- **THEN** 系统查询历史评估数据
- **THEN** 系统显示时间序列图表
- **THEN** 系统高亮异常或性能下降
- **THEN** 系统允许导出趋势数据

---

### Requirement: 警报与监控

系统应当在性能下降时警告用户。

#### Scenario: Agent准确度降至阈值以下
- **WHEN** agent准确度降至80%以下（配置阈值）
- **THEN** 系统检测性能下降
- **THEN** 系统发送警报通知
- **THEN** 系统记录警报事件
- **THEN** 用户可以调查原因

#### Scenario: 策略回撤超过限制
- **WHEN** 策略回撤达到15%
- **THEN** 系统检测风险限制突破
- **THEN** 系统自动暂停策略
- **THEN** 系统发送紧急警报
- **THEN** 用户必须手动审查并重新启用

#### Scenario: 检测到LLM成本激增
- **WHEN** 每日LLM成本比平均高3倍
- **THEN** 系统检测异常
- **THEN** 系统发送成本警报
- **THEN** 系统识别哪些agent成本高
- **THEN** 用户可以审查并优化

---

### Requirement: 指标导出

系统应当导出评估指标供外部分析。

#### Scenario: 导出指标为CSV
- **WHEN** 用户在评估页面点击"导出数据"
- **THEN** 系统生成包含所有指标的CSV
- **THEN** CSV包含时间戳、指标名称、值
- **THEN** CSV可下载
- **THEN** 用户可以在Excel或其他工具中分析

#### Scenario: 导出到ClickHouse
- **WHEN** 用户启用ClickHouse指标导出
- **THEN** 系统流式传输评估指标到ClickHouse
- **THEN** 指标可用于自定义SQL查询
- **THEN** 用户可以创建自定义仪表板

#### Scenario: API访问指标
- **WHEN** 外部系统查询指标API
- **THEN** 系统提供RESTful端点
- **THEN** API以JSON格式返回指标
- **THEN** API支持按日期、agent、指标类型筛选
- **THEN** API包含速率限制

---

### Requirement: 持续评估

系统应当在生产使用期间持续评估agent和策略。

#### Scenario: 在线评估
- **WHEN** agent在生产环境执行任务
- **THEN** 系统记录执行元数据
- **THEN** 系统异步计算指标
- **THEN** 系统更新评估仪表板
- **THEN** 系统保持最小性能开销

#### Scenario: 真实数据收集
- **WHEN** agent做出预测
- **THEN** 系统记录预测
- **THEN** 系统等待实际结果
- **THEN** 系统对比预测vs结果
- **THEN** 系统更新准确度指标

#### Scenario: 自适应评估
- **WHEN** 系统检测到概念漂移
- **THEN** 系统调整评估标准
- **THEN** 系统根据当前市场重新加权指标
- **THEN** 系统保持相关的性能评估

---

### Requirement: Benchmark评估（OpenAI Evals风格）

系统应当提供标准化benchmark测试集，持续评估agent能力。

#### Scenario: 创建交易决策benchmark
- **WHEN** 系统构建交易决策评估集
- **THEN** 系统收集100+历史市场场景
- **THEN** 系统包含明确的正确决策标签（买/卖/持有）
- **THEN** 系统标注决策难度（简单/中等/困难）
- **THEN** 系统包含多种市场条件（牛市、熊市、震荡）
- **THEN** 系统存储为标准化JSON格式

#### Scenario: 运行benchmark评估
- **WHEN** 用户触发benchmark测试
- **THEN** 系统加载评估集
- **THEN** 系统为每个场景调用agent
- **THEN** 系统对比agent决策vs标准答案
- **THEN** 系统计算准确率、F1分数
- **THEN** 系统分层报告（按难度、市场类型）
- **THEN** 系统存储评估结果供对比

#### Scenario: 自定义benchmark
- **WHEN** 用户创建自定义评估集
- **THEN** 系统提供benchmark编辑器
- **THEN** 用户定义输入场景和期望输出
- **THEN** 用户标注评分标准
- **THEN** 系统验证benchmark格式
- **THEN** 系统将自定义集加入评估pipeline

#### Scenario: 回归测试
- **WHEN** agent代码或模型更新
- **THEN** 系统自动运行全部benchmark
- **THEN** 系统对比更新前后的分数
- **THEN** 系统标记性能下降的场景
- **THEN** 系统生成回归报告
- **THEN** 系统在性能严重下降时阻止部署

#### Scenario: Benchmark版本控制
- **WHEN** benchmark测试集演化
- **THEN** 系统为benchmark分配版本号
- **THEN** 系统保留历史版本
- **THEN** 系统支持在不同版本上评估
- **THEN** 系统跟踪版本间的分数变化
- **THEN** 系统说明版本更新原因

---

### Requirement: 决策质量评分

系统应当评估agent决策的质量，不仅看结果，更看推理过程。

#### Scenario: 推理链评分
- **WHEN** agent做出交易决策
- **THEN** 系统提取agent的推理步骤
- **THEN** 系统评估每个步骤的逻辑性
- **THEN** 系统检查是否使用相关工具
- **THEN** 系统检查是否考虑风险因素
- **THEN** 系统计算推理质量评分（0-100）

#### Scenario: 信息使用评估
- **WHEN** agent做出决策
- **THEN** 系统识别agent使用的信息源
- **THEN** 系统评估信息的相关性
- **THEN** 系统检测是否遗漏关键信息
- **THEN** 系统检测是否使用过时数据
- **THEN** 系统生成信息使用报告

#### Scenario: 风险评估遵守度
- **WHEN** agent执行交易
- **THEN** 系统检查是否评估了风险
- **THEN** 系统验证持仓大小合理性
- **THEN** 系统验证是否设置止损
- **THEN** 系统验证风险回报比
- **THEN** 系统计算风险管理遵守率

#### Scenario: 决策可解释性
- **WHEN** 评估agent决策
- **THEN** 系统要求agent解释决策原因
- **THEN** 系统评估解释的清晰度
- **THEN** 系统检查解释与实际行为的一致性
- **THEN** 系统计算可解释性评分
- **THEN** 低分触发人工审查

#### Scenario: 多agent决策对比
- **WHEN** 同一场景有多个agent决策
- **THEN** 系统对比不同agent的推理路径
- **THEN** 系统识别共识和分歧点
- **THEN** 系统分析决策差异原因
- **THEN** 系统学习最优决策模式
- **THEN** 系统用于改进agent prompt

---

### Requirement: Agent一致性测试

系统应当评估agent在相似场景下的决策一致性。

#### Scenario: 重复场景测试
- **WHEN** 系统测试agent一致性
- **THEN** 系统用相同输入运行agent 10次
- **THEN** 系统记录所有决策和推理
- **THEN** 系统计算决策一致率
- **THEN** 系统分析不一致的原因（随机性、工具调用差异）
- **THEN** 系统报告一致性评分

#### Scenario: 微扰输入测试
- **WHEN** 系统测试鲁棒性
- **THEN** 系统对输入场景做微小改动（如价格±1%）
- **THEN** 系统运行agent
- **THEN** 系统验证核心决策是否保持
- **THEN** 系统在决策大幅变化时标记不稳定
- **THEN** 系统生成鲁棒性报告

#### Scenario: 时间一致性
- **WHEN** 评估agent在不同时间的表现
- **THEN** 系统在一个月内多次运行相同benchmark
- **THEN** 系统对比不同时间点的分数
- **THEN** 系统检测性能漂移
- **THEN** 系统识别性能下降趋势
- **THEN** 系统在检测到漂移时警告

#### Scenario: 温度参数影响
- **WHEN** 系统测试LLM温度参数影响
- **THEN** 系统用temperature=0和temperature=0.7分别测试
- **THEN** 系统对比两种设置的一致性
- **THEN** 系统评估创造性vs稳定性权衡
- **THEN** 系统推荐最优温度设置
- **THEN** 系统记录温度敏感度

---

### Requirement: 对齐性评估（Anthropic风格）

系统应当评估agent是否遵守交易规则和风险约束。

#### Scenario: 规则遵守评估
- **WHEN** agent执行交易
- **THEN** 系统检查是否违反配置的规则
- **THEN** 系统验证最大持仓限制
- **THEN** 系统验证每日交易次数限制
- **THEN** 系统验证风险敞口限制
- **THEN** 系统计算规则遵守率（99%+为合格）

#### Scenario: 安全边界测试
- **WHEN** 系统测试agent安全性
- **THEN** 系统尝试诱导agent违规（adversarial prompts）
- **THEN** 系统检查agent是否拒绝不当操作
- **THEN** 系统验证agent在极端场景的行为
- **THEN** 系统计算安全性评分
- **THEN** 系统在发现漏洞时阻止agent使用

#### Scenario: 价值对齐评估
- **WHEN** 评估agent目标对齐
- **THEN** 系统验证agent优化的是用户目标（盈利、风险控制）
- **THEN** 系统检测是否存在目标劫持（gaming metrics）
- **THEN** 系统分析agent是否理解用户意图
- **THEN** 系统评估agent行为与用户价值的一致性
- **THEN** 系统生成对齐性报告

#### Scenario: 透明度评估
- **WHEN** agent做出重要决策
- **THEN** 系统要求agent说明决策依据
- **THEN** 系统评估解释的完整性
- **THEN** 系统检查是否隐瞒关键信息
- **THEN** 系统验证agent是否坦承不确定性
- **THEN** 系统计算透明度评分

#### Scenario: 失败案例分析
- **WHEN** agent出现严重错误
- **THEN** 系统记录完整的执行轨迹
- **THEN** 系统分析失败的根本原因
- **THEN** 系统识别系统性问题vs偶发错误
- **THEN** 系统生成post-mortem报告
- **THEN** 系统将案例加入回归测试

---

### Requirement: 自动化评估Pipeline

系统应当提供持续集成风格的自动化评估流程。

#### Scenario: 每日自动评估
- **WHEN** 配置每日评估任务
- **THEN** 系统在UTC 00:00触发评估
- **THEN** 系统运行全部benchmark测试
- **THEN** 系统生成评估报告
- **THEN** 系统通过邮件发送报告
- **THEN** 系统在性能下降时发送警报

#### Scenario: Git commit触发评估
- **WHEN** agent代码提交到Git
- **THEN** 系统通过webhook检测到提交
- **THEN** 系统自动运行评估pipeline
- **THEN** 系统在pull request中评论结果
- **THEN** 系统在性能下降时阻止合并
- **THEN** 系统生成性能对比报告

#### Scenario: 模型更新评估
- **WHEN** 用户切换LLM模型（如GPT-4→Claude-3.5）
- **THEN** 系统自动运行benchmark对比
- **THEN** 系统评估新模型在所有场景的表现
- **THEN** 系统对比成本、速度、准确度
- **THEN** 系统生成模型切换建议
- **THEN** 系统标记需要重新调优的agent

#### Scenario: 分层评估策略
- **WHEN** 运行评估pipeline
- **THEN** 系统首先运行快速冒烟测试（<5分钟）
- **THEN** 通过后运行核心benchmark（<30分钟）
- **THEN** 通过后运行完整测试套件（<2小时）
- **THEN** 系统在任何阶段失败时停止
- **THEN** 系统优化评估时间和覆盖度权衡

#### Scenario: 评估结果可视化
- **WHEN** 评估完成
- **THEN** 系统生成交互式报告（HTML）
- **THEN** 系统显示性能趋势图表
- **THEN** 系统高亮性能提升和下降
- **THEN** 系统提供失败案例详情
- **THEN** 系统支持深度钻取分析

#### Scenario: 历史评估对比
- **WHEN** 用户查看评估历史
- **THEN** 系统显示时间线视图
- **THEN** 系统标注重要版本发布
- **THEN** 系统对比不同版本的性能
- **THEN** 系统识别性能拐点
- **THEN** 系统关联代码变更和性能变化

---

## MODIFIED Requirements（修改的需求）

_无 - 这是新增域_

---

## REMOVED Requirements（移除的需求）

_无 - 这是新增域_
