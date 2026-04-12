import { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import PageHeader from '../components/PageHeader';
import PortfolioSummary from '../components/dashboard/PortfolioSummary';
import QuickStats from '../components/dashboard/QuickStats';
import PerformanceChart from '../components/dashboard/PerformanceChart';
import RecentDecisions from '../components/dashboard/RecentDecisions';
import ModelLeaderboard from '../components/dashboard/ModelLeaderboard';
import {
  getEvalOverview,
  getLeaderboard,
  getDecisions,
  getCompanyAnalyses,
  type EvalOverview,
  type LeaderboardEntry,
  type DecisionItem,
  type CompanyAnalysis,
} from '../api/dashboard';

export default function DashboardPage() {
  const [evalOverview, setEvalOverview] = useState<EvalOverview | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [companyAnalyses, setCompanyAnalyses] = useState<CompanyAnalysis[]>([]);

  useEffect(() => {
    getEvalOverview().then(setEvalOverview);
    getLeaderboard().then(setLeaderboard);
    getDecisions(10).then(setDecisions);
    getCompanyAnalyses(10).then(setCompanyAnalyses);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <PageHeader title="Dashboard" />

      <Box sx={{ flex: 1, overflow: 'hidden', p: { xs: 1.5, md: 2 } }}>
        <Box
          sx={{
            height: '100%',
            display: 'grid',
            gridTemplateRows: 'auto 1fr',
            gridTemplateColumns: { xs: '1fr', md: '280px 1fr 1fr' },
            gap: 2,
          }}
        >
          {/* Row 1, Col 1: Portfolio Summary */}
          <Box sx={{ gridRow: { md: '1 / 3' }, gridColumn: { md: '1' }, overflow: 'hidden' }}>
            <PortfolioSummary compact evalOverview={evalOverview} />
          </Box>

          {/* Row 1, Col 2: Quick Stats */}
          <Box sx={{ gridColumn: { md: '2' }, overflow: 'hidden' }}>
            <QuickStats compact evalOverview={evalOverview} leaderboard={leaderboard} />
          </Box>

          {/* Row 1, Col 3: Model Leaderboard */}
          <Box sx={{ gridColumn: { md: '3' }, overflow: 'hidden' }}>
            <ModelLeaderboard compact leaderboard={leaderboard} />
          </Box>

          {/* Row 2, Col 2: Performance Chart */}
          <Box sx={{ gridColumn: { md: '2' }, overflow: 'hidden', minHeight: 0 }}>
            <PerformanceChart compact />
          </Box>

          {/* Row 2, Col 3: Recent Decisions */}
          <Box sx={{ gridColumn: { md: '3' }, overflow: 'hidden', minHeight: 0 }}>
            <RecentDecisions compact decisions={decisions} companyAnalyses={companyAnalyses} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
