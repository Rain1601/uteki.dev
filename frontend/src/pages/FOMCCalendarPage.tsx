import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  TrendingUp,
  Briefcase,
  DollarSign,
  BarChart3,
  Activity,
  Landmark,
  Filter,
} from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { getWeeklyEvents } from '../api/economicCalendar';
import { EconomicEvent, EventsByDate } from '../types/economicCalendar';
import { useResponsive } from '../hooks/useResponsive';

/* ─── Constants ─── */

const IMPORTANCE_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#60a5fa',
  low: '#475569',
};

const TYPE_CONFIG: Record<string, { icon: typeof Activity; label: string; color: string }> = {
  fomc: { icon: Landmark, label: 'FOMC', color: '#a78bfa' },
  inflation: { icon: TrendingUp, label: '通胀', color: '#f87171' },
  employment: { icon: Briefcase, label: '就业', color: '#60a5fa' },
  consumption: { icon: DollarSign, label: '消费', color: '#34d399' },
  gdp: { icon: BarChart3, label: 'GDP', color: '#fbbf24' },
  economic_data: { icon: Activity, label: '经济', color: '#94a3b8' },
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'fomc', label: 'FOMC' },
  { key: 'inflation', label: '通胀' },
  { key: 'employment', label: '就业' },
  { key: 'consumption,gdp', label: '消费/GDP' },
];

const IMPORTANCE_FILTERS = [
  { key: 'high', label: '重要' },
  { key: 'medium', label: '中等+' },
  { key: 'low', label: '全部' },
];

/* ─── Helpers ─── */

function getWeeksInMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const weeks: Array<{ start: Date; end: Date; label: string }> = [];
  let current = new Date(firstDay);
  const dow = current.getDay();
  current.setDate(current.getDate() + (dow === 0 ? -6 : 1 - dow));

  while (current <= lastDay || weeks.length === 0) {
    const ws = new Date(current);
    const we = new Date(current);
    we.setDate(we.getDate() + 6);
    const s = ws.getDate();
    const e = we.getDate();
    const label =
      ws.getMonth() === month && we.getMonth() === month
        ? `${MONTHS[month]} ${s}–${e}日`
        : ws.getMonth() !== month
          ? `${MONTHS[month]} 1–${e}日`
          : `${MONTHS[month]} ${s}–${lastDay.getDate()}日`;
    weeks.push({ start: ws, end: we, label });
    current.setDate(current.getDate() + 7);
    if (current.getMonth() > month && current.getFullYear() >= year) break;
    if (current.getFullYear() > year) break;
  }
  return weeks;
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─── Timeline layout ─── */
const TL_LEFT = 52; // px from left edge to center of timeline line

/* ─── Event Row ─── */

function EventRow({ event, theme, isDark }: { event: EconomicEvent; theme: any; isDark: boolean }) {
  const impColor = IMPORTANCE_COLORS[event.importance || 'medium'];
  const typeConf = TYPE_CONFIG[event.event_type] || TYPE_CONFIG.economic_data;
  const Icon = typeConf.icon;
  const isCritical = event.importance === 'critical' || event.importance === 'high';

  const actual = event.actual_value ?? event.actual;
  const forecast = (event as any).expected_value ?? event.forecast_value ?? event.forecast;
  const previous = event.previous_value ?? event.previous;
  const hasData = actual != null || forecast != null || previous != null;

  return (
    <Box sx={{ display: 'flex', position: 'relative', mb: 0.5 }}>
      {/* Node on the timeline */}
      <Box sx={{ width: TL_LEFT, flexShrink: 0, display: 'flex', justifyContent: 'center', pt: '10px' }}>
        <Box
          sx={{
            width: isCritical ? 10 : 6,
            height: isCritical ? 10 : 6,
            borderRadius: '50%',
            bgcolor: impColor,
            boxShadow: isCritical ? `0 0 8px ${impColor}60` : 'none',
            zIndex: 2,
          }}
        />
      </Box>

      {/* Event card */}
      <Box
        sx={{
          flex: 1, minWidth: 0,
          py: 0.75, px: 1.5,
          ml: 1.5,
          borderRadius: '10px',
          bgcolor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.015)',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
          transition: 'all 0.15s',
          '&:hover': {
            bgcolor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.025)',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Icon size={13} color={typeConf.color} style={{ flexShrink: 0 }} />
          <Typography
            noWrap
            sx={{ fontSize: 12.5, fontWeight: isCritical ? 700 : 500, color: theme.text.primary, flex: 1, lineHeight: 1.5 }}
          >
            {event.title}
          </Typography>
          <Box
            sx={{
              px: 0.75, py: 0.15, borderRadius: '4px',
              bgcolor: `${typeConf.color}15`,
              flexShrink: 0,
            }}
          >
            <Typography sx={{ fontSize: 9, fontWeight: 600, color: typeConf.color, letterSpacing: '0.2px' }}>
              {typeConf.label}
            </Typography>
          </Box>
        </Box>
        {hasData && (
          <Box sx={{ display: 'flex', gap: 2, mt: 0.25, pl: 2.5 }}>
            {actual != null && (
              <Typography sx={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: theme.text.disabled }}>实际</span>{' '}
                <span style={{ color: theme.text.primary }}>{actual}</span>
              </Typography>
            )}
            {forecast != null && (
              <Typography sx={{ fontSize: 11, color: theme.text.muted, fontVariantNumeric: 'tabular-nums' }}>
                预期 {forecast}
              </Typography>
            )}
            {previous != null && (
              <Typography sx={{ fontSize: 11, color: theme.text.disabled, fontVariantNumeric: 'tabular-nums' }}>
                前值 {previous}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/* ─── Day Section ─── */

function DaySection({ date, events, theme, isDark }: { date: string; events: EconomicEvent[]; theme: any; isDark: boolean }) {
  const d = new Date(date + 'T00:00:00');
  const dayOfWeek = WEEKDAYS[d.getDay()];
  const dayNum = d.getDate();
  const monthStr = MONTHS[d.getMonth()];
  const isToday = fmtDate(new Date()) === date;

  return (
    <Box sx={{ mb: 2.5 }}>
      {/* Day header */}
      <Box sx={{ display: 'flex', position: 'relative', mb: 1 }}>
        {/* Date circle on the line */}
        <Box sx={{ width: TL_LEFT, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          <Box
            sx={{
              width: 36, height: 36,
              borderRadius: '50%',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              bgcolor: isToday ? theme.brand.primary : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              color: isToday ? '#fff' : theme.text.primary,
              zIndex: 2,
              border: isToday ? `2px solid ${theme.brand.primary}40` : 'none',
              boxShadow: isToday ? `0 0 12px ${theme.brand.primary}30` : 'none',
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 800, lineHeight: 1 }}>{dayNum}</Typography>
          </Box>
        </Box>

        {/* Day label */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1.5 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: isToday ? theme.brand.primary : theme.text.primary }}>
            周{dayOfWeek}
          </Typography>
          <Typography sx={{ fontSize: 11, color: theme.text.disabled, fontWeight: 500 }}>
            {monthStr}{dayNum}日
          </Typography>
          <Box
            sx={{
              px: 0.75, py: 0.15, borderRadius: '10px',
              bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            }}
          >
            <Typography sx={{ fontSize: 9, fontWeight: 600, color: theme.text.muted }}>
              {events.length}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Events */}
      {events.map((e, i) => (
        <EventRow key={e.id || `${date}-${i}`} event={e} theme={theme} isDark={isDark} />
      ))}
    </Box>
  );
}

/* ═══════════════════ Main Page ═══════════════════ */

export default function FOMCCalendarPage() {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const { isMobile, isSmallScreen } = useResponsive();
  const isCompact = isMobile || isSmallScreen;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [activeWeekIdx, setActiveWeekIdx] = useState(-1);
  const [eventFilter, setEventFilter] = useState('all');
  const [minImportance, setMinImportance] = useState('medium');
  const [weekData, setWeekData] = useState<Record<string, { events: EventsByDate; total: number; loading: boolean }>>({});

  const weeks = getWeeksInMonth(year, month);

  useEffect(() => {
    const today = fmtDate(now);
    const idx = weeks.findIndex((w) => fmtDate(w.start) <= today && today <= fmtDate(w.end));
    setActiveWeekIdx(idx >= 0 ? idx : 0);
  }, [year, month]);

  const activeWeek = weeks[activeWeekIdx] || weeks[0];

  const loadWeek = useCallback(
    async (weekStart: Date, weekEnd: Date, force = false) => {
      const key = `${fmtDate(weekStart)}_${fmtDate(weekEnd)}_${minImportance}_${eventFilter}`;
      if (!force && weekData[key] && !weekData[key].loading) return;
      setWeekData((prev) => ({ ...prev, [key]: { events: {}, total: 0, loading: true } }));
      const result = await getWeeklyEvents(
        fmtDate(weekStart), fmtDate(weekEnd), minImportance, 'US',
        eventFilter === 'all' ? undefined : eventFilter,
      );
      setWeekData((prev) => ({
        ...prev,
        [key]: { events: result.success ? result.data : {}, total: (result as any).total ?? 0, loading: false },
      }));
    },
    [minImportance, eventFilter, weekData],
  );

  useEffect(() => {
    if (activeWeek) loadWeek(activeWeek.start, activeWeek.end);
  }, [activeWeekIdx, year, month, minImportance, eventFilter]);

  useEffect(() => { setWeekData({}); }, [minImportance, eventFilter]);

  const currentKey = activeWeek
    ? `${fmtDate(activeWeek.start)}_${fmtDate(activeWeek.end)}_${minImportance}_${eventFilter}`
    : '';
  const currentData = weekData[currentKey];
  const isLoading = !currentData || currentData.loading;
  const eventsByDate = currentData?.events || {};
  const sortedDates = Object.keys(eventsByDate).sort();

  const goWeek = (dir: number) => {
    const nextIdx = activeWeekIdx + dir;
    if (nextIdx < 0) {
      let m = month - 1, y = year;
      if (m < 0) { m = 11; y--; }
      setMonth(m); setYear(y); setActiveWeekIdx(-1); setWeekData({});
    } else if (nextIdx >= weeks.length) {
      let m = month + 1, y = year;
      if (m > 11) { m = 0; y++; }
      setMonth(m); setYear(y); setActiveWeekIdx(0); setWeekData({});
    } else {
      setActiveWeekIdx(nextIdx);
    }
  };

  const weekLabel = activeWeek ? `${year} ${activeWeek.label}` : '';
  const lineColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

  return (
    <Box
      sx={{
        height: isCompact ? 'calc(100vh - 48px)' : '100vh',
        width: isCompact ? 'calc(100% + 32px)' : 'calc(100% + 48px)',
        m: isCompact ? -2 : -3,
        bgcolor: theme.background.primary,
        color: theme.text.primary,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {/* ─── Header ─── */}
      <Box
        sx={{
          px: 2.5, py: 1.25, flexShrink: 0,
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        }}
      >
        {/* Week nav */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <Box
            onClick={() => goWeek(-1)}
            sx={{
              cursor: 'pointer', p: 0.5, borderRadius: '6px',
              '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
            }}
          >
            <ChevronLeft size={16} color={theme.text.muted} />
          </Box>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: theme.text.primary, minWidth: 170, textAlign: 'center', letterSpacing: '-0.2px' }}>
            {weekLabel}
          </Typography>
          <Box
            onClick={() => goWeek(1)}
            sx={{
              cursor: 'pointer', p: 0.5, borderRadius: '6px',
              '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
            }}
          >
            <ChevronRight size={16} color={theme.text.muted} />
          </Box>
        </Box>

        <Box sx={{ width: 1, height: 16, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />

        {/* Type filter — segmented control */}
        <Box sx={{
          display: 'flex', alignItems: 'center',
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
          borderRadius: '8px', p: '2px',
        }}>
          {FILTERS.map((f) => (
            <Box
              key={f.key}
              onClick={() => setEventFilter(f.key)}
              sx={{
                px: 1.25, py: 0.35, borderRadius: '6px', cursor: 'pointer',
                bgcolor: eventFilter === f.key ? (isDark ? 'rgba(255,255,255,0.08)' : '#fff') : 'transparent',
                boxShadow: eventFilter === f.key ? (isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
                transition: 'all 0.15s',
              }}
            >
              <Typography sx={{
                fontSize: 11, fontWeight: eventFilter === f.key ? 600 : 400,
                color: eventFilter === f.key ? theme.text.primary : theme.text.muted,
                whiteSpace: 'nowrap',
              }}>
                {f.label}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ width: 1, height: 16, bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />

        {/* Importance filter */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.25,
          bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
          borderRadius: '8px', p: '2px',
        }}>
          <Box sx={{ px: 0.5, display: 'flex', alignItems: 'center' }}>
            <Filter size={11} color={theme.text.disabled} />
          </Box>
          {IMPORTANCE_FILTERS.map((f) => (
            <Box
              key={f.key}
              onClick={() => setMinImportance(f.key)}
              sx={{
                px: 1, py: 0.3, borderRadius: '6px', cursor: 'pointer',
                bgcolor: minImportance === f.key ? (isDark ? 'rgba(255,255,255,0.08)' : '#fff') : 'transparent',
                boxShadow: minImportance === f.key ? (isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
                transition: 'all 0.15s',
              }}
            >
              <Typography sx={{
                fontSize: 10, fontWeight: minImportance === f.key ? 600 : 400,
                color: minImportance === f.key ? theme.text.primary : theme.text.muted,
              }}>
                {f.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {!isLoading && currentData && (
          <Typography sx={{ fontSize: 11, color: theme.text.disabled, ml: 'auto' }}>
            {currentData.total} 条
          </Typography>
        )}
      </Box>

      {/* ─── Timeline ─── */}
      <Box
        sx={{
          flex: 1, overflowY: 'auto',
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 4 },
        }}
      >
        <Box sx={{ maxWidth: 720, mx: 'auto', px: isCompact ? 1.5 : 3, py: 3 }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 12, gap: 1.5 }}>
              <CircularProgress size={18} sx={{ color: theme.text.muted }} />
              <Typography sx={{ fontSize: 12, color: theme.text.muted }}>加载中...</Typography>
            </Box>
          ) : sortedDates.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 12, gap: 1.5 }}>
              <Calendar size={24} color={theme.text.disabled} strokeWidth={1.5} />
              <Typography sx={{ fontSize: 13, color: theme.text.muted }}>本周无符合条件的事件</Typography>
            </Box>
          ) : (
            <Box sx={{ position: 'relative' }}>
              {/* Main vertical timeline line */}
              <Box
                sx={{
                  position: 'absolute',
                  left: `${TL_LEFT - 1}px`,
                  top: 18,
                  bottom: 18,
                  width: '2px',
                  bgcolor: lineColor,
                  zIndex: 0,
                }}
              />
              {sortedDates.map((date) => (
                <DaySection key={date} date={date} events={eventsByDate[date]} theme={theme} isDark={isDark} />
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
