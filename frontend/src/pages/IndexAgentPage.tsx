import { useState } from 'react';
import { Box, Typography, Tabs, Tab } from '@mui/material';
import {
  Chat as ChatIcon,
  Casino as ArenaIcon,
  Timeline as TimelineIcon,
  Leaderboard as LeaderboardIcon,
  Settings as SettingsIcon,
  Assessment as BacktestIcon,
} from '@mui/icons-material';
import { useTheme } from '../theme/ThemeProvider';
import ChatPanel from '../components/index/ChatPanel';
import ArenaView from '../components/index/ArenaView';
import DecisionTimeline from '../components/index/DecisionTimeline';
import LeaderboardTable from '../components/index/LeaderboardTable';
import SettingsPanel from '../components/index/SettingsPanel';
import BacktestPanel from '../components/index/BacktestPanel';

const tabs = [
  { label: 'Chat', icon: <ChatIcon fontSize="small" /> },
  { label: 'Arena', icon: <ArenaIcon fontSize="small" /> },
  { label: 'History', icon: <TimelineIcon fontSize="small" /> },
  { label: 'Leaderboard', icon: <LeaderboardIcon fontSize="small" /> },
  { label: 'Backtest', icon: <BacktestIcon fontSize="small" /> },
  { label: 'Settings', icon: <SettingsIcon fontSize="small" /> },
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
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 0 && <ChatPanel />}
        {activeTab === 1 && <ArenaView />}
        {activeTab === 2 && <DecisionTimeline />}
        {activeTab === 3 && <LeaderboardTable />}
        {activeTab === 4 && <BacktestPanel />}
        {activeTab === 5 && <SettingsPanel />}
      </Box>
    </Box>
  );
}
