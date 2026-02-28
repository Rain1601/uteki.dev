import React from 'react';
import { IconButton, CircularProgress } from '@mui/material';
import { Volume2 } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { useTTS } from '../../hooks/useTTS';

interface TTSButtonProps {
  messageId: string;
  text: string;
}

const TTSButton: React.FC<TTSButtonProps> = ({ messageId, text }) => {
  const { theme } = useTheme();
  const { state, toggle } = useTTS(messageId, text);

  if (!text.trim()) return null;

  return (
    <IconButton
      size="small"
      onClick={toggle}
      sx={{
        padding: '2px',
        color:
          state === 'playing'
            ? theme.brand.primary
            : theme.text.muted,
        transition: 'all 0.2s ease',
        ...(state === 'playing' && {
          animation: 'tts-pulse 1.5s ease-in-out infinite',
          '@keyframes tts-pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.5 },
          },
        }),
        '&:hover': {
          color: theme.brand.primary,
          bgcolor: 'rgba(100, 149, 237, 0.08)',
        },
      }}
    >
      {state === 'loading' ? (
        <CircularProgress size={14} sx={{ color: theme.text.muted }} />
      ) : (
        <Volume2 size={14} />
      )}
    </IconButton>
  );
};

export default TTSButton;
