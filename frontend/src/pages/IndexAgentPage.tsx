import { useState } from 'react';
import { Box, Typography, Tabs, Tab } from '@mui/material';
import { Dices as ArenaIcon, LineChart as WatchlistIcon, GitBranch as TimelineIcon, Trophy as LeaderboardIcon, Settings as SettingsIcon, BarChart3 as BacktestIcon, Sparkles as EvaluationIcon } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import ArenaView from '../components/index/ArenaView';
import WatchlistPanel from '../components/index/WatchlistPanel';
import DecisionTimeline from '../components/index/DecisionTimeline';
import LeaderboardTable from '../components/index/LeaderboardTable';
import SettingsPanel from '../components/index/SettingsPanel';
import BacktestPanel from '../components/index/BacktestPanel';
import EvaluationPanel from '../components/index/EvaluationPanel';

const tabs = [
  { label: 'Arena', icon: <ArenaIcon size={18} /> },
  { label: 'Watchlist', icon: <WatchlistIcon size={18} /> },
  { label: 'History', icon: <TimelineIcon size={18} /> },
  { label: 'Leaderboard', icon: <LeaderboardIcon size={18} /> },
  { label: 'Backtest', icon: <BacktestIcon size={18} /> },
  { label: 'Evaluation', icon: <EvaluationIcon size={18} /> },
  { label: 'Settings', icon: <SettingsIcon size={18} /> },
];

export default function IndexAgentPage() {
  const { theme, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState(0);

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
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 3,
          pt: 3,
          pb: 1.5,
        }}
      >
        <Typography sx={{ fontSize: 24, fontWeight: 600 }}>
          Index Investment Agent
        </Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ px: 3, borderBottom: `1px solid ${theme.border.subtle}` }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              color: theme.text.muted,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 13,
              minHeight: 40,
              py: 0,
              gap: 0.5,
            },
            '& .Mui-selected': { color: theme.brand.primary },
            '& .MuiTabs-indicator': { bgcolor: theme.brand.primary },
          }}
        >
          {tabs.map((t) => (
            <Tab key={t.label} label={t.label} icon={t.icon} iconPosition="start" />
          ))}
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeTab === 0 && <ArenaView />}
        {activeTab === 1 && <WatchlistPanel />}
        {activeTab === 2 && <DecisionTimeline />}
        {activeTab === 3 && <LeaderboardTable />}
        {activeTab === 4 && <BacktestPanel />}
        {activeTab === 5 && <EvaluationPanel onNavigate={setActiveTab} />}
        {activeTab === 6 && <SettingsPanel />}
      </Box>
    </Box>
  );
}
