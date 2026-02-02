import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  CircularProgress,
  Chip,
  Box,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Close as CloseIcon,
  OpenInNew as OpenIcon,
  AccessTime as TimeIcon,
  Person as PersonIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { useTheme } from '../theme/ThemeProvider';
import { getArticleDetail } from '../api/news';

interface ArticleData {
  id: string;
  headline?: string;
  title?: string;
  title_zh?: string;
  content?: string;
  content_full?: string;
  content_full_zh?: string;
  keypoints?: string;
  keypoints_zh?: string;
  summary?: string;
  author?: string;
  source?: string;
  published_at?: string;
  publish_time?: string;
  url?: string;
  tags?: string[];
  important?: boolean;
  translation_status?: string;
}

interface AnalysisData {
  key_elements?: {
    event_type?: string;
    participants?: string[];
    key_data?: string[];
    time_points?: string[];
    core_views?: string[];
  };
  market_impact?: {
    impact_direction?: 'bullish' | 'bearish' | 'neutral';
    impact_level?: 'high' | 'medium' | 'low';
    impact_timeframe?: string;
    impact_mechanism?: string;
    affected_assets?: string[];
    risk_alerts?: string[];
    analysis_summary?: string;
  };
}

interface ArticleDetailDialogProps {
  open: boolean;
  onClose: () => void;
  articleId: string | null;
  defaultLanguage?: 'en' | 'zh' | null;
}

export default function ArticleDetailDialog({
  open,
  onClose,
  articleId,
  defaultLanguage = null,
}: ArticleDetailDialogProps) {
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';

  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChinese, setShowChinese] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

  useEffect(() => {
    if (open && articleId) {
      loadArticleDetail();
    }
  }, [open, articleId]);

  const loadArticleDetail = async () => {
    if (!articleId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await getArticleDetail(articleId);
      if (response.success) {
        setArticle(response.data as ArticleData);

        if (defaultLanguage === 'zh') {
          setShowChinese(true);
        } else if (defaultLanguage === 'en') {
          setShowChinese(false);
        } else {
          setShowChinese(!!(response.data.title_zh || (response.data as ArticleData).content_full_zh));
        }

        if (response.data.summary) {
          try {
            const analysis = JSON.parse(response.data.summary);
            setAnalysisData(analysis);
          } catch {
            setAnalysisData(null);
          }
        }
      } else {
        setError('Failed to load article');
      }
    } catch (err) {
      console.error('Load article error:', err);
      setError('Failed to load article, please try again');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getImpactDirectionIcon = (direction?: string) => {
    if (direction === 'bullish') return <TrendingUpIcon />;
    if (direction === 'bearish') return <TrendingDownIcon />;
    return <TrendingFlatIcon />;
  };

  const getImpactDirectionText = (direction?: string) => {
    if (direction === 'bullish') return 'Bullish';
    if (direction === 'bearish') return 'Bearish';
    return 'Neutral';
  };

  const getImpactLevelText = (level?: string) => {
    if (level === 'high') return 'High';
    if (level === 'medium') return 'Medium';
    if (level === 'low') return 'Low';
    return level || '';
  };

  const renderKeyElements = () => {
    if (!analysisData?.key_elements) return null;
    const elements = analysisData.key_elements;

    return (
      <Box
        sx={{
          bgcolor: `${theme.brand.primary}08`,
          border: `1px solid ${theme.brand.primary}25`,
          borderRadius: 2,
          p: 2.5,
          mb: 2.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, color: theme.brand.primary, fontWeight: 600 }}>
          <CheckIcon />
          Key Elements
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {elements.event_type && (
            <Box sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', p: 1.5, borderRadius: 1, border: `1px solid ${theme.border.subtle}` }}>
              <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5, fontWeight: 500, textTransform: 'uppercase' }}>
                Event Type
              </Typography>
              <Typography sx={{ fontSize: 14, color: theme.text.primary, lineHeight: 1.6 }}>
                {elements.event_type}
              </Typography>
            </Box>
          )}
          {elements.participants && elements.participants.length > 0 && (
            <Box sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', p: 1.5, borderRadius: 1, border: `1px solid ${theme.border.subtle}` }}>
              <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5, fontWeight: 500, textTransform: 'uppercase' }}>
                Main Participants
              </Typography>
              <Typography sx={{ fontSize: 14, color: theme.text.primary, lineHeight: 1.6 }}>
                {elements.participants.join(', ')}
              </Typography>
            </Box>
          )}
          {elements.key_data && elements.key_data.length > 0 && (
            <Box sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', p: 1.5, borderRadius: 1, border: `1px solid ${theme.border.subtle}` }}>
              <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5, fontWeight: 500, textTransform: 'uppercase' }}>
                Key Data
              </Typography>
              <Box>
                {elements.key_data.map((data, i) => (
                  <Typography key={i} sx={{ fontSize: 14, color: theme.text.primary, lineHeight: 1.6 }}>
                    • {data}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
          {elements.core_views && elements.core_views.length > 0 && (
            <Box sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', p: 1.5, borderRadius: 1, border: `1px solid ${theme.border.subtle}` }}>
              <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5, fontWeight: 500, textTransform: 'uppercase' }}>
                Core Views
              </Typography>
              <Box>
                {elements.core_views.map((view, i) => (
                  <Typography key={i} sx={{ fontSize: 14, color: theme.text.primary, lineHeight: 1.6 }}>
                    • {view}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  const renderMarketImpact = () => {
    if (!analysisData?.market_impact) return null;
    const impact = analysisData.market_impact;

    return (
      <Box
        sx={{
          bgcolor: `${theme.brand.primary}08`,
          border: `1px solid ${theme.brand.primary}25`,
          borderRadius: 2,
          p: 2.5,
          mb: 2.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, color: theme.brand.primary, fontWeight: 600 }}>
          <TrendingUpIcon />
          Market Impact Analysis
        </Box>

        {impact.impact_direction && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, p: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', borderRadius: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.5,
                py: 0.75,
                borderRadius: 1,
                fontSize: 14,
                fontWeight: 500,
                ...(impact.impact_direction === 'bullish' && {
                  bgcolor: 'rgba(76, 175, 80, 0.1)',
                  border: '1px solid rgba(76, 175, 80, 0.3)',
                  color: '#4caf50',
                }),
                ...(impact.impact_direction === 'bearish' && {
                  bgcolor: 'rgba(244, 67, 54, 0.1)',
                  border: '1px solid rgba(244, 67, 54, 0.3)',
                  color: '#f44336',
                }),
                ...(impact.impact_direction === 'neutral' && {
                  bgcolor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                  border: `1px solid ${theme.border.default}`,
                  color: theme.text.secondary,
                }),
              }}
            >
              {getImpactDirectionIcon(impact.impact_direction)}
              {getImpactDirectionText(impact.impact_direction)}
            </Box>
            {impact.impact_level && (
              <Box
                sx={{
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 0.5,
                  fontSize: 12,
                  fontWeight: 500,
                  ...(impact.impact_level === 'high' && {
                    bgcolor: 'rgba(255, 107, 107, 0.15)',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    color: 'rgba(255, 107, 107, 0.9)',
                  }),
                  ...(impact.impact_level === 'medium' && {
                    bgcolor: 'rgba(255, 193, 7, 0.15)',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    color: 'rgba(255, 193, 7, 0.9)',
                  }),
                  ...(impact.impact_level === 'low' && {
                    bgcolor: 'rgba(76, 175, 80, 0.15)',
                    border: '1px solid rgba(76, 175, 80, 0.3)',
                    color: 'rgba(76, 175, 80, 0.9)',
                  }),
                }}
              >
                Impact: {getImpactLevelText(impact.impact_level)}
              </Box>
            )}
            {impact.impact_timeframe && (
              <Typography sx={{ fontSize: 13, color: theme.text.muted }}>
                {impact.impact_timeframe}
              </Typography>
            )}
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {impact.impact_mechanism && (
            <Box sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', p: 1.5, borderRadius: 1, border: `1px solid ${theme.border.subtle}` }}>
              <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5, fontWeight: 500, textTransform: 'uppercase' }}>
                Impact Mechanism
              </Typography>
              <Typography sx={{ fontSize: 14, color: theme.text.primary, lineHeight: 1.6 }}>
                {impact.impact_mechanism}
              </Typography>
            </Box>
          )}
          {impact.affected_assets && impact.affected_assets.length > 0 && (
            <Box sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', p: 1.5, borderRadius: 1, border: `1px solid ${theme.border.subtle}` }}>
              <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5, fontWeight: 500, textTransform: 'uppercase' }}>
                Related Assets
              </Typography>
              <Typography sx={{ fontSize: 14, color: theme.text.primary, lineHeight: 1.6 }}>
                {impact.affected_assets.join(', ')}
              </Typography>
            </Box>
          )}
          {impact.risk_alerts && impact.risk_alerts.length > 0 && (
            <Box sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', p: 1.5, borderRadius: 1, border: `1px solid ${theme.border.subtle}` }}>
              <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5, fontWeight: 500, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <WarningIcon sx={{ fontSize: 14 }} />
                Risk Alerts
              </Typography>
              <Box>
                {impact.risk_alerts.map((alert, i) => (
                  <Typography key={i} sx={{ fontSize: 14, color: theme.text.primary, lineHeight: 1.6 }}>
                    • {alert}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
          {impact.analysis_summary && (
            <Box sx={{ bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', p: 1.5, borderRadius: 1, border: `1px solid ${theme.border.subtle}` }}>
              <Typography sx={{ fontSize: 12, color: theme.text.muted, mb: 0.5, fontWeight: 500, textTransform: 'uppercase' }}>
                Summary
              </Typography>
              <Typography sx={{ fontSize: 14, color: theme.text.primary, lineHeight: 1.6 }}>
                {impact.analysis_summary}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: theme.background.secondary,
          color: theme.text.primary,
          maxWidth: '900px',
          width: '90%',
          maxHeight: '90vh',
        },
      }}
    >
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 7.5, flexDirection: 'column', gap: 2, color: theme.text.muted }}>
          <CircularProgress sx={{ color: theme.brand.primary }} />
          <Typography variant="body2">Loading article...</Typography>
        </Box>
      ) : error ? (
        <Box sx={{ p: 5, textAlign: 'center', color: theme.status.error }}>
          <Typography variant="body1">{error}</Typography>
        </Box>
      ) : article ? (
        <>
          <DialogTitle
            sx={{
              bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
              borderBottom: `1px solid ${theme.border.default}`,
              p: '20px 24px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ flex: 1, mr: 2 }}>
              <Typography
                sx={{
                  fontSize: 24,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  color: theme.text.primary,
                  mb: 1.5,
                }}
              >
                {showChinese && article.title_zh ? article.title_zh : (article.headline || article.title)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mt: 1 }}>
                {article.author && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: theme.text.muted }}>
                    <PersonIcon sx={{ fontSize: 16, color: theme.text.muted }} />
                    <span>{article.author}</span>
                  </Box>
                )}
                {(article.published_at || article.publish_time) && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: theme.text.muted }}>
                    <TimeIcon sx={{ fontSize: 16, color: theme.text.muted }} />
                    <span>{formatDate(article.published_at || article.publish_time)}</span>
                  </Box>
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: theme.text.muted }}>
                  <span>{article.source || 'CNBC'}</span>
                </Box>
                {analysisData && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: theme.brand.primary }}>
                    AI Analysis
                  </Box>
                )}
              </Box>
            </Box>
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                color: theme.text.secondary,
                '&:hover': {
                  bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                  color: theme.text.primary,
                },
              }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <DialogContent
            sx={{
              p: 3,
              overflowY: 'auto',
              '&::-webkit-scrollbar': { width: '8px' },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': { background: `${theme.brand.primary}30`, borderRadius: '4px' },
              '&::-webkit-scrollbar-thumb:hover': { background: `${theme.brand.primary}50` },
            }}
          >
            {article.translation_status === 'completed' && (article.title_zh || article.content_full_zh) && (
              <FormControlLabel
                control={
                  <Switch
                    checked={showChinese}
                    onChange={(e) => setShowChinese(e.target.checked)}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: theme.brand.primary },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: theme.brand.primary },
                    }}
                  />
                }
                label={showChinese ? 'Chinese' : 'English'}
                sx={{ mb: 2, color: theme.text.secondary }}
              />
            )}

            {article.tags && article.tags.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
                {article.important && (
                  <Chip
                    label="Important"
                    size="small"
                    sx={{
                      bgcolor: 'rgba(255, 107, 107, 0.1)',
                      borderColor: 'rgba(255, 107, 107, 0.3)',
                      color: 'rgba(255, 107, 107, 0.9)',
                      border: '1px solid',
                      fontSize: 12,
                    }}
                  />
                )}
                {article.tags.map((tag, index) => (
                  <Chip
                    key={index}
                    label={tag}
                    size="small"
                    sx={{
                      bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                      border: `1px solid ${theme.border.subtle}`,
                      color: theme.text.muted,
                      fontSize: 12,
                    }}
                  />
                ))}
              </Box>
            )}

            {renderKeyElements()}
            {renderMarketImpact()}

            {((showChinese && article.keypoints_zh) || article.keypoints) && (
              <Box
                sx={{
                  bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${theme.border.subtle}`,
                  borderRadius: 1,
                  p: 2,
                  mb: 2.5,
                }}
              >
                <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.brand.primary, mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Key Points
                </Typography>
                <Box
                  sx={{ fontSize: 15, lineHeight: 1.8, color: theme.text.secondary }}
                  dangerouslySetInnerHTML={{
                    __html: (showChinese && article.keypoints_zh) || article.keypoints || '',
                  }}
                />
              </Box>
            )}

            {((showChinese && article.content_full_zh) || article.content_full) ? (
              <Box
                sx={{
                  fontSize: 15,
                  lineHeight: 1.8,
                  color: theme.text.secondary,
                  '& p': { mb: 2 },
                  '& h2, & h3': { color: theme.text.primary, mt: 3, mb: 1.5 },
                  '& a': { color: theme.brand.primary, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
                  '& ul, & ol': { pl: 3, mb: 2 },
                  '& li': { mb: 1 },
                }}
                dangerouslySetInnerHTML={{
                  __html: (showChinese && article.content_full_zh) || article.content_full || '',
                }}
              />
            ) : (
              <Typography sx={{ color: theme.text.muted }}>
                No full content available
              </Typography>
            )}

            {article.url && (
              <Box
                component="a"
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  mt: 3,
                  px: 2,
                  py: 1.25,
                  bgcolor: `${theme.brand.primary}15`,
                  border: `1px solid ${theme.brand.primary}30`,
                  borderRadius: 1,
                  color: theme.brand.primary,
                  textDecoration: 'none',
                  fontSize: 13,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: `${theme.brand.primary}20`,
                    borderColor: `${theme.brand.primary}40`,
                  },
                }}
              >
                <OpenIcon sx={{ fontSize: 16 }} />
                View Original
              </Box>
            )}
          </DialogContent>
        </>
      ) : null}
    </Dialog>
  );
}
