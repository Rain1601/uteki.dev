import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { ExpandMore, Link as LinkIcon, Public } from '@mui/icons-material';

interface Source {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface SourcesListProps {
  sources: Record<string, number>;
  sourceUrls: Source[];
}

const SourcesList: React.FC<SourcesListProps> = ({ sources, sourceUrls }) => {
  const [expanded, setExpanded] = useState(false);

  if (!sourceUrls || sourceUrls.length === 0) {
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
        animation: 'slideIn 0.3s ease-out',
        '@keyframes slideIn': {
          from: { opacity: 0, transform: 'translateX(-20px)' },
          to: { opacity: 1, transform: 'translateX(0)' },
        },
      }}
    >
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <LinkIcon sx={{ mr: 1, color: '#66BB6A', fontSize: 20 }} />
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.9)',
                letterSpacing: '0.5px',
              }}
            >
              Sources ({sourceUrls.length})
            </Typography>
          </Box>

          <IconButton
            onClick={() => setExpanded(!expanded)}
            size="small"
            sx={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s',
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            <ExpandMore />
          </IconButton>
        </Box>

        {/* Domain Summary */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
          {Object.entries(sources)
            .slice(0, 5)
            .map(([domain, count]) => (
              <Chip
                key={domain}
                icon={<Public sx={{ fontSize: 14 }} />}
                label={`${domain} (${count})`}
                size="small"
                sx={{
                  backgroundColor: 'rgba(102, 187, 106, 0.15)',
                  color: 'rgba(255, 255, 255, 0.85)',
                  border: '1px solid rgba(102, 187, 106, 0.3)',
                  fontSize: '0.75rem',
                }}
              />
            ))}
          {Object.keys(sources).length > 5 && (
            <Chip
              label={`+${Object.keys(sources).length - 5} more`}
              size="small"
              sx={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '0.75rem',
              }}
            />
          )}
        </Box>

        {/* Expandable URL List */}
        <Collapse in={expanded}>
          <List dense sx={{ mt: 1 }}>
            {sourceUrls.map((source, index) => (
              <ListItem
                key={index}
                sx={{
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 1,
                  mb: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  },
                }}
              >
                <ListItemText
                  primary={
                    <Typography
                      component="a"
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        color: '#4FC3F7',
                        textDecoration: 'none',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        '&:hover': {
                          textDecoration: 'underline',
                        },
                      }}
                    >
                      {source.title}
                    </Typography>
                  }
                  secondary={
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'rgba(255, 255, 255, 0.5)',
                        display: 'block',
                        mt: 0.5,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {source.snippet}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default SourcesList;
