## Context

FOMC Calendar 页面的 `get_monthly_events_enriched` 每次请求都通过 `httpx` 调用 FMP 外部 API（30s 超时）。`EconomicEvent` 模型和 `economic_events` 表已存在于 `macro` schema，有完善的字段和索引，但从未被读写。当前 session 参数传入 service 后未使用。

## Goals / Non-Goals

**Goals:**
- FMP 数据写入 `economic_events` 表，后续请求优先从 DB 读取
- 数据过期（可配置，默认 1 小时）时自动重新从 FMP 拉取并更新 DB
- 页面加载时间从 ~2-5s（外部 API）降到 <100ms（DB 查询）
- FMP API 不可用时，从 DB 返回最近一次的缓存数据

**Non-Goals:**
- 不引入 Redis 或新的缓存中间件——DB 即缓存
- 不改变前端调用方式和响应格式
- 不新建数据库迁移（表已存在）
- 不改变 FOMC 会议硬编码列表的逻辑（这部分本身就是内存数据，无延迟问题）

## Decisions

### 1. 缓存策略：DB Write-Through + TTL 检查

每次 `get_monthly_events_enriched` 调用：
1. 查询 DB 中该月份的 FMP 事件（`source='fmp'`），检查最新 `updated_at`
2. 如果数据存在且 `updated_at` < 1 小时 → 直接返回 DB 数据
3. 如果数据不存在或已过期 → 调用 FMP API → upsert 到 DB → 返回

**为什么不用 in-memory cache**: 服务可能多进程/重启，DB 持久化更可靠。经济数据变化频率低（日级），1 小时 TTL 足够。

### 2. Upsert 策略

FMP 事件的 `id` 格式为 `fmp_{date}_{event_name}`，已有唯一性。使用 `merge()` 或 `INSERT ON CONFLICT UPDATE` 避免重复插入。对于已存在的事件，更新 `actual_value`、`expected_value`、`previous_value`、`status` 等字段。

### 3. 不改变 API 响应格式

前端期望 `{success, data: {date_str: [events]}, fmp_status, enriched_count}` 格式。从 DB 读取后仍然按相同格式组装返回，前端无需任何改动。

### 4. force-refresh 参数

API 端点添加可选 `refresh=true` 查询参数，跳过缓存强制从 FMP 拉取。用于调试和手动刷新。

## Risks / Trade-offs

- **首次加载仍慢** → 预期行为，第一次必须调 FMP。后续请求会快。
- **DB 数据与 FMP 不一致窗口** → 最多 1 小时延迟，对经济日历数据可接受。
- **FMP 事件 ID 碰撞** → 当前 ID 生成逻辑（date + event_name 截断）可能碰撞，用 upsert 处理即可。
