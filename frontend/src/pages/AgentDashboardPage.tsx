import { Link } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { LineChart, Building2, Bitcoin, ArrowRight, Activity, Brain, TrendingUp } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';

const agents = [
  {
    name: 'Index Investment Agent',
    description: '基于多模型竞技场的指数投资决策系统，自动分析市场数据并生成投资建议。',
    icon: LineChart,
    path: '/index-agent',
    color: '#6495ED',
    stats: { label: '指数投资', models: 'Multi-Model Arena' },
  },
  {
    name: 'Company Investment Agent',
    description: '公司基本面分析与投资决策代理，深度分析财报、估值与行业趋势。',
    icon: Building2,
    path: '/company-agent',
    color: '#4CAF50',
    stats: { label: '公司投资', models: 'Fundamental Analysis' },
  },
  {
    name: 'Crypto Investment Agent',
    description: '加密货币市场分析与交易决策代理，覆盖链上数据、市场情绪与技术指标。',
    icon: Bitcoin,
    path: '/crypto-agent',
    color: '#F7931A',
    stats: { label: '加密投资', models: 'On-chain + Sentiment' },
  },
];

export default function AgentDashboardPage() {
  const { theme } = useTheme();

  return (
    <Box
      sx={{
        m: -3,
        height: 'calc(100vh - 48px)',
        width: 'calc(100% + 48px)',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: theme.background.primary,
        color: theme.text.primary,
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        <Typography sx={{ fontSize: 24, fontWeight: 600 }}>Agent Dashboard</Typography>
        <Typography sx={{ fontSize: 14, color: theme.text.muted, mt: 0.5 }}>
          投资代理总览 — 管理和监控所有 AI 投资代理
        </Typography>
      </Box>

      {/* Stats Overview */}
      <Box sx={{ px: 3, pb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {[
          { icon: Brain, label: '活跃代理', value: '3', color: theme.brand.primary },
          { icon: Activity, label: '今日决策', value: '—', color: '#4CAF50' },
          { icon: TrendingUp, label: '总收益率', value: '—', color: '#F7931A' },
        ].map((stat) => (
          <Box
            key={stat.label}
            sx={{
              flex: '1 1 200px',
              p: 2,
              borderRadius: '12px',
              border: `1px solid ${theme.border.subtle}`,
              bgcolor: theme.background.secondary,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                bgcolor: `${stat.color}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <stat.icon size={20} color={stat.color} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 12, color: theme.text.muted }}>{stat.label}</Typography>
              <Typography sx={{ fontSize: 20, fontWeight: 600 }}>{stat.value}</Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Agent Cards */}
      <Box sx={{ px: 3, pb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {agents.map((agent) => {
          const Icon = agent.icon;
          return (
            <Box
              key={agent.name}
              component={Link}
              to={agent.path}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2.5,
                p: 2.5,
                borderRadius: '12px',
                border: `1px solid ${theme.border.subtle}`,
                bgcolor: theme.background.secondary,
                textDecoration: 'none',
                color: 'inherit',
                transition: 'all 200ms ease',
                '&:hover': {
                  borderColor: agent.color,
                  bgcolor: `${agent.color}08`,
                  transform: 'translateY(-1px)',
                  boxShadow: `0 4px 12px ${agent.color}15`,
                },
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '12px',
                  bgcolor: `${agent.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={24} color={agent.color} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{agent.name}</Typography>
                <Typography sx={{ fontSize: 13, color: theme.text.muted, mt: 0.25 }}>
                  {agent.description}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 11,
                      px: 1,
                      py: 0.25,
                      borderRadius: '4px',
                      bgcolor: `${agent.color}15`,
                      color: agent.color,
                      fontWeight: 500,
                    }}
                  >
                    {agent.stats.label}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      px: 1,
                      py: 0.25,
                      borderRadius: '4px',
                      bgcolor: theme.background.tertiary,
                      color: theme.text.muted,
                      fontWeight: 500,
                    }}
                  >
                    {agent.stats.models}
                  </Typography>
                </Box>
              </Box>
              <ArrowRight size={20} color={theme.text.muted} />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}