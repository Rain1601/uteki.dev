# Tasks

## Group 1: DB persistence — write FMP events to economic_events

### Files
- `backend/uteki/domains/macro/services/fmp_calendar_service.py`

### Tasks
- [x] Add `_save_events_to_db(session, events)` method — takes parsed FMP event dicts, upserts each into `EconomicEvent` table using `session.merge()`. Maps fields: id, event_type, title, start_date, status, importance, actual_value, expected_value, previous_value, source='fmp'. Sets `updated_at` to `datetime.utcnow()`.
- [x] Add `_load_events_from_db(session, year, month, event_type?)` method — queries `EconomicEvent` where `source='fmp'` and `start_date` within the month range. Returns list of dicts (via `to_dict()`), plus the max `updated_at` timestamp.

## Group 2: Cache logic — DB-first with TTL

### Files
- `backend/uteki/domains/macro/services/fmp_calendar_service.py`

### Tasks
- [x] Add `CACHE_TTL_SECONDS = 3600` constant at module level (1 hour default)
- [x] Modify `get_monthly_events_enriched()` to implement DB-first flow: (1) call `_load_events_from_db`, (2) if data exists and `updated_at` within TTL → return DB data with `fmp_status='cached'`, (3) if stale/missing → call `fetch_economic_calendar`, (4) on success → call `_save_events_to_db` then return fresh data, (5) on failure with stale DB data → return stale data with `fmp_status='cached_stale'`, (6) on failure with no DB data → return empty with `fmp_status='failed'`
- [x] Accept `force_refresh: bool = False` parameter in `get_monthly_events_enriched()` — when True, skip TTL check and always call FMP API

## Group 3: Statistics from DB

### Files
- `backend/uteki/domains/macro/services/fmp_calendar_service.py`

### Tasks
- [x] Modify `get_statistics()` to query `economic_events` table grouped by `event_type` with COUNT. If DB has events, return DB counts + FOMC count from hardcoded list. If DB is empty, fall back to current FOMC-only logic.

## Group 4: API endpoint update

### Files
- `backend/uteki/domains/macro/api.py`

### Tasks
- [x] Add `refresh: Optional[bool] = Query(None)` parameter to `get_monthly_events_enriched` endpoint and pass it through to service method
