import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  FormControl,
  Select,
  MenuItem,
  IconButton,
  Chip,
  CircularProgress,
  SelectChangeEvent,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Today as TodayIcon,
  EmojiObjects as AIIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
} from '@mui/icons-material';
import { useTheme } from '../theme/ThemeProvider';
import { getMonthlyNews, analyzeNewsStream } from '../api/news';
import ArticleDetailDialog from '../components/ArticleDetailDialog';
import { NewsItem, NewsDataByDate, NewsFilterType, AnalysisResult } from '../types/news';

interface CalendarDay {
  day: number;
  isOtherMonth: boolean;
  date: Date;
  dateStr: string;
}

interface DateGroup {
  date: string;
  news: NewsItem[];
}

interface FeedbackState {
  [newsId: string]: {
    userFeedback: 'like' | 'dislike' | null;
  };
}

export default function NewsTimelinePage() {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';

  // State
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [activeFilter, setActiveFilter] = useState<NewsFilterType>('all');
  const [isScrolling, setIsScrolling] = useState(false);
  const [newsData, setNewsData] = useState<NewsDataByDate>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTitleId, setActiveTitleId] = useState<string | null>(null);
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set());
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [dialogDefaultLanguage, setDialogDefaultLanguage] = useState<'en' | 'zh' | null>(null);

  // AI analysis state
  const [analysisResults, setAnalysisResults] = useState<{ [newsId: string]: AnalysisResult }>({});
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>({});

  // Refs
  const newsListRef = useRef<HTMLDivElement>(null);

  // Format date
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Render calendar
  const renderCalendar = useCallback((year: number, month: number): CalendarDay[] => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const prevLastDay = new Date(year, month, 0);

    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const daysInPrevMonth = prevLastDay.getDate();

    const days: CalendarDay[] = [];

    // Previous month days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const date = new Date(year, month - 1, day);
      days.push({ day, isOtherMonth: true, date, dateStr: formatDate(date) });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push({ day, isOtherMonth: false, date, dateStr: formatDate(date) });
    }

    // Next month days
    const remainingDays = 42 - (firstDayOfWeek + daysInMonth);
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({ day, isOtherMonth: true, date, dateStr: formatDate(date) });
    }

    return days;
  }, []);

  // Load monthly news
  const loadMonthlyNews = useCallback(async (year: number, month: number, append = false) => {
    const monthKey = `${year}-${month}`;
    if (loadedMonths.has(monthKey)) return;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await getMonthlyNews(year, month + 1, activeFilter);
      if (response.success) {
        setNewsData((prev) => ({ ...prev, ...response.data }));
        setLoadedMonths((prev) => new Set([...prev, monthKey]));

        // Load pre-existing AI analysis
        const newAnalysisResults: { [newsId: string]: AnalysisResult } = {};
        Object.values(response.data).forEach((dayNews) => {
          dayNews.forEach((newsItem) => {
            if (newsItem.ai_analysis_status === 'completed' && newsItem.ai_analysis) {
              newAnalysisResults[newsItem.id] = {
                loading: false,
                impact: newsItem.ai_impact,
                analysis: newsItem.ai_analysis,
                streamContent: '',
                error: null,
              };
            }
          });
        });

        if (Object.keys(newAnalysisResults).length > 0) {
          setAnalysisResults((prev) => ({ ...prev, ...newAnalysisResults }));
        }
      } else {
        setError('Failed to load news');
      }
    } catch (err) {
      setError('Network request failed');
      console.error('Load monthly news error:', err);
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [activeFilter, loadedMonths]);

  // Load adjacent month
  const loadAdjacentMonth = useCallback((direction: 'prev' | 'next') => {
    let targetYear = currentYear;
    let targetMonth = currentMonth;

    if (direction === 'prev') {
      if (currentMonth === 0) {
        targetYear = currentYear - 1;
        targetMonth = 11;
      } else {
        targetMonth = currentMonth - 1;
      }
    } else {
      if (currentMonth === 11) {
        targetYear = currentYear + 1;
        targetMonth = 0;
      } else {
        targetMonth = currentMonth + 1;
      }
    }

    loadMonthlyNews(targetYear, targetMonth, true);
  }, [currentYear, currentMonth, loadMonthlyNews]);

  // Initialize
  useEffect(() => {
    if (loadedMonths.size === 0) {
      loadMonthlyNews(currentYear, currentMonth, false);
      setTimeout(() => {
        loadAdjacentMonth('prev');
        loadAdjacentMonth('next');
      }, 500);
    }
  }, [currentYear, currentMonth]);

  // Reload when filter changes
  useEffect(() => {
    setNewsData({});
    setLoadedMonths(new Set());
    loadMonthlyNews(currentYear, currentMonth, false);
    setTimeout(() => {
      loadAdjacentMonth('prev');
      loadAdjacentMonth('next');
    }, 500);
  }, [activeFilter]);

  // Navigation functions
  const previousMonth = () => {
    let targetYear = currentYear;
    let targetMonth = currentMonth;

    if (currentMonth === 0) {
      targetMonth = 11;
      targetYear = currentYear - 1;
    } else {
      targetMonth = currentMonth - 1;
    }

    setCurrentYear(targetYear);
    setCurrentMonth(targetMonth);
    loadMonthlyNews(targetYear, targetMonth, true);
  };

  const nextMonth = () => {
    let targetYear = currentYear;
    let targetMonth = currentMonth;

    if (currentMonth === 11) {
      targetMonth = 0;
      targetYear = currentYear + 1;
    } else {
      targetMonth = currentMonth + 1;
    }

    setCurrentYear(targetYear);
    setCurrentMonth(targetMonth);
    loadMonthlyNews(targetYear, targetMonth, true);
  };

  const todayMonth = () => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(today);
  };

  const handleYearChange = (event: SelectChangeEvent<number>) => {
    const newYear = event.target.value as number;
    setCurrentYear(newYear);
    loadMonthlyNews(newYear, currentMonth, true);
  };

  const handleMonthChange = (event: SelectChangeEvent<number>) => {
    const newMonth = event.target.value as number;
    setCurrentMonth(newMonth);
    loadMonthlyNews(currentYear, newMonth, true);
  };

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    const dateStr = formatDate(date);
    const targetGroup = document.querySelector(`[data-date="${dateStr}"]`);
    if (targetGroup && newsListRef.current) {
      setIsScrolling(true);
      targetGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => setIsScrolling(false), 1000);
    }
  };

  // Check if date has news
  const hasNews = (dateStr: string): boolean => newsData[dateStr]?.length > 0;
  const getNewsCount = (dateStr: string): number => newsData[dateStr]?.length || 0;

  // Format date label
  const formatDateLabel = (dateStr: string): string => {
    const [, month, day] = dateStr.split('-');
    return `${parseInt(month)}/${parseInt(day)}`;
  };

  // Filter news
  const getFilteredNews = (): DateGroup[] => {
    const allNews: DateGroup[] = [];
    const sortedDates = Object.keys(newsData).sort((a, b) => b.localeCompare(a));

    sortedDates.forEach((dateStr) => {
      const dayNews = newsData[dateStr] || [];
      if (dayNews.length > 0) {
        const filtered = dayNews.filter((item) => {
          if (activeFilter === 'all') return true;
          if (activeFilter === 'important') return item.important;
          if (activeFilter === 'crypto')
            return item.tags.some((tag) => ['Bitcoin', 'Crypto', 'BTC', 'Ethereum', 'ETH'].includes(tag));
          if (activeFilter === 'stocks')
            return item.tags.some((tag) => ['Stocks', 'Market', 'NASDAQ', 'S&P', 'Tech'].includes(tag));
          if (activeFilter === 'forex')
            return item.tags.some((tag) => ['Forex', 'USD', 'EUR', 'GBP', 'JPY', 'CNY'].includes(tag));
          return true;
        });
        if (filtered.length > 0) {
          allNews.push({ date: dateStr, news: filtered });
        }
      }
    });

    return allNews;
  };

  // Render titles list
  const renderTitlesList = (): (NewsItem & { dateStr: string })[] => {
    const allTitles: (NewsItem & { dateStr: string })[] = [];
    const sortedDates = Object.keys(newsData).sort((a, b) => b.localeCompare(a));

    sortedDates.forEach((dateStr) => {
      const dayNews = newsData[dateStr] || [];
      dayNews.forEach((item) => {
        if (
          activeFilter === 'all' ||
          (activeFilter === 'important' && item.important) ||
          (activeFilter === 'crypto' && item.tags.some((tag) => ['Bitcoin', 'Crypto', 'BTC', 'Ethereum', 'ETH'].includes(tag))) ||
          (activeFilter === 'stocks' && item.tags.some((tag) => ['Stocks', 'Market', 'NASDAQ', 'S&P', 'Tech'].includes(tag))) ||
          (activeFilter === 'forex' && item.tags.some((tag) => ['Forex', 'USD', 'EUR', 'GBP', 'JPY', 'CNY'].includes(tag)))
        ) {
          allTitles.push({ ...item, dateStr });
        }
      });
    });

    return allTitles;
  };

  // Scroll to news
  const scrollToNews = (newsId: string, dateStr: string) => {
    setActiveTitleId(newsId);
    const targetGroup = newsListRef.current?.querySelector(`[data-date="${dateStr}"]`) as HTMLElement;
    if (targetGroup) {
      setIsScrolling(true);
      targetGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        targetGroup.style.background = `${theme.brand.primary}08`;
        targetGroup.style.borderLeft = `3px solid ${theme.brand.primary}50`;
        setTimeout(() => {
          targetGroup.style.background = '';
          targetGroup.style.borderLeft = '';
        }, 1500);
        setIsScrolling(false);
      }, 500);
    }

    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    setSelectedDate(date);
  };

  // Article dialog
  const openArticleInEnglish = (articleId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedArticleId(articleId);
    setDialogDefaultLanguage('en');
    setDetailDialogOpen(true);
  };

  const openArticleInChinese = (articleId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedArticleId(articleId);
    setDialogDefaultLanguage('zh');
    setDetailDialogOpen(true);
  };

  const handleOpenArticle = (articleId: string) => {
    setSelectedArticleId(articleId);
    setDetailDialogOpen(true);
  };

  const handleCloseArticle = () => {
    setDetailDialogOpen(false);
    setSelectedArticleId(null);
    setDialogDefaultLanguage(null);
  };

  // AI Analysis
  const analyzeNews = async (newsItem: NewsItem, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    const newsId = newsItem.id;

    if (analysisResults[newsId]?.loading) return;

    if (expandedAnalysis === newsId) {
      setExpandedAnalysis(null);
      return;
    }

    if (analysisResults[newsId]?.analysis) {
      setExpandedAnalysis(newsId);
      return;
    }

    setAnalysisResults((prev) => ({
      ...prev,
      [newsId]: { loading: true, streamContent: '', error: null },
    }));
    setExpandedAnalysis(newsId);

    analyzeNewsStream(
      newsItem.headline || newsItem.title_zh || newsItem.title || '',
      newsItem.summary || newsItem.content_zh || newsItem.content || '',
      newsItem.source,
      newsItem.id,
      (chunk) => {
        setAnalysisResults((prev) => ({
          ...prev,
          [newsId]: { ...prev[newsId], streamContent: (prev[newsId]?.streamContent || '') + chunk },
        }));
      },
      (impact, analysis) => {
        setAnalysisResults((prev) => ({
          ...prev,
          [newsId]: {
            loading: false,
            impact: impact as 'positive' | 'negative' | 'neutral',
            analysis,
            streamContent: '',
            error: null,
          },
        }));
      },
      (error) => {
        setAnalysisResults((prev) => ({
          ...prev,
          [newsId]: { loading: false, error, streamContent: '' },
        }));
      }
    );
  };

  // Feedback
  const submitFeedback = async (articleId: string, feedbackType: 'like' | 'dislike') => {
    const currentFeedback = feedbackState[articleId]?.userFeedback;
    const newFeedback = currentFeedback === feedbackType ? null : feedbackType;

    setFeedbackState((prev) => ({
      ...prev,
      [articleId]: { userFeedback: newFeedback },
    }));
  };

  // Scroll handler
  const updateCalendarByScroll = useCallback(() => {
    if (isScrolling || !newsListRef.current) return;

    const newsListElement = newsListRef.current;
    const newsGroups = newsListElement.querySelectorAll('[data-date]');
    const scrollTop = newsListElement.scrollTop;
    const scrollHeight = newsListElement.scrollHeight;
    const clientHeight = newsListElement.clientHeight;
    const viewportTop = scrollTop + 100;

    // Load more at top
    if (scrollTop < 200 && !isLoadingMore) {
      const sortedDates = Object.keys(newsData).sort((a, b) => b.localeCompare(a));
      if (sortedDates.length > 0) {
        const firstDate = sortedDates[0];
        const [year, month] = firstDate.split('-').map(Number);
        let targetYear = year;
        let targetMonth = month - 1;

        if (targetMonth === 11) {
          targetYear = year + 1;
          targetMonth = 0;
        } else {
          targetMonth = targetMonth + 1;
        }

        const checkKey = `${targetYear}-${targetMonth}`;
        if (!loadedMonths.has(checkKey)) {
          loadMonthlyNews(targetYear, targetMonth, true);
        }
      }
    }

    // Load more at bottom
    if (scrollHeight - scrollTop - clientHeight < 200 && !isLoadingMore) {
      const sortedDates = Object.keys(newsData).sort((a, b) => b.localeCompare(a));
      if (sortedDates.length > 0) {
        const lastDate = sortedDates[sortedDates.length - 1];
        const [year, month] = lastDate.split('-').map(Number);
        let targetYear = year;
        let targetMonth = month - 1;

        if (targetMonth === 0) {
          targetYear = year - 1;
          targetMonth = 11;
        } else {
          targetMonth = targetMonth - 1;
        }

        const checkKey = `${targetYear}-${targetMonth}`;
        if (!loadedMonths.has(checkKey)) {
          loadMonthlyNews(targetYear, targetMonth, true);
        }
      }
    }

    // Update calendar highlight
    let currentGroup: Element | null = null;
    newsGroups.forEach((group) => {
      const groupTop = (group as HTMLElement).offsetTop - newsListElement.offsetTop;
      if (groupTop <= viewportTop) {
        currentGroup = group;
      }
    });

    if (currentGroup) {
      const dateStr = (currentGroup as HTMLElement).dataset.date;
      if (dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);

        if (dateStr !== formatDate(selectedDate)) {
          setSelectedDate(date);
          if (year !== currentYear || month - 1 !== currentMonth) {
            setCurrentYear(year);
            setCurrentMonth(month - 1);
          }
        }
      }
    }
  }, [isScrolling, selectedDate, newsData, loadedMonths, isLoadingMore, loadMonthlyNews, currentYear, currentMonth]);

  // Setup scroll listener
  useEffect(() => {
    const newsListElement = newsListRef.current;
    if (!newsListElement) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      if (isScrolling) return;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateCalendarByScroll, 100);
    };

    newsListElement.addEventListener('scroll', handleScroll);
    return () => {
      newsListElement.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [updateCalendarByScroll, isScrolling]);

  const filteredNews = getFilteredNews();
  const titlesList = renderTitlesList();
  const calendarDays = renderCalendar(currentYear, currentMonth);

  return (
    <Box
      sx={{
        height: 'calc(100vh - 48px)',
        width: 'calc(100% + 48px)',
        display: 'flex',
        bgcolor: theme.background.primary,
        color: theme.text.primary,
        overflow: 'hidden',
        m: -3,
        ml: -3,
      }}
    >
      {/* Left Calendar Panel */}
      <Box
        sx={{
          width: '340px',
          minWidth: '340px',
          bgcolor: theme.background.secondary,
          borderRight: `1px solid ${theme.border.default}`,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Year/Month Selector */}
        <Box
          sx={{
            p: 2.5,
            bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            borderBottom: `1px solid ${theme.border.default}`,
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography
              sx={{
                fontSize: 20,
                fontWeight: 500,
                color: theme.text.primary,
                cursor: 'pointer',
                transition: 'color 0.3s ease',
                '&:hover': { color: theme.brand.primary },
              }}
            >
              {currentYear}/{currentMonth + 1}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton
                size="small"
                onClick={previousMonth}
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  border: `1px solid ${theme.border.subtle}`,
                  borderRadius: 1,
                  color: theme.text.muted,
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', color: theme.text.secondary },
                }}
              >
                <ChevronLeftIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={todayMonth}
                title="Today"
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  border: `1px solid ${theme.border.subtle}`,
                  borderRadius: 1,
                  color: theme.text.muted,
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', color: theme.text.secondary },
                }}
              >
                <TodayIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={nextMonth}
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  border: `1px solid ${theme.border.subtle}`,
                  borderRadius: 1,
                  color: theme.text.muted,
                  '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', color: theme.text.secondary },
                }}
              >
                <ChevronRightIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <FormControl size="small">
              <Select
                value={currentYear}
                onChange={handleYearChange}
                sx={{
                  bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${theme.border.subtle}`,
                  borderRadius: 1,
                  color: theme.text.secondary,
                  fontSize: 14,
                  '& .MuiSelect-icon': { color: theme.text.muted },
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                }}
              >
                {[2026, 2025, 2024, 2023, 2022, 2021].map((year) => (
                  <MenuItem key={year} value={year}>{year}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small">
              <Select
                value={currentMonth}
                onChange={handleMonthChange}
                sx={{
                  bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${theme.border.subtle}`,
                  borderRadius: 1,
                  color: theme.text.secondary,
                  fontSize: 14,
                  '& .MuiSelect-icon': { color: theme.text.muted },
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                }}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <MenuItem key={i} value={i}>{i + 1}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        {/* Calendar Grid */}
        <Box sx={{ p: 2.5, flexShrink: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mb: 1 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Box key={day} sx={{ textAlign: 'center', fontSize: 11, color: theme.text.muted, p: 1, fontWeight: 600, textTransform: 'uppercase' }}>
                {day}
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
            {calendarDays.map((dayData, index) => {
              const isSelected = dayData.date.toDateString() === selectedDate.toDateString();
              const hasNewsData = hasNews(dayData.dateStr);
              const newsCount = getNewsCount(dayData.dateStr);

              return (
                <Box
                  key={index}
                  onClick={() => selectDate(dayData.date)}
                  sx={{
                    aspectRatio: '1',
                    bgcolor: isSelected ? `${theme.brand.primary}15` : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                    border: `1px solid ${isSelected ? `${theme.brand.primary}30` : theme.border.subtle}`,
                    borderRadius: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    opacity: dayData.isOtherMonth ? 0.3 : 1,
                    '&:hover': {
                      bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                      borderColor: theme.border.hover,
                      transform: 'scale(1.05)',
                    },
                    '&::after': hasNewsData ? {
                      content: '""',
                      position: 'absolute',
                      bottom: 4,
                      width: 4,
                      height: 4,
                      bgcolor: theme.brand.primary,
                      borderRadius: '50%',
                    } : undefined,
                  }}
                >
                  <Typography sx={{ fontSize: 14, color: theme.text.secondary, fontWeight: 500 }}>
                    {dayData.day}
                  </Typography>
                  {newsCount > 0 && (
                    <Typography sx={{ fontSize: 10, color: theme.brand.primary, mt: 0.25 }}>
                      {newsCount}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* News Titles Section */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            bgcolor: isDark ? 'rgba(30,30,30,0.6)' : 'rgba(0,0,0,0.02)',
            borderTop: `2px solid ${theme.brand.primary}30`,
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': { background: `${theme.brand.primary}50`, borderRadius: 3 },
          }}
        >
          <Box
            sx={{
              p: '16px 20px',
              bgcolor: isDark ? 'rgba(40,40,40,0.8)' : 'rgba(0,0,0,0.04)',
              borderBottom: `1px solid ${theme.border.default}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              zIndex: 10,
            }}
          >
            <Typography sx={{ fontSize: 12, textTransform: 'uppercase', color: theme.text.muted, fontWeight: 600, letterSpacing: 0.5 }}>
              Headlines
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                color: theme.brand.primary,
                bgcolor: `${theme.brand.primary}20`,
                px: 1.25,
                py: 0.375,
                borderRadius: 1.5,
                fontWeight: 500,
              }}
            >
              {isLoading ? 'Loading...' : `${titlesList.length} articles`}
            </Typography>
          </Box>
          <Box sx={{ p: 1 }}>
            {isLoading ? (
              <Typography sx={{ textAlign: 'center', color: theme.text.muted, p: '30px 20px', fontSize: 12 }}>
                Loading headlines...
              </Typography>
            ) : error ? (
              <Typography sx={{ textAlign: 'center', color: theme.text.muted, p: '30px 20px', fontSize: 12 }}>
                Failed to load
              </Typography>
            ) : titlesList.length > 0 ? (
              titlesList.map((news) => {
                const [, month, day] = news.dateStr.split('-');
                const dateLabel = `${parseInt(month)}/${parseInt(day)} · ${news.time}`;

                return (
                  <Box
                    key={`${news.dateStr}-${news.id}`}
                    onClick={() => scrollToNews(news.id, news.dateStr)}
                    sx={{
                      p: 1.75,
                      mb: 1.25,
                      bgcolor: activeTitleId === news.id ? `${theme.brand.primary}15` : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${activeTitleId === news.id ? `${theme.brand.primary}40` : theme.border.subtle}`,
                      borderRadius: 1.25,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        bgcolor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                        borderColor: `${theme.brand.primary}30`,
                        transform: 'translateX(5px)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                      <Typography sx={{ fontSize: 11, color: theme.text.muted, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        {dateLabel}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {news.important && (
                          <Typography
                            sx={{
                              fontSize: 9,
                              px: 0.75,
                              py: 0.25,
                              borderRadius: 0.5,
                              fontWeight: 500,
                              bgcolor: 'rgba(255, 107, 107, 0.15)',
                              border: '1px solid rgba(255, 107, 107, 0.3)',
                              color: 'rgba(255, 107, 107, 0.9)',
                            }}
                          >
                            Important
                          </Typography>
                        )}
                        {news.source && (
                          <Typography
                            sx={{
                              fontSize: 9,
                              px: 0.75,
                              py: 0.25,
                              borderRadius: 0.5,
                              fontWeight: 500,
                              bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                              border: `1px solid ${theme.border.subtle}`,
                              color: theme.text.muted,
                            }}
                          >
                            {news.source}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Typography sx={{ fontSize: 13, color: theme.text.secondary, lineHeight: 1.5, fontWeight: 400 }}>
                      {news.headline}
                    </Typography>
                  </Box>
                );
              })
            ) : (
              <Typography sx={{ textAlign: 'center', color: theme.text.muted, p: '30px 20px', fontSize: 12 }}>
                No headlines
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      {/* Right News Panel */}
      <Box sx={{ flex: 1, bgcolor: theme.background.primary, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* News Header */}
        <Box
          sx={{
            p: '20px 24px',
            bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
            borderBottom: `1px solid ${theme.border.default}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: theme.text.primary, fontFamily: 'Times New Roman, serif' }}>
              Market News
            </Typography>
            <Typography sx={{ fontSize: 14, color: theme.text.muted, mt: 0.5 }}>
              {currentYear}/{currentMonth + 1}
            </Typography>
          </Box>
        </Box>

        {/* News List */}
        <Box
          ref={newsListRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: 2.5,
            scrollBehavior: 'smooth',
          }}
        >
          {isLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 7.5, color: theme.text.muted }}>
              <CircularProgress sx={{ mb: 2, color: theme.brand.primary }} />
              <Typography sx={{ fontSize: 16 }}>Loading news...</Typography>
            </Box>
          ) : error ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 7.5, color: theme.text.muted }}>
              <Typography sx={{ fontSize: 48, mb: 2, opacity: 0.5 }}>❌</Typography>
              <Typography sx={{ fontSize: 16 }}>{error}</Typography>
            </Box>
          ) : filteredNews.length > 0 ? (
            <>
              {isLoadingMore && (
                <Typography sx={{ textAlign: 'center', p: 2.5, color: theme.text.muted, fontSize: 14 }}>
                  Loading more...
                </Typography>
              )}
              {filteredNews.map((dateGroup) => (
                <Box key={dateGroup.date} data-date={dateGroup.date} sx={{ mb: 4 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      m: '24px 0 16px 0',
                      position: 'sticky',
                      top: 0,
                      bgcolor: theme.background.primary,
                      zIndex: 5,
                      py: 1,
                    }}
                  >
                    <Typography
                      sx={{
                        background: `linear-gradient(135deg, ${theme.brand.primary}15 0%, ${theme.brand.primary}30 100%)`,
                        border: `1px solid ${theme.brand.primary}30`,
                        px: 2,
                        py: 0.75,
                        borderRadius: 2.5,
                        fontSize: 13,
                        color: theme.brand.primary,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDateLabel(dateGroup.date)}
                    </Typography>
                    <Box sx={{ flex: 1, height: 1, bgcolor: theme.border.subtle, ml: 2 }} />
                  </Box>

                  {dateGroup.news.map((newsItem) => (
                    <Box
                      key={newsItem.id}
                      onClick={() => handleOpenArticle(newsItem.id)}
                      sx={{
                        bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        border: `1px solid ${theme.border.subtle}`,
                        borderRadius: 1.5,
                        p: 2.5,
                        mb: 2,
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                          borderColor: theme.border.hover,
                          transform: 'translateX(4px)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 24,
                              height: 24,
                              bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                              borderRadius: 0.75,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                            }}
                          >
                            {newsItem.source === 'Reuters' ? '📰' :
                             newsItem.source === 'Bloomberg' ? '📊' :
                             newsItem.source === 'WSJ' ? '💼' :
                             newsItem.source === 'FT' ? '🏦' : '📋'}
                          </Box>
                          <Typography sx={{ fontSize: 13, color: theme.text.muted }}>
                            {newsItem.source}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: 12, color: theme.text.muted }}>
                          {newsItem.time}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: 18, fontWeight: 500, color: theme.text.primary, mb: 1, lineHeight: 1.4 }}>
                        {newsItem.title_zh || newsItem.headline}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 14,
                          color: theme.text.secondary,
                          lineHeight: 1.8,
                          mb: 1.5,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {newsItem.content_zh || newsItem.summary}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {newsItem.important && (
                          <Chip
                            label="Important"
                            size="small"
                            sx={{
                              bgcolor: 'rgba(255, 107, 107, 0.1)',
                              borderColor: 'rgba(255, 107, 107, 0.3)',
                              color: 'rgba(255, 107, 107, 0.9)',
                              border: '1px solid',
                            }}
                          />
                        )}
                        {newsItem.tags.map((tag, index) => (
                          <Chip
                            key={index}
                            label={tag}
                            size="small"
                            sx={{
                              bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                              border: `1px solid ${theme.border.subtle}`,
                              color: theme.text.muted,
                              fontSize: 11,
                            }}
                          />
                        ))}
                        <Box sx={{ ml: 'auto', display: 'flex', gap: 0.75 }}>
                          <Button
                            size="small"
                            onClick={(e) => openArticleInEnglish(newsItem.id, e)}
                            sx={{
                              px: 1.5,
                              py: 0.5,
                              minWidth: 'auto',
                              fontSize: 11,
                              bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                              border: `1px solid ${theme.border.subtle}`,
                              borderRadius: 1.5,
                              color: theme.text.secondary,
                              textTransform: 'none',
                              '&:hover': {
                                bgcolor: `${theme.brand.primary}15`,
                                borderColor: `${theme.brand.primary}30`,
                                color: theme.brand.primary,
                              },
                            }}
                          >
                            EN
                          </Button>
                          <Button
                            size="small"
                            onClick={(e) => openArticleInChinese(newsItem.id, e)}
                            sx={{
                              px: 1.5,
                              py: 0.5,
                              minWidth: 'auto',
                              fontSize: 11,
                              bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                              border: `1px solid ${theme.border.subtle}`,
                              borderRadius: 1.5,
                              color: theme.text.secondary,
                              textTransform: 'none',
                              '&:hover': {
                                bgcolor: `${theme.brand.primary}15`,
                                borderColor: `${theme.brand.primary}30`,
                                color: theme.brand.primary,
                              },
                            }}
                          >
                            CN
                          </Button>
                          <Button
                            size="small"
                            onClick={(e) => analyzeNews(newsItem, e)}
                            startIcon={<AIIcon sx={{ fontSize: 14 }} />}
                            sx={{
                              px: 1.5,
                              py: 0.5,
                              minWidth: 'auto',
                              fontSize: 11,
                              background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.1) 0%, rgba(75, 0, 130, 0.1) 100%)',
                              border: '1px solid rgba(138, 43, 226, 0.2)',
                              borderRadius: 1.5,
                              color: '#c8a2ff',
                              textTransform: 'none',
                              '&:hover': {
                                background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2) 0%, rgba(75, 0, 130, 0.15) 100%)',
                                borderColor: 'rgba(138, 43, 226, 0.4)',
                              },
                            }}
                          >
                            AI
                          </Button>
                        </Box>
                      </Box>

                      {/* AI Analysis Card */}
                      {expandedAnalysis === newsItem.id && (
                        <Box
                          onClick={(e) => e.stopPropagation()}
                          sx={{
                            mt: 2,
                            background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.08) 0%, rgba(75, 0, 130, 0.08) 100%)',
                            border: '1px solid rgba(138, 43, 226, 0.2)',
                            borderRadius: 1.5,
                            p: 2.5,
                            animation: 'fadeIn 0.3s ease-in-out',
                            '@keyframes fadeIn': {
                              from: { opacity: 0, transform: 'translateY(-10px)' },
                              to: { opacity: 1, transform: 'translateY(0)' },
                            },
                          }}
                        >
                          {analysisResults[newsItem.id]?.loading ? (
                            <Box>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1.5,
                                  mb: 2,
                                  pb: 1.5,
                                  borderBottom: '1px solid rgba(200, 162, 255, 0.15)',
                                }}
                              >
                                <CircularProgress size={20} sx={{ color: '#c8a2ff' }} />
                                <Typography sx={{ fontSize: 14, color: theme.text.muted, fontWeight: 500 }}>
                                  AI analyzing...
                                </Typography>
                              </Box>
                              {analysisResults[newsItem.id]?.streamContent && (
                                <Typography
                                  sx={{
                                    color: theme.text.primary,
                                    fontSize: 14,
                                    lineHeight: 1.8,
                                    whiteSpace: 'pre-wrap',
                                    minHeight: 60,
                                  }}
                                >
                                  {analysisResults[newsItem.id].streamContent}
                                  <Box
                                    component="span"
                                    sx={{
                                      display: 'inline-block',
                                      width: 8,
                                      height: 16,
                                      bgcolor: '#c8a2ff',
                                      ml: 0.25,
                                      animation: 'blink 1s infinite',
                                      '@keyframes blink': {
                                        '0%, 49%': { opacity: 1 },
                                        '50%, 100%': { opacity: 0 },
                                      },
                                    }}
                                  />
                                </Typography>
                              )}
                            </Box>
                          ) : analysisResults[newsItem.id]?.error ? (
                            <Typography sx={{ p: 2.5, textAlign: 'center', color: '#f44336', fontSize: 14 }}>
                              {analysisResults[newsItem.id].error}
                            </Typography>
                          ) : analysisResults[newsItem.id]?.analysis ? (
                            <Box>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1.5,
                                  mb: 2,
                                  pb: 1.5,
                                  borderBottom: '1px solid rgba(200, 162, 255, 0.15)',
                                }}
                              >
                                <Typography sx={{ fontSize: 14, color: theme.text.muted, fontWeight: 500 }}>
                                  Impact:
                                </Typography>
                                <Chip
                                  label={
                                    analysisResults[newsItem.id].impact === 'positive' ? 'Positive' :
                                    analysisResults[newsItem.id].impact === 'negative' ? 'Negative' : 'Neutral'
                                  }
                                  size="small"
                                  sx={{
                                    bgcolor:
                                      analysisResults[newsItem.id].impact === 'positive' ? 'rgba(76, 175, 80, 0.2)' :
                                      analysisResults[newsItem.id].impact === 'negative' ? 'rgba(244, 67, 54, 0.2)' :
                                      'rgba(158, 158, 158, 0.2)',
                                    color:
                                      analysisResults[newsItem.id].impact === 'positive' ? '#4caf50' :
                                      analysisResults[newsItem.id].impact === 'negative' ? '#f44336' : '#9e9e9e',
                                    border: `1px solid ${
                                      analysisResults[newsItem.id].impact === 'positive' ? 'rgba(76, 175, 80, 0.4)' :
                                      analysisResults[newsItem.id].impact === 'negative' ? 'rgba(244, 67, 54, 0.4)' :
                                      'rgba(158, 158, 158, 0.4)'
                                    }`,
                                    fontSize: 13,
                                    fontWeight: 600,
                                  }}
                                />
                              </Box>
                              <Typography
                                sx={{
                                  color: theme.text.primary,
                                  fontSize: 14,
                                  lineHeight: 1.8,
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {analysisResults[newsItem.id].analysis}
                              </Typography>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  mt: 2.5,
                                  pt: 2,
                                  borderTop: '1px solid rgba(200, 162, 255, 0.15)',
                                }}
                              >
                                <Typography sx={{ fontSize: 13, color: theme.text.muted, fontWeight: 500 }}>
                                  Feedback:
                                </Typography>
                                <IconButton
                                  size="small"
                                  onClick={() => submitFeedback(newsItem.id, 'like')}
                                  sx={{
                                    p: 0.75,
                                    color: feedbackState[newsItem.id]?.userFeedback === 'like' ? '#5eddac' : theme.text.muted,
                                    bgcolor: feedbackState[newsItem.id]?.userFeedback === 'like' ? 'rgba(94, 221, 172, 0.1)' : 'transparent',
                                    borderRadius: 0.5,
                                  }}
                                >
                                  <ThumbUpIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => submitFeedback(newsItem.id, 'dislike')}
                                  sx={{
                                    p: 0.75,
                                    color: feedbackState[newsItem.id]?.userFeedback === 'dislike' ? '#f44336' : theme.text.muted,
                                    bgcolor: feedbackState[newsItem.id]?.userFeedback === 'dislike' ? 'rgba(244, 67, 54, 0.1)' : 'transparent',
                                    borderRadius: 0.5,
                                  }}
                                >
                                  <ThumbDownIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Box>
                            </Box>
                          ) : null}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              ))}
              {isLoadingMore && (
                <Typography sx={{ textAlign: 'center', p: 2.5, color: theme.text.muted, fontSize: 14 }}>
                  Loading more...
                </Typography>
              )}
            </>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 7.5, color: theme.text.muted }}>
              <Typography sx={{ fontSize: 48, mb: 2, opacity: 0.5 }}>📰</Typography>
              <Typography sx={{ fontSize: 16 }}>
                {activeFilter === 'all' ? 'No news this month' : `No ${activeFilter} news`}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Article Detail Dialog */}
      <ArticleDetailDialog
        open={detailDialogOpen}
        onClose={handleCloseArticle}
        articleId={selectedArticleId}
        defaultLanguage={dialogDefaultLanguage}
      />
    </Box>
  );
}
