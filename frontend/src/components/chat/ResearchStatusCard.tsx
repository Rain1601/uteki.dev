import React from 'react';
import { Box, Card, CardContent, Typography, LinearProgress, Chip } from '@mui/material';
import { Search, FileText } from 'lucide-react';

interface ResearchStatusCardProps {
  status: string;
  sourcesCount?: number;
  currentSource?: string;
}

const ResearchStatusCard: React.FC<ResearchStatusCardProps> = ({
  status,
  sourcesCount,
  currentSource,
}) => {
  return (
    <Card
      sx={{
        mb: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 2,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        animation: 'pulse 1.5s ease-in-out infinite',
        '@keyframes pulse': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.8 },
        },
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <Search size={20} style={{ marginRight: 8, color: '#4FC3F7' }} />
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.9)',
              letterSpacing: '0.5px',
            }}
          >
            Research Progress
          </Typography>
        </Box>

        <Typography
          variant="body2"
          sx={{
            color: 'rgba(255, 255, 255, 0.7)',
            mb: 1.5,
            fontSize: '0.9rem',
          }}
        >
          {status}
        </Typography>

        <LinearProgress
          sx={{
            mb: 1.5,
            height: 6,
            borderRadius: 3,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            '& .MuiLinearProgress-bar': {
              backgroundColor: '#4FC3F7',
              borderRadius: 3,
            },
          }}
        />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {sourcesCount !== undefined && (
            <Chip
              icon={<FileText size={16} />}
              label={`${sourcesCount} sources found`}
              size="small"
              sx={{
                backgroundColor: 'rgba(79, 195, 247, 0.15)',
                color: 'rgba(255, 255, 255, 0.85)',
                border: '1px solid rgba(79, 195, 247, 0.3)',
                fontSize: '0.75rem',
              }}
            />
          )}

          {currentSource && (
            <Chip
              label={`Reading: ${currentSource}`}
              size="small"
              sx={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: 'rgba(255, 255, 255, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '0.75rem',
                maxWidth: '300px',
                '& .MuiChip-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              }}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default ResearchStatusCard;
