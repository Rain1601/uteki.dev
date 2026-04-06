import { Box, Typography } from '@mui/material';
import { LineChart, Building2, Bot } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AgentCard from '../components/hub/AgentCard';
import AnimatedList from '../components/animation/AnimatedList';
import { useTheme } from '../theme/ThemeProvider';

const agents = [
  {
    name: 'Index Agent',
    subtitle: '指数投资',
    description: '通过多模型竞技场和DCA策略，为ETF指数基金提供数据驱动的投资建议。',
    status: 'online' as const,
    lastActivity: '5分钟前活跃',
    icon: LineChart,
    route: '/index-agent',
  },
  {
    name: 'Company Agent',
    subtitle: '公司投资',
    description: '深度分析上市公司基本面、财务数据和行业趋势，辅助个股投资决策。',
    status: 'online' as const,
    lastActivity: '10分钟前活跃',
    icon: Building2,
    route: '/company-agent',
  },
  {
    name: 'AI Agent',
    subtitle: '深度研究',
    description: '自由对话式AI助手，支持多模型切换，可执行深度研究和复杂分析任务。',
    status: 'online' as const,
    lastActivity: '刚刚活跃',
    icon: Bot,
    route: '/agent',
  },
];

export default function AgentHubPage() {
  const { theme } = useTheme();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader title="Agent Hub" />

      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
        <Box sx={{ maxWidth: 960, mx: 'auto' }}>
          <Typography
            sx={{
              fontSize: 13,
              color: theme.text.muted,
              mb: 3,
              letterSpacing: '-0.01em',
            }}
          >
            AI 投资助手团队 -- 启动任意 Agent 开始分析
          </Typography>

          <AnimatedList staggerDelay={0.08}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: 2.5,
              }}
            >
              {agents.map((agent) => (
                <AgentCard key={agent.name} {...agent} />
              ))}
            </Box>
          </AnimatedList>
        </Box>
      </Box>
    </Box>
  );
}
