import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Grid,
  Chip,
  IconButton,
  Button,
  Divider,
} from '@mui/material';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Event as EventIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  Star as StarIcon,
  EmojiObjects as AIIcon,
} from '@mui/icons-material';
import { useTheme } from '../theme/ThemeProvider';
import LoadingDots from '../components/LoadingDots';
import { getMonthlyEventsEnriched, getEventStatistics } from '../api/economicCalendar';
import { analyzeEventStream } from '../api/news';
import { EconomicEvent, EventsByDate, EventStatistics, EventFilterType, EventAnalysisResult } from '../types/economicCalendar';
import { useResponsive } from '../hooks/useResponsive';

export default function FOMCCalendarPage() {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const { isMobile, isSmallScreen } = useResponsive();
  const isCompact = isMobile || isSmallScreen;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<EventsByDate>({});
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EventStatistics | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<EventFilterType>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // AI analysis state
  const [analysisResults, setAnalysisResults] = useState<{ [eventId: string]: EventAnalysisResult }>({});
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  // Fetch monthly events
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await getMonthlyEventsEnriched(year, month, selectedFilter);
        if (response.success) {
          setEvents(response.data);
          if (response.fmp_status === 'success') {
            console.log(`FMP data synced: ${response.enriched_count} events`);
          }
        }

        const statsResponse = await getEventStatistics();
        if (statsResponse.success) {
          setStats(statsResponse.data);
        }
      } catch (error) {
        console.error('Failed to fetch events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [year, month, selectedFilter]);

  // Navigation
  const goToPreviousMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setTimeout(() => {
      const dateElement = document.getElementById(`date-group-${dateStr}`);
      if (dateElement && timelineRef.current) {
        dateElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // AI Analysis
  const analyzeEvent = async (event: EconomicEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const eventId = event.id || `${event.title}_${event.start_date}`;

    if (expandedAnalysis === eventId) {
      setExpandedAnalysis(null);
      return;
    }

    if (analysisResults[eventId]?.analysis) {
      setExpandedAnalysis(eventId);
      return;
    }

    setAnalysisResults((prev) => ({
      ...prev,
      [eventId]: { loading: true, error: null, streamContent: '' },
    }));
    setExpandedAnalysis(eventId);

    analyzeEventStream(
      event.title,
      event.start_date,
      event.event_type || 'economic_data',
      event.description,
      event.actual?.toString() || event.actual_value?.toString(),
      event.forecast?.toString() || event.forecast_value?.toString(),
      event.previous?.toString() || event.previous_value?.toString(),
      (chunk) => {
        setAnalysisResults((prev) => ({
          ...prev,
          [eventId]: { ...prev[eventId], streamContent: (prev[eventId]?.streamContent || '') + chunk },
        }));
      },
      (impact, analysis) => {
        setAnalysisResults((prev) => ({
          ...prev,
          [eventId]: {
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
          [eventId]: { loading: false, error, streamContent: '' },
        }));
      }
    );
  };

  // Calendar grid rendering
  const renderCalendar = () => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = new Array(7).fill(null);
    let dayCounter = 1;

    for (let i = startDayOfWeek; i < 7 && dayCounter <= daysInMonth; i++) {
      currentWeek[i] = dayCounter++;
    }
    weeks.push(currentWeek);

    while (dayCounter <= daysInMonth) {
      currentWeek = new Array(7).fill(null);
      for (let i = 0; i < 7 && dayCounter <= daysInMonth; i++) {
        currentWeek[i] = dayCounter++;
      }
      weeks.push(currentWeek);
    }

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
    const todayDate = today.getDate();

    return (
      <Box sx={{ p: 1.5 }}>
        <Grid container spacing={0.5}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <Grid item xs={12/7} key={day}>
              <Box sx={{ textAlign: 'center', p: '8px 4px', fontSize: 12, color: theme.text.muted, fontWeight: 600 }}>
                {day}
              </Box>
            </Grid>
          ))}
          {weeks.map((week, weekIdx) =>
            week.map((day, dayIdx) => {
              if (day === null) {
                return <Grid item xs={12/7} key={`${weekIdx}-${dayIdx}`}><Box sx={{ p: 1 }} /></Grid>;
              }

              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasEvent = events[dateStr] && events[dateStr].length > 0;
              const isToday = isCurrentMonth && day === todayDate;
              const isSelected = selectedDate === dateStr;

              return (
                <Grid item xs={12/7} key={`${weekIdx}-${dayIdx}`}>
                  <Box
                    onClick={() => hasEvent && handleDateClick(dateStr)}
                    sx={{
                      textAlign: 'center',
                      p: '8px 4px',
                      fontSize: 13,
                      color: hasEvent ? theme.brand.primary : theme.text.secondary,
                      fontWeight: hasEvent ? 600 : 400,
                      position: 'relative',
                      cursor: hasEvent ? 'pointer' : 'default',
                      borderRadius: 1,
                      transition: 'all 0.2s',
                      bgcolor: isSelected ? `${theme.brand.primary}40` : isToday ? `${theme.brand.primary}20` : 'transparent',
                      '&:hover': hasEvent ? { bgcolor: `${theme.brand.primary}15`, color: theme.brand.primary } : {},
                      '&::after': hasEvent ? {
                        content: '""',
                        position: 'absolute',
                        bottom: 4,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        bgcolor: theme.brand.primary,
                      } : undefined,
                    }}
                  >
                    {day}
                  </Box>
                </Grid>
              );
            })
          )}
        </Grid>
      </Box>
    );
  };

  // Event list (left panel)
  const renderEventList = () => {
    const sortedDates = Object.keys(events).sort();
    if (sortedDates.length === 0) {
      return (
        <Typography sx={{ textAlign: 'center', p: 2.5, color: theme.text.muted, fontSize: 14 }}>
          No events this month
        </Typography>
      );
    }

    return sortedDates.map((dateStr) => {
      const dayEvents = events[dateStr];
      return dayEvents.map((event, idx) => (
        <Box
          key={`${dateStr}-${idx}`}
          onClick={() => handleDateClick(dateStr)}
          sx={{
            p: '10px 12px',
            mb: 0.75,
            bgcolor: selectedDate === dateStr ? `${theme.brand.primary}20` : isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            border: `1px solid ${theme.border.subtle}`,
            borderRadius: 1,
            cursor: 'pointer',
            transition: 'all 0.2s',
            '&:hover': {
              bgcolor: `${theme.brand.primary}15`,
              borderColor: `${theme.brand.primary}30`,
              transform: 'translateX(4px)',
            },
          }}
        >
          <Typography sx={{ fontSize: 11, color: theme.text.muted, mb: 0.5 }}>
            {new Date(event.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Typography>
          <Typography sx={{ fontSize: 13, color: theme.text.primary, fontWeight: 500 }}>{event.title}</Typography>
        </Box>
      ));
    });
  };

  // Timeline (right panel)
  const renderTimeline = () => {
    const sortedDates = Object.keys(events).sort().reverse();

    if (sortedDates.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', p: 7.5, color: theme.text.muted }}>
          <EventIcon sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
          <Typography variant="h6">No events found</Typography>
          <Typography variant="body2">Try selecting a different month or filter</Typography>
        </Box>
      );
    }

    return sortedDates.map((dateStr) => {
      const dayEvents = events[dateStr];
      const dateObj = new Date(dateStr);
      const formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const isSelectedDateGroup = selectedDate === dateStr;

      return (
        <Box
          key={dateStr}
          id={`date-group-${dateStr}`}
          sx={{
            mb: 3,
            bgcolor: isSelectedDateGroup ? `${theme.brand.primary}08` : 'transparent',
            borderRadius: isSelectedDateGroup ? 1.5 : 0,
            p: isSelectedDateGroup ? 2 : 0,
          }}
        >
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 600,
              color: theme.brand.primary,
              mb: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <EventIcon fontSize="small" />
            {formattedDate}
          </Typography>

          {dayEvents.map((event, idx) => {
            const eventId = event.id || `${event.title}_${event.start_date}`;

            return (
              <Box
                key={idx}
                sx={{
                  mb: 1.5,
                  p: 2,
                  bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${theme.border.subtle}`,
                  borderRadius: 1.5,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    borderColor: `${theme.brand.primary}30`,
                    transform: 'translateX(4px)',
                    boxShadow: `0 4px 12px ${theme.brand.primary}25`,
                  },
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.text.primary, flex: 1 }}>{event.title}</Typography>
                  <Box
                    sx={{
                      fontSize: 11,
                      px: 1.25,
                      py: 0.5,
                      borderRadius: 1.5,
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      ...(event.event_type === 'fomc' && {
                        bgcolor: `${theme.brand.primary}30`,
                        color: theme.brand.primary,
                        border: `1px solid ${theme.brand.primary}50`,
                      }),
                      ...(event.event_type === 'earnings' && {
                        bgcolor: 'rgba(76, 175, 80, 0.2)',
                        color: '#4caf50',
                        border: '1px solid rgba(76, 175, 80, 0.3)',
                      }),
                      ...(event.event_type !== 'fomc' && event.event_type !== 'earnings' && {
                        bgcolor: 'rgba(255, 152, 0, 0.2)',
                        color: '#ff9800',
                        border: '1px solid rgba(255, 152, 0, 0.3)',
                      }),
                    }}
                  >
                    {event.event_type === 'fomc' ? 'FOMC' :
                     event.event_type === 'earnings' ? 'Earnings' : 'Economic Data'}
                  </Box>
                </Box>

                {event.description && (
                  <Typography sx={{ fontSize: 13, color: theme.text.secondary, mb: 1 }}>{event.description}</Typography>
                )}

                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {event.importance && (
                    <Box
                      sx={{
                        fontSize: 10,
                        px: 1,
                        py: 0.25,
                        borderRadius: 1.25,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        ...(event.importance === 'critical' && { bgcolor: 'rgba(244, 67, 54, 0.2)', color: '#f44336' }),
                        ...(event.importance === 'high' && { bgcolor: 'rgba(255, 152, 0, 0.2)', color: '#ff9800' }),
                        ...(event.importance === 'medium' && { bgcolor: 'rgba(255, 235, 59, 0.2)', color: '#ffc107' }),
                      }}
                    >
                      {event.importance}
                    </Box>
                  )}

                  {event.event_type === 'fomc' && (
                    <>
                      {event.has_press_conference && (
                        <Typography sx={{ fontSize: 12, color: theme.text.muted, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          Press Conference
                        </Typography>
                      )}
                      {event.has_economic_projections && (
                        <Typography sx={{ fontSize: 12, color: theme.text.muted, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          Economic Projections
                        </Typography>
                      )}
                    </>
                  )}
                </Box>

                {/* Economic Data Display */}
                {event.status === 'past' && event.event_type === 'economic_data' &&
                 (event.actual !== null || event.forecast !== null || event.previous !== null) && (
                  <Box
                    sx={{
                      mt: 1.5,
                      p: 1.5,
                      bgcolor: `${theme.brand.primary}12`,
                      borderRadius: 1,
                      border: `1px solid ${theme.brand.primary}30`,
                    }}
                  >
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.brand.primary, mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Economic Data
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      {event.actual !== null && (
                        <Box>
                          <Typography sx={{ fontSize: 11, color: theme.text.muted }}>Actual</Typography>
                          <Typography sx={{ fontSize: 16, fontWeight: 600, color: '#4caf50' }}>{event.actual}</Typography>
                        </Box>
                      )}
                      {event.forecast !== null && (
                        <Box>
                          <Typography sx={{ fontSize: 11, color: theme.text.muted }}>Forecast</Typography>
                          <Typography sx={{ fontSize: 16, fontWeight: 600, color: '#ff9800' }}>{event.forecast}</Typography>
                        </Box>
                      )}
                      {event.previous !== null && (
                        <Box>
                          <Typography sx={{ fontSize: 11, color: theme.text.muted }}>Previous</Typography>
                          <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.text.secondary }}>{event.previous}</Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                )}

                {/* AI Button */}
                <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    onClick={(e) => analyzeEvent(event, e)}
                    startIcon={<AIIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      px: 2,
                      py: 0.75,
                      fontSize: 12,
                      background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.1) 0%, rgba(75, 0, 130, 0.1) 100%)',
                      border: '1px solid rgba(138, 43, 226, 0.2)',
                      borderRadius: 1,
                      color: '#c8a2ff',
                      textTransform: 'none',
                      '&:hover': {
                        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2) 0%, rgba(75, 0, 130, 0.15) 100%)',
                        borderColor: 'rgba(138, 43, 226, 0.4)',
                      },
                    }}
                  >
                    AI Analysis
                  </Button>
                </Box>

                {/* AI Analysis Card */}
                {expandedAnalysis === eventId && (
                  <Box
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
                    {analysisResults[eventId]?.loading ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: '30px 20px', gap: 2 }}>
                        <LoadingDots text="AI analyzing" fontSize={14} color="#c8a2ff" />
                        {analysisResults[eventId]?.streamContent && (
                          <Typography sx={{ color: theme.text.primary, fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                            {analysisResults[eventId].streamContent}
                          </Typography>
                        )}
                      </Box>
                    ) : analysisResults[eventId]?.error ? (
                      <Typography sx={{ p: 2.5, textAlign: 'center', color: '#f44336', fontSize: 14 }}>
                        {analysisResults[eventId].error}
                      </Typography>
                    ) : analysisResults[eventId]?.analysis ? (
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
                              analysisResults[eventId].impact === 'positive' ? 'Positive' :
                              analysisResults[eventId].impact === 'negative' ? 'Negative' : 'Neutral'
                            }
                            size="small"
                            sx={{
                              bgcolor:
                                analysisResults[eventId].impact === 'positive' ? 'rgba(76, 175, 80, 0.2)' :
                                analysisResults[eventId].impact === 'negative' ? 'rgba(244, 67, 54, 0.2)' :
                                'rgba(158, 158, 158, 0.2)',
                              color:
                                analysisResults[eventId].impact === 'positive' ? '#4caf50' :
                                analysisResults[eventId].impact === 'negative' ? '#f44336' : '#9e9e9e',
                              border: `1px solid ${
                                analysisResults[eventId].impact === 'positive' ? 'rgba(76, 175, 80, 0.4)' :
                                analysisResults[eventId].impact === 'negative' ? 'rgba(244, 67, 54, 0.4)' :
                                'rgba(158, 158, 158, 0.4)'
                              }`,
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          />
                        </Box>
                        <Typography sx={{ color: theme.text.primary, fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                          {analysisResults[eventId].analysis}
                        </Typography>
                      </Box>
                    ) : null}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      );
    });
  };

  if (loading) {
    return (
      <Box
        sx={{
          height: isCompact ? 'calc(100vh - 48px)' : '100vh',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          gap: 2,
          bgcolor: theme.background.primary,
          m: isCompact ? -2 : -3,
        }}
      >
        <LoadingDots text="Loading events" fontSize={16} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: isCompact ? 'calc(100vh - 48px)' : '100vh',
        width: isCompact ? 'calc(100% + 32px)' : 'calc(100% + 48px)',
        display: 'flex',
        flexDirection: 'row',
        bgcolor: theme.background.primary,
        color: theme.text.primary,
        overflow: 'hidden',
        m: isCompact ? -2 : -3,
      }}
    >
      {/* Left Panel: Calendar */}
      <Box
        sx={{
          width: '340px',
          minWidth: '340px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${theme.border.default}`,
          bgcolor: theme.background.secondary,
        }}
      >
        <Box sx={{ p: 2.5, borderBottom: `1px solid ${theme.border.default}` }}>
          <Typography sx={{ fontSize: 20, fontWeight: 600, color: theme.text.primary }}>
            Economic Calendar
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: '16px 12px' }}>
          <IconButton onClick={goToPreviousMonth} size="small" sx={{ color: theme.text.secondary, '&:hover': { bgcolor: `${theme.brand.primary}15`, color: theme.brand.primary } }}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography sx={{ fontSize: 18, fontWeight: 500, color: theme.brand.primary, letterSpacing: 0.5 }}>
            {currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
          </Typography>
          <IconButton onClick={goToNextMonth} size="small" sx={{ color: theme.text.secondary, '&:hover': { bgcolor: `${theme.brand.primary}15`, color: theme.brand.primary } }}>
            <ChevronRightIcon />
          </IconButton>
        </Box>

        {renderCalendar()}

        <Divider sx={{ borderColor: theme.border.subtle }} />

        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: 1.5,
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': { background: `${theme.brand.primary}50`, borderRadius: 3 },
          }}
        >
          {renderEventList()}
        </Box>
      </Box>

      {/* Right Panel: Timeline */}
      <Box sx={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ p: '20px 24px', bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', borderBottom: `1px solid ${theme.border.default}` }}>
          <Typography sx={{ fontSize: 24, fontWeight: 600, color: theme.text.primary, mb: 1 }}>
            Economic Events Timeline
          </Typography>
          <Typography sx={{ fontSize: 14, color: theme.text.muted, mb: 2 }}>
            Track FOMC meetings, company earnings, and key economic data releases
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: 'All', icon: <AssessmentIcon fontSize="small" /> },
              { key: 'fomc', label: 'FOMC', icon: <StarIcon fontSize="small" /> },
              { key: 'employment', label: 'Employment', icon: <TrendingUpIcon fontSize="small" /> },
              { key: 'inflation', label: 'Inflation', icon: <TrendingUpIcon fontSize="small" /> },
              { key: 'consumption,gdp', label: 'Consumption & GDP', icon: <AssessmentIcon fontSize="small" /> },
            ].map((filter) => (
              <Chip
                key={filter.key}
                label={filter.label}
                onClick={() => setSelectedFilter(filter.key as EventFilterType)}
                icon={filter.icon}
                sx={{
                  bgcolor: selectedFilter === filter.key ? `${theme.brand.primary}30` : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  color: selectedFilter === filter.key ? theme.brand.primary : theme.text.secondary,
                  border: `1px solid ${selectedFilter === filter.key ? `${theme.brand.primary}50` : theme.border.subtle}`,
                  '&:hover': {
                    bgcolor: `${theme.brand.primary}20`,
                    borderColor: `${theme.brand.primary}30`,
                  },
                }}
              />
            ))}
          </Box>

          {stats && (
            <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
              <Box sx={{ flex: 1, minWidth: 150, p: '12px 16px', bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${theme.border.subtle}`, borderRadius: 1 }}>
                <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5 }}>Total Events</Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 500, color: theme.brand.primary }}>{stats.total || 0}</Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 150, p: '12px 16px', bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${theme.border.subtle}`, borderRadius: 1 }}>
                <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5 }}>FOMC Meetings</Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 500, color: theme.brand.primary }}>{stats.by_type?.fomc || 0}</Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 150, p: '12px 16px', bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${theme.border.subtle}`, borderRadius: 1 }}>
                <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5 }}>Earnings Reports</Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 500, color: theme.brand.primary }}>{stats.by_type?.earnings || 0}</Typography>
              </Box>
            </Box>
          )}
        </Box>

        <Box
          ref={timelineRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            p: 3,
            '&::-webkit-scrollbar': { width: 8 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': { background: `${theme.brand.primary}30`, borderRadius: 4 },
          }}
        >
          {renderTimeline()}
        </Box>
      </Box>
    </Box>
  );
}
