import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { Calendar, TrendingUp, Newspaper } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { getMonthlyNews, NewsSource } from '../api/news';
import { getMonthlyEventsEnriched } from '../api/economicCalendar';
import { NewsItem, NewsDataByDate, NewsFilterType } from '../types/news';
import { EconomicEvent, EventsByDate } from '../types/economicCalendar';
import ArticleDetailDialog from '../components/ArticleDetailDialog';
import { useResponsive } from '../hooks/useResponsive';

/* ═══════════════════ Constants ═══════════════════ */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

const FILTERS: { key: NewsFilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'important', label: 'Important' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'forex', label: 'Forex' },
];

const IMP_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#6b7280',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  fomc: '#8b5cf6', employment: '#10b981', inflation: '#ef4444',
  consumption: '#f59e0b', gdp: '#3b82f6', economic_data: '#6366f1', earnings: '#ec4899',
};

/* ═══════════════════ Helpers ═══════════════════ */

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const monthKey = (y: number, m: number) => `${y}-${m}`;

const parseDateLabel = (dateStr: string) => {
  const [yr, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(dateStr + 'T00:00:00');
  return { year: yr, month: m, day: d, weekday: WEEKDAYS[dt.getDay()] };
};

/* ═══════════════════ Sub-Components ═══════════════════ */

/* --- News Card --- */
function NewsCard({ news, onOpen, theme, isDark }: { news: NewsItem; onOpen: (id: string) => void; theme: any; isDark: boolean }) {
  const impColor = IMP_COLORS[news.importance_level || 'low'] || IMP_COLORS.low;
  return (
    <Box
      onClick={(e) => { e.stopPropagation(); onOpen(news.id); }}
      sx={{
        py: 1, px: 1.5, borderRadius: '8px', cursor: 'pointer',
        borderLeft: `2px solid ${impColor}20`,
        transition: 'all 0.15s',
        '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)', borderLeftColor: `${impColor}80` },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.35 }}>
        {news.source && <Typography sx={{ fontSize: 10, color: theme.text.disabled, fontWeight: 500 }}>{news.source}</Typography>}
        {news.time && <Typography sx={{ fontSize: 10, color: theme.text.disabled }}>{news.time}</Typography>}
        {news.important && (
          <Typography sx={{ fontSize: 9, px: 0.5, py: 0.1, borderRadius: '3px', bgcolor: 'rgba(239,68,68,0.08)', color: '#ef4444', fontWeight: 600, ml: 'auto' }}>
            重要
          </Typography>
        )}
      </Box>
      <Typography sx={{ fontSize: 13, color: theme.text.primary, lineHeight: 1.55, fontWeight: 450, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {news.headline || news.title || '(untitled)'}
      </Typography>
      {news.tags?.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mt: 0.5 }}>
          {news.tags.slice(0, 3).map((tag) => (
            <Typography key={tag} sx={{ fontSize: 9, px: 0.6, py: 0.1, borderRadius: '3px', bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)', color: theme.text.muted }}>
              {tag}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

/* --- Event Item --- */
function EventItem({ event, theme, isDark }: { event: EconomicEvent; theme: any; isDark: boolean }) {
  const typeColor = EVENT_TYPE_COLORS[event.event_type] || '#6b7280';
  const impColor = IMP_COLORS[event.importance || 'medium'] || IMP_COLORS.medium;
  const actual = event.actual_value ?? event.actual;
  const forecast = (event as any).expected_value ?? event.forecast_value ?? event.forecast;
  const previous = event.previous_value ?? event.previous;

  return (
    <Box sx={{ py: 0.5, px: 1, borderLeft: `2px solid ${typeColor}30`, '&:hover': { borderLeftColor: `${typeColor}80` }, transition: 'border-color 0.15s' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: impColor, flexShrink: 0 }} />
        <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 500, color: theme.text.primary, flex: 1, lineHeight: 1.5 }}>
          {event.title}
        </Typography>
      </Box>
      {(actual != null || forecast != null || previous != null) && (
        <Box sx={{ display: 'flex', gap: 1.5, pl: 1.25, mt: 0.1 }}>
          {actual != null && (
            <Typography sx={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: theme.text.disabled }}>实际</span>{' '}
              <span style={{ color: theme.text.primary, fontWeight: 600 }}>{actual}</span>
            </Typography>
          )}
          {forecast != null && <Typography sx={{ fontSize: 10, color: theme.text.muted, fontVariantNumeric: 'tabular-nums' }}>预期 {forecast}</Typography>}
          {previous != null && <Typography sx={{ fontSize: 10, color: theme.text.disabled, fontVariantNumeric: 'tabular-nums' }}>前值 {previous}</Typography>}
        </Box>
      )}
    </Box>
  );
}

/* --- Day Row: date | news | events --- */
function DayRow({
  dateStr, news, events, isToday, onOpenArticle, theme, isDark,
}: {
  dateStr: string; news: NewsItem[]; events: EconomicEvent[];
  isToday: boolean; onOpenArticle: (id: string) => void; theme: any; isDark: boolean;
}) {
  const { month, day, weekday } = parseDateLabel(dateStr);
  const borderColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <Box
      data-date={dateStr}
      sx={{
        display: 'flex',
        borderBottom: `1px solid ${borderColor}`,
        minHeight: 72,
        '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.008)' : 'rgba(0,0,0,0.005)' },
        transition: 'background-color 0.2s',
      }}
    >
      {/* ── Date column ── */}
      <Box sx={{
        width: 80, flexShrink: 0, py: 1.5, px: 1.5,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        borderRight: `1px solid ${borderColor}`,
        position: 'relative',
      }}>
        {/* Vertical line segment */}
        <Box sx={{
          position: 'absolute', left: '50%', top: 0, bottom: 0,
          width: '1px', bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          transform: 'translateX(-0.5px)', zIndex: 0,
        }} />

        {/* Date node */}
        <Box sx={{
          position: 'relative', zIndex: 1,
          width: 36, height: 36,
          borderRadius: '50%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          bgcolor: isToday ? theme.brand.primary : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
          color: isToday ? '#fff' : theme.text.primary,
          boxShadow: isToday ? `0 0 12px ${theme.brand.primary}30` : 'none',
          border: isToday ? 'none' : `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
        }}>
          <Typography sx={{ fontSize: 9, fontWeight: 500, lineHeight: 1, opacity: 0.7, mb: '1px' }}>{month}月</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{day}</Typography>
        </Box>

        <Typography sx={{ fontSize: 9, color: isToday ? theme.brand.primary : theme.text.disabled, mt: 0.5, fontWeight: isToday ? 600 : 400, position: 'relative', zIndex: 1, letterSpacing: '0.5px' }}>
          周{weekday}
        </Typography>
      </Box>

      {/* ── News column ── */}
      <Box sx={{
        flex: 1, py: 1, px: 0.5, minWidth: 0,
        borderRight: `1px solid ${borderColor}`,
      }}>
        {news.length > 0 ? (
          news.map((n) => <NewsCard key={n.id} news={n} onOpen={onOpenArticle} theme={theme} isDark={isDark} />)
        ) : (
          <Box sx={{ px: 2, py: 1 }}>
            <Typography sx={{ fontSize: 11, color: theme.text.disabled, fontStyle: 'italic' }}>—</Typography>
          </Box>
        )}
      </Box>

      {/* ── Events column ── */}
      <Box sx={{ width: 320, flexShrink: 0, py: 1, px: 1 }}>
        {events.length > 0 ? (
          events.map((e, i) => <EventItem key={e.id || `${dateStr}-${i}`} event={e} theme={theme} isDark={isDark} />)
        ) : (
          <Box sx={{ px: 1, py: 0.5 }}>
            <Typography sx={{ fontSize: 11, color: theme.text.disabled, fontStyle: 'italic' }}>—</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/* ═══════════════════ Main Page ═══════════════════ */

export default function NewsHubPage() {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const { isMobile, isSmallScreen } = useResponsive();
  const isCompact = isMobile || isSmallScreen;

  const today = new Date();
  const todayStr = fmtDate(today);

  const [activeFilter, setActiveFilter] = useState<NewsFilterType>('all');
  const [newsSource, setNewsSource] = useState<NewsSource>('jeff-cox');

  const [newsData, setNewsData] = useState<NewsDataByDate>({});
  const [eventsData, setEventsData] = useState<EventsByDate>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadedMonths = useRef<Set<string>>(new Set());
  const pendingMonths = useRef<Set<string>>(new Set());

  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  /* --- Load a single month --- */
  const loadMonth = useCallback(async (year: number, month: number) => {
    const key = monthKey(year, month);
    if (loadedMonths.current.has(key) || pendingMonths.current.has(key)) return;
    pendingMonths.current.add(key);

    try {
      const [newsRes, eventsRes] = await Promise.all([
        getMonthlyNews(year, month + 1, activeFilter, newsSource),
        getMonthlyEventsEnriched(year, month + 1),
      ]);
      if (newsRes.success) setNewsData((prev) => ({ ...prev, ...newsRes.data }));
      if (eventsRes.success) setEventsData((prev) => ({ ...prev, ...eventsRes.data }));
      loadedMonths.current.add(key);
    } catch (err) {
      console.error(`Load month ${key} error:`, err);
    } finally {
      pendingMonths.current.delete(key);
    }
  }, [activeFilter, newsSource]);

  /* --- Initial load --- */
  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      setNewsData({}); setEventsData({});
      loadedMonths.current.clear(); pendingMonths.current.clear();

      const y = today.getFullYear(), m = today.getMonth();
      await loadMonth(y, m);
      const prevM = m === 0 ? 11 : m - 1, prevY = m === 0 ? y - 1 : y;
      const nextM = m === 11 ? 0 : m + 1, nextY = m === 11 ? y + 1 : y;
      await Promise.all([loadMonth(prevY, prevM), loadMonth(nextY, nextM)]);
      setInitialLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, newsSource]);

  /* --- Build all dates that have any content, sorted descending --- */
  const allContentDates = useCallback(() => {
    const dateSet = new Set<string>();
    Object.keys(newsData).forEach((d) => { if (newsData[d]?.length > 0) dateSet.add(d); });
    Object.keys(eventsData).forEach((d) => { if (eventsData[d]?.length > 0) dateSet.add(d); });
    return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  }, [newsData, eventsData]);

  const sortedDates = allContentDates();

  /* --- Filter news --- */
  const filterNews = useCallback((items: NewsItem[]) => {
    if (!items) return [];
    if (activeFilter === 'all') return items;
    if (activeFilter === 'important') return items.filter((i) => i.important);
    if (activeFilter === 'crypto') return items.filter((i) => i.tags?.some((t) => ['Bitcoin', 'Crypto', 'BTC', 'Ethereum', 'ETH'].includes(t)));
    if (activeFilter === 'stocks') return items.filter((i) => i.tags?.some((t) => ['Stocks', 'Market', 'NASDAQ', 'S&P', 'Tech'].includes(t)));
    if (activeFilter === 'forex') return items.filter((i) => i.tags?.some((t) => ['Forex', 'USD', 'EUR', 'GBP', 'JPY', 'CNY'].includes(t)));
    return items;
  }, [activeFilter]);

  /* --- Infinite scroll --- */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore) return;

    // Near bottom → load older month
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400 && sortedDates.length > 0) {
      const oldest = sortedDates[sortedDates.length - 1];
      const [y, m] = oldest.split('-').map(Number);
      const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
      if (!loadedMonths.current.has(monthKey(py, pm - 1))) {
        setLoadingMore(true);
        loadMonth(py, pm - 1).finally(() => setLoadingMore(false));
      }
    }

    // Near top → load newer month
    if (el.scrollTop < 400 && sortedDates.length > 0) {
      const newest = sortedDates[0];
      const [y, m] = newest.split('-').map(Number);
      const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
      if (!loadedMonths.current.has(monthKey(ny, nm - 1))) {
        setLoadingMore(true);
        loadMonth(ny, nm - 1).finally(() => setLoadingMore(false));
      }
    }
  }, [sortedDates, loadMonth, loadingMore]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; handleScroll(); }); } };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [handleScroll]);

  const handleOpenArticle = (id: string) => { setSelectedArticleId(id); setDetailDialogOpen(true); };

  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  /* --- Seg control --- */
  const Seg = ({ items, active, onChange }: { items: { key: string; label: string }[]; active: string; onChange: (k: any) => void }) => (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: '7px', p: '2px' }}>
      {items.map((f) => (
        <Box key={f.key} onClick={() => onChange(f.key)} sx={{
          px: 1.25, py: 0.3, borderRadius: '5px', cursor: 'pointer',
          bgcolor: active === f.key ? (isDark ? 'rgba(255,255,255,0.07)' : '#fff') : 'transparent',
          boxShadow: active === f.key ? (isDark ? 'none' : '0 1px 2px rgba(0,0,0,0.04)') : 'none',
          transition: 'all 0.12s',
        }}>
          <Typography sx={{ fontSize: 11, fontWeight: active === f.key ? 600 : 400, color: active === f.key ? theme.text.primary : theme.text.muted, whiteSpace: 'nowrap' }}>
            {f.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );

  return (
    <Box sx={{
      height: '100%',
      bgcolor: theme.background.primary, color: theme.text.primary,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      borderRadius: '12px',
      border: `1px solid ${borderColor}`,
    }}>

      {/* ─── Top Bar ─── */}
      <Box sx={{ px: 2.5, py: 1.25, flexShrink: 0, borderBottom: `1px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Seg items={[{ key: 'jeff-cox', label: 'CNBC' }, { key: 'bloomberg', label: 'Bloomberg' }]} active={newsSource} onChange={setNewsSource} />
        <Box sx={{ width: 1, height: 14, bgcolor: borderColor, mx: 0.5 }} />
        <Seg items={FILTERS} active={activeFilter} onChange={setActiveFilter} />
      </Box>

      {/* ─── Column Headers ─── */}
      <Box sx={{
        display: 'flex', flexShrink: 0,
        borderBottom: `1px solid ${borderColor}`,
      }}>
        {/* Date col header */}
        <Box sx={{ width: 80, flexShrink: 0, borderRight: `1px solid ${borderColor}`, px: 1.5, py: 0.6 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 600, color: theme.text.disabled, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            日期
          </Typography>
        </Box>
        {/* News col header */}
        <Box sx={{ flex: 1, borderRight: `1px solid ${borderColor}`, px: 2, py: 0.6, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Newspaper size={11} color={theme.text.disabled} />
          <Typography sx={{ fontSize: 10, fontWeight: 600, color: theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            新闻
          </Typography>
        </Box>
        {/* Events col header */}
        <Box sx={{ width: 320, flexShrink: 0, px: 1.5, py: 0.6, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <TrendingUp size={11} color={theme.text.disabled} />
          <Typography sx={{ fontSize: 10, fontWeight: 600, color: theme.text.disabled, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            宏观数据
          </Typography>
        </Box>
      </Box>

      {/* ─── Single Scrollable Content ─── */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 3 },
        }}
      >
        {initialLoading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 16, gap: 1 }}>
            <CircularProgress size={18} sx={{ color: theme.text.muted }} />
            <Typography sx={{ fontSize: 12, color: theme.text.muted }}>加载中...</Typography>
          </Box>
        ) : sortedDates.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 16, gap: 1 }}>
            <Calendar size={22} color={theme.text.disabled} strokeWidth={1.5} />
            <Typography sx={{ fontSize: 12, color: theme.text.disabled }}>无数据</Typography>
          </Box>
        ) : (
          <>
            {loadingMore && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={14} sx={{ color: theme.text.disabled }} />
              </Box>
            )}

            {sortedDates.map((dateStr, idx) => {
              const filtered = filterNews(newsData[dateStr] || []);
              const events = eventsData[dateStr] || [];
              // Skip dates with no content after filtering
              if (filtered.length === 0 && events.length === 0) return null;

              // Month divider
              const prev = idx > 0 ? sortedDates[idx - 1] : null;
              const curMonth = parseDateLabel(dateStr);
              const prevMonth = prev ? parseDateLabel(prev) : null;
              const showMonthDivider = !prevMonth || prevMonth.month !== curMonth.month || prevMonth.year !== curMonth.year;

              return (
                <Box key={dateStr}>
                  {showMonthDivider && (
                    <Box sx={{
                      display: 'flex', alignItems: 'center', gap: 1,
                      px: 3, py: 1, mt: idx === 0 ? 0 : 0.5,
                      bgcolor: isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.008)',
                    }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: theme.text.secondary, letterSpacing: '-0.2px' }}>
                        {curMonth.year}年{MONTH_NAMES[curMonth.month - 1]}
                      </Typography>
                      <Box sx={{ flex: 1, height: '1px', bgcolor: borderColor }} />
                    </Box>
                  )}
                  <DayRow
                    dateStr={dateStr}
                    news={filtered}
                    events={events}
                    isToday={dateStr === todayStr}
                    onOpenArticle={handleOpenArticle}
                    theme={theme}
                    isDark={isDark}
                  />
                </Box>
              );
            })}

            {loadingMore && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={14} sx={{ color: theme.text.disabled }} />
              </Box>
            )}
          </>
        )}
      </Box>

      <ArticleDetailDialog
        open={detailDialogOpen}
        onClose={() => { setDetailDialogOpen(false); setSelectedArticleId(null); }}
        articleId={selectedArticleId}
      />
    </Box>
  );
}
