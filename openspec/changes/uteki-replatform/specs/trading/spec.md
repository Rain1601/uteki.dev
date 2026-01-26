# Trading Domain Specification（交易域规格说明）

**Domain**: 订单执行与持仓管理
**Owner**: Trading Module
**Last Updated**: 2026-01-26

---

## ADDED Requirements（新增需求）

### Requirement: 订单下单

系统应当支持在已配置交易所上下市价单和限价单。

#### Scenario: 用户下市价买单
- **WHEN** 用户提交BTC-USDT市价买单，数量0.01
- **THEN** 系统验证账户余额充足
- **THEN** 系统向交易所API发送订单
- **THEN** 系统收到订单确认及交易所订单ID
- **THEN** 系统在PostgreSQL的orders表存储订单
- **THEN** 系统在UI显示订单，状态为"pending"

#### Scenario: 用户下限价卖单
- **WHEN** 用户提交指定价格的限价卖单
- **THEN** 系统验证用户持仓充足
- **THEN** 系统向交易所发送限价单
- **THEN** 系统存储订单，状态为"pending"
- **THEN** 系统通过WebSocket监控订单状态

#### Scenario: 余额不足
- **WHEN** 用户尝试下单，但超过可用余额
- **THEN** 系统计算所需余额（包括手续费）
- **THEN** 系统返回验证错误
- **THEN** 系统显示具体错误消息
- **THEN** 系统阻止订单提交

#### Scenario: 订单参数无效
- **WHEN** 用户提交的订单数量无效（低于最小值）
- **THEN** 系统根据交易所交易规则验证
- **THEN** 系统返回验证错误，包含交易所限制信息
- **THEN** 系统阻止订单提交

---

### Requirement: 订单状态跟踪

系统应当通过WebSocket和轮询跟踪订单生命周期，从提交到完成。

#### Scenario: 订单完全成交
- **WHEN** 交易所通过WebSocket报告订单完全成交
- **THEN** 系统更新订单状态为"filled"
- **THEN** 系统记录成交数量和平均价格
- **THEN** 系统更新账户余额
- **THEN** 系统创建或更新持仓记录
- **THEN** 系统通知用户订单已成交

#### Scenario: 订单部分成交
- **WHEN** 交易所报告部分成交
- **THEN** 系统更新filled_quantity字段
- **THEN** 系统保持订单状态为"pending"
- **THEN** 系统用部分数量更新持仓
- **THEN** 系统继续监控后续成交

#### Scenario: 订单被取消
- **WHEN** 用户取消待成交订单
- **THEN** 系统向交易所发送取消请求
- **THEN** 交易所确认取消
- **THEN** 系统更新订单状态为"cancelled"
- **THEN** 系统释放冻结余额

#### Scenario: 订单被交易所拒绝
- **WHEN** 交易所拒绝订单（如保证金不足）
- **THEN** 系统更新订单状态为"rejected"
- **THEN** 系统存储拒绝原因
- **THEN** 系统记录拒绝事件日志
- **THEN** 系统通知用户，包含拒绝原因

---

### Requirement: 持仓管理

系统应当跟踪持仓，并实时计算盈亏。

#### Scenario: 开仓
- **WHEN** 买单完全成交
- **THEN** 系统创建新的持仓记录
- **THEN** 系统计算入场价格（如有多次成交则为加权平均）
- **THEN** 系统存储持仓数量
- **THEN** 系统初始化未实现盈亏为0

#### Scenario: 持仓盈亏更新
- **WHEN** 系统通过WebSocket收到实时价格更新
- **THEN** 系统计算未实现盈亏
- **THEN** 系统更新current_price字段
- **THEN** 系统更新unrealized_pnl字段
- **THEN** 系统通过WebSocket向前端广播更新

#### Scenario: 加仓
- **WHEN** 用户对现有持仓加仓（相同交易对、相同方向）
- **THEN** 系统更新持仓数量
- **THEN** 系统重新计算平均入场价格
- **THEN** 系统重新计算未实现盈亏
- **THEN** 系统保留持仓历史

#### Scenario: 平仓
- **WHEN** 用户平仓（反方向订单成交）
- **THEN** 系统计算已实现盈亏
- **THEN** 系统更新持仓closed_at时间戳
- **THEN** 系统将持仓移至历史
- **THEN** 系统用已实现盈亏更新账户余额

#### Scenario: 减仓
- **WHEN** 用户部分平仓
- **THEN** 系统减少持仓数量
- **THEN** 系统计算平仓部分的已实现盈亏
- **THEN** 系统保留剩余持仓
- **THEN** 系统更新总realized_pnl

---

### Requirement: 账户同步

系统应当从交易所同步账户余额和持仓。

#### Scenario: 初始账户同步
- **WHEN** 用户添加交易所API密钥
- **THEN** 系统从交易所获取账户余额
- **THEN** 系统从交易所获取持仓
- **THEN** 系统从交易所获取未成交订单
- **THEN** 系统在本地数据库存储数据
- **THEN** 系统显示同步后的数据

#### Scenario: 定期同步（每60秒）
- **WHEN** 同步间隔到期
- **THEN** 系统查询交易所获取更新的余额
- **THEN** 系统查询持仓变化
- **THEN** 系统对比本地数据差异
- **THEN** 系统更新本地记录

#### Scenario: 同步检测到外部订单
- **WHEN** 检测到在系统外下的订单
- **THEN** 系统导入订单详情
- **THEN** 系统标记订单为"external"
- **THEN** 系统在订单历史中显示
- **THEN** 系统相应更新持仓

#### Scenario: 同步失败处理
- **WHEN** 交易所API在同步时返回错误
- **THEN** 系统记录同步失败日志
- **THEN** 系统实施指数退避
- **THEN** 系统延迟后重试
- **THEN** 系统在连续3次失败后警告用户

---

### Requirement: 交易所抽象

系统应当提供统一接口支持多个交易所（OKX、币安）。

#### Scenario: 在OKX下单
- **WHEN** 用户选择OKX交易所下单
- **THEN** 系统使用OKX API适配器
- **THEN** 系统按OKX规格格式化订单
- **THEN** 系统发送到OKX端点
- **THEN** 系统解析OKX响应格式

#### Scenario: 在币安下单
- **WHEN** 用户选择币安交易所下单
- **THEN** 系统使用币安API适配器
- **THEN** 系统按币安规格格式化订单
- **THEN** 系统发送到币安端点
- **THEN** 系统解析币安响应格式

#### Scenario: 交易所特有功能
- **WHEN** 用户在OKX下永续合约单并附带条件单
- **THEN** 系统支持OKX特有的attachAlgoOrds参数
- **THEN** 系统创建包含止损的原子订单
- **THEN** 系统在数据库存储关联关系

#### Scenario: 交易所故障切换
- **WHEN** 主交易所API不可用
- **THEN** 系统检测连接失败
- **THEN** 系统实施指数退避重试
- **THEN** 系统记录故障事件
- **THEN** 系统在UI显示交易所状态

---

### Requirement: 风险管理

系统应当强制执行风险限制和持仓规模约束。

#### Scenario: 最大持仓限制
- **WHEN** 用户尝试下单，超过配置的最大持仓
- **THEN** 系统计算订单后的总持仓
- **THEN** 系统与风险限制对比
- **THEN** 系统在超过限制时拒绝订单
- **THEN** 系统显示具体的限制违反消息

#### Scenario: 最大未成交订单限制
- **WHEN** 用户已有10个未成交订单（配置限制）
- **THEN** 系统阻止创建新订单
- **THEN** 系统显示"已达最大未成交订单数量"消息
- **THEN** 系统建议取消现有订单

#### Scenario: 每日亏损限制
- **WHEN** 配置文件已亏损达到每日限额
- **THEN** 系统阻止新订单提交
- **THEN** 系统仅允许平仓操作
- **THEN** 系统通知用户限额突破
- **THEN** 系统记录风险限制事件

#### Scenario: 保证金要求检查
- **WHEN** 用户下杠杆订单
- **THEN** 系统计算所需保证金
- **THEN** 系统验证可用保证金
- **THEN** 系统在保证金不足时拒绝
- **THEN** 系统显示保证金要求详情

---

### Requirement: 订单历史

系统应当维护完整订单历史，支持筛选和搜索。

#### Scenario: 用户查看订单历史
- **WHEN** 用户打开订单历史页面
- **THEN** 系统从PostgreSQL查询订单
- **THEN** 系统按时间倒序显示订单
- **THEN** 系统显示状态、交易对、方向、数量、价格
- **THEN** 系统分页显示结果（每页50条）

#### Scenario: 用户按状态筛选
- **WHEN** 用户按"filled"状态筛选订单
- **THEN** 系统对查询应用筛选条件
- **THEN** 系统仅显示已成交订单
- **THEN** 系统在分页中保持筛选

#### Scenario: 用户按交易对搜索
- **WHEN** 用户在订单历史中搜索"BTC"
- **THEN** 系统搜索symbol字段
- **THEN** 系统显示匹配的订单
- **THEN** 系统高亮搜索词

#### Scenario: 用户导出订单历史
- **WHEN** 用户点击"导出"并选择日期范围
- **THEN** 系统生成CSV文件
- **THEN** CSV包含所有订单字段
- **THEN** CSV包含已平仓的计算盈亏
- **THEN** 系统下载文件

---

### Requirement: WebSocket实时更新

系统应当通过WebSocket流式传输实时订单和持仓更新。

#### Scenario: 订单状态更新流式传输
- **WHEN** 交易所通过WebSocket发送订单更新
- **THEN** 系统接收并解析更新
- **THEN** 系统在数据库更新订单
- **THEN** 系统向前端WebSocket广播更新
- **THEN** 前端无需刷新即更新UI

#### Scenario: 价格更新流式传输
- **WHEN** 交易所流式传输价格tick
- **THEN** 系统重新计算所有持仓盈亏
- **THEN** 系统向前端广播盈亏更新
- **THEN** 前端实时更新持仓价值

#### Scenario: WebSocket重连
- **WHEN** WebSocket连接断开
- **THEN** 系统检测断线
- **THEN** 系统实施指数退避重连
- **THEN** 系统重新订阅所有频道
- **THEN** 系统通过REST API获取错过的更新

#### Scenario: 多客户端连接
- **WHEN** 用户打开多个浏览器标签
- **THEN** 系统为每个客户端维护独立WebSocket
- **THEN** 系统向所有客户端广播相同更新
- **THEN** 所有标签显示同步数据

---

### Requirement: 手续费计算

系统应当计算并跟踪所有订单的交易手续费。

#### Scenario: 市价单手续费计算
- **WHEN** 市价单成交
- **THEN** 系统获取交易所手续费率
- **THEN** 系统计算手续费（数量 × 价格 × 费率）
- **THEN** 系统在订单记录中存储手续费金额
- **THEN** 系统从账户余额扣除手续费

#### Scenario: 基于交易量的费率等级
- **WHEN** 用户有高交易量（VIP等级）
- **THEN** 系统从交易所获取用户特定费率
- **THEN** 系统应用折扣费率
- **THEN** 系统存储等级信息

#### Scenario: 手续费总览
- **WHEN** 用户查看手续费仪表板
- **THEN** 系统按时间段聚合总手续费
- **THEN** 系统按交易所分组手续费
- **THEN** 系统显示按交易对的手续费分解
- **THEN** 系统计算手续费占交易量的百分比

---

### Requirement: 止损止盈订单

系统应当支持在持仓上附加止损和止盈。

#### Scenario: 用户在持仓设置止损
- **WHEN** 用户设置入场价下方5%的止损
- **THEN** 系统计算触发价格
- **THEN** 系统在交易所创建条件单
- **THEN** 系统关联条件单到持仓
- **THEN** 系统监控触发条件

#### Scenario: 止损被触发
- **WHEN** 市场价格触及止损触发价
- **THEN** 交易所执行止损订单
- **THEN** 系统收到成交通知
- **THEN** 系统平仓
- **THEN** 系统计算已实现亏损

#### Scenario: 用户修改止损
- **WHEN** 用户调整止损价格
- **THEN** 系统取消现有条件单
- **THEN** 系统用更新价格创建新条件单
- **THEN** 系统维护持仓关联

#### Scenario: 止盈被触发
- **WHEN** 市场价格触及止盈目标
- **THEN** 交易所执行止盈订单
- **THEN** 系统平仓
- **THEN** 系统计算已实现盈利
- **THEN** 系统通知用户

---

### Requirement: 多交易对交易

系统应当支持跨多个交易对的同时交易。

#### Scenario: 用户交易多个交易对
- **WHEN** 用户同时持有BTC-USDT和ETH-USDT
- **THEN** 系统独立跟踪每个持仓
- **THEN** 系统分别计算盈亏
- **THEN** 系统允许每个持仓独立设置止损

#### Scenario: 交易对特定设置
- **WHEN** 用户为每个交易对配置不同风险参数
- **THEN** 系统存储交易对特定配置
- **THEN** 系统对每个交易对应用正确参数
- **THEN** 系统根据交易对限制验证订单

#### Scenario: 相关性警告
- **WHEN** 用户持有高度相关的持仓
- **THEN** 系统计算相关性
- **THEN** 系统显示相关性警告
- **THEN** 系统建议多样化

---

## MODIFIED Requirements（修改的需求）

_无 - 这是新增域_

---

## REMOVED Requirements（移除的需求）

_无 - 这是新增域_
