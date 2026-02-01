import React from 'react';
import { Box, Tooltip, IconButton } from '@mui/material';

interface Model {
  id: string;
  name: string;
  provider: string;
  icon: string;
  available: boolean;
  color: string;
}

interface ModelSelectorProps {
  models: Model[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

// Brand colors for each provider
const PROVIDER_COLORS: Record<string, string> = {
  Claude: '#D97757',    // Orange
  OpenAI: '#74AA9C',    // Teal
  DeepSeek: '#4A90E2',  // Blue
  Qwen: '#9B59B6',      // Purple
  Gemini: '#E94B3C',    // Red (multicolor represented by red)
};

const ModelSelector: React.FC<ModelSelectorProps> = ({
  models,
  selectedModelId,
  onSelectModel,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        padding: '8px 12px',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        backdropFilter: 'blur(12px)',
        borderRadius: 3,
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {models.map((model) => {
        const isSelected = model.id === selectedModelId;
        const brandColor = PROVIDER_COLORS[model.provider] || '#666';

        return (
          <Tooltip key={model.id} title={model.name} placement="top">
            <IconButton
              onClick={() => onSelectModel(model.id)}
              disabled={!model.available}
              sx={{
                width: 40,
                height: 40,
                padding: 0,
                border: isSelected
                  ? `2px solid ${brandColor}`
                  : '2px solid transparent',
                backgroundColor: isSelected
                  ? `${brandColor}20`
                  : 'rgba(255, 255, 255, 0.05)',
                borderRadius: 2,
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: `${brandColor}30`,
                  transform: 'translateY(-2px)',
                  boxShadow: `0 4px 12px ${brandColor}40`,
                },
                '&:active': {
                  transform: 'scale(0.95)',
                },
                '&.Mui-disabled': {
                  opacity: 0.3,
                },
              }}
            >
              <Box
                component="img"
                src={model.icon}
                alt={model.provider}
                sx={{
                  width: 24,
                  height: 24,
                  objectFit: 'contain',
                  filter: isSelected ? 'none' : 'grayscale(30%)',
                }}
              />
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
};

export default ModelSelector;
