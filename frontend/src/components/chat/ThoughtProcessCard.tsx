import React from 'react';
import { Box, Card, CardContent, Typography, Chip } from '@mui/material';
import { Lightbulb } from '@mui/icons-material';

interface ThoughtProcessCardProps {
  thoughts: string[];
}

const ThoughtProcessCard: React.FC<ThoughtProcessCardProps> = ({ thoughts }) => {
  if (!thoughts || thoughts.length === 0) {
    return null;
  }

  return (
    <Card
      sx={{
        mb: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 2,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        animation: 'fadeIn 0.3s ease-out',
        '@keyframes fadeIn': {
          from: { opacity: 0, transform: 'translateY(-10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
          <Lightbulb sx={{ mr: 1, color: '#FFA726', fontSize: 20 }} />
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.9)',
              letterSpacing: '0.5px',
            }}
          >
            Research Plan
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {thoughts.map((thought, index) => (
            <Chip
              key={index}
              label={`${index + 1}. ${thought}`}
              size="small"
              sx={{
                backgroundColor: 'rgba(255, 167, 38, 0.15)',
                color: 'rgba(255, 255, 255, 0.85)',
                border: '1px solid rgba(255, 167, 38, 0.3)',
                fontSize: '0.8rem',
                fontWeight: 500,
                '&:hover': {
                  backgroundColor: 'rgba(255, 167, 38, 0.25)',
                },
              }}
            />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

export default ThoughtProcessCard;
