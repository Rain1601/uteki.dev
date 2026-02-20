## Why

FOMC Calendar 页面每次加载都直接调用 FMP 外部 API（30s 超时），没有任何缓存或持久化。`EconomicEvent` DB 模型已经存在但从未使用。这导致页面加载缓慢、浪费 API 配额、且 FMP 失败时无历史数据可回退。

## What Changes

- FMP 获取的经济事件数据持久化到 `economic_events` 表（已有模型，无需新建表）
- 请求时优先从 DB 读取，仅当 DB 数据过期（>1 小时）或不存在时才调用 FMP API
- FMP 获取成功后写入/更新 DB，后续请求直接从 DB 返回
- Statistics 端点也从 DB 聚合，而非仅统计 FOMC 硬编码列表

## Capabilities

### New Capabilities
- `fomc-calendar-cache`: 经济日历数据的 DB 缓存策略——写入、过期检查、回退逻辑

### Modified Capabilities
_(none — no existing specs are affected)_

## Impact

- `backend/uteki/domains/macro/services/fmp_calendar_service.py` — 主要改动：添加 DB 读写逻辑
- `backend/uteki/domains/macro/api.py` — 可能微调（如添加 force-refresh 参数）
- 无前端改动、无新的 DB 迁移（表已存在）
