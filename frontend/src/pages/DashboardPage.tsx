import { Box } from '@mui/material';
import PageHeader from '../components/PageHeader';
import PortfolioSummary from '../components/dashboard/PortfolioSummary';
import QuickStats from '../components/dashboard/QuickStats';
import PerformanceChart from '../components/dashboard/PerformanceChart';
import RecentDecisions from '../components/dashboard/RecentDecisions';
import AgentActivity from '../components/dashboard/AgentActivity';
import ModelLeaderboard from '../components/dashboard/ModelLeaderboard';
import AnimatedList from '../components/animation/AnimatedList';

export default function DashboardPage() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader title="Dashboard" />

      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
        <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
          <AnimatedList staggerDelay={0.08}>
            {/* Row 1: Portfolio + Stats */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 2.5,
                mb: 2.5,
              }}
            >
              <PortfolioSummary />
              <QuickStats />
            </Box>

            {/* Row 2: Performance Chart (full width) */}
            <Box sx={{ mb: 2.5 }}>
              <PerformanceChart />
            </Box>

            {/* Row 3: Agent Activity + Model Leaderboard */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 2.5,
                mb: 2.5,
              }}
            >
              <AgentActivity />
              <ModelLeaderboard />
            </Box>

            {/* Row 4: Recent Decisions (full width) */}
            <Box>
              <RecentDecisions />
            </Box>
          </AnimatedList>
        </Box>
      </Box>
    </Box>
  );
}
