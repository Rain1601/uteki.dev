import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { ContentCopy, SmartToy } from '@mui/icons-material';
import { useTheme } from '../../theme/ThemeProvider';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ThoughtProcessCard from './ThoughtProcessCard';
import SourcesList from './SourcesList';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  research_data?: {
    thoughts?: string[];
    sources?: Record<string, number>;
    sourceUrls?: Array<{
      title: string;
      url: string;
      snippet: string;
      source: string;
    }>;
  };
  created_at?: string;
  timestamp?: Date;
}

interface EnhancedMessageProps {
  message: Message;
  modelIcon?: string;
}

const EnhancedMessage: React.FC<EnhancedMessageProps> = ({ message, modelIcon }) => {
  const { theme, isDark } = useTheme();
  const isUser = message.role === 'user';

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        mb: 2,
        animation: 'slideIn 0.3s ease-out',
        '@keyframes slideIn': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      {/* Research Data Cards */}
      {!isUser && message.research_data && (
        <>
          {message.research_data.thoughts && (
            <ThoughtProcessCard thoughts={message.research_data.thoughts} />
          )}

          {message.research_data.sourceUrls && (
            <SourcesList
              sources={message.research_data.sources || {}}
              sourceUrls={message.research_data.sourceUrls}
            />
          )}
        </>
      )}

      {/* Message Bubble */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          gap: 1.5,
        }}
      >
        {/* Avatar for assistant */}
        {!isUser && (
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              mt: 0.5,
              overflow: 'hidden',
            }}
          >
            {modelIcon ? (
              <img src={modelIcon} alt="" style={{ width: 18, height: 18 }} />
            ) : (
              <SmartToy sx={{ fontSize: 16, color: theme.text.muted }} />
            )}
          </Box>
        )}

        {/* Message Content */}
        <Box
          sx={{
            maxWidth: isUser ? '75%' : '85%',
            ...(isUser ? {
              bgcolor: isDark ? 'rgba(100,149,237,0.12)' : 'rgba(100,149,237,0.08)',
              borderRadius: '18px 18px 4px 18px',
              px: 2,
              py: 1.2,
            } : {
              backgroundColor: 'transparent',
            }),
          }}
        >
          <ReactMarkdown
            components={{
              code({ node, className, children, ...props }) {
                const inline = (props as any)?.inline;
                const match = /language-(\w+)/.exec(className || '');
                const codeString = String(children).replace(/\n$/, '');

                return !inline && match ? (
                  <Box sx={{ position: 'relative', mt: 1, mb: 1 }}>
                    <Tooltip title="Copy code">
                      <IconButton
                        size="small"
                        onClick={() => handleCopyCode(codeString)}
                        sx={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          zIndex: 1,
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          '&:hover': {
                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                          },
                        }}
                      >
                        <ContentCopy sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <SyntaxHighlighter
                      style={vscDarkPlus as any}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{
                        margin: 0,
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                      } as any}
                    >
                      {codeString}
                    </SyntaxHighlighter>
                  </Box>
                ) : (
                  <code
                    className={className}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.9em',
                      fontFamily: 'monospace',
                    }}
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              p: ({ children }) => (
                <Typography
                  variant="body1"
                  sx={{
                    color: theme.text.primary,
                    lineHeight: 1.7,
                    mb: 1,
                    '&:last-child': { mb: 0 },
                  }}
                >
                  {children}
                </Typography>
              ),
              h1: ({ children }) => (
                <Typography variant="h5" sx={{ mt: 2, mb: 1, fontWeight: 600 }}>
                  {children}
                </Typography>
              ),
              h2: ({ children }) => (
                <Typography variant="h6" sx={{ mt: 1.5, mb: 1, fontWeight: 600 }}>
                  {children}
                </Typography>
              ),
              ul: ({ children }) => (
                <Box component="ul" sx={{ pl: 3, my: 1 }}>
                  {children}
                </Box>
              ),
              ol: ({ children }) => (
                <Box component="ol" sx={{ pl: 3, my: 1 }}>
                  {children}
                </Box>
              ),
              li: ({ children }) => (
                <Typography component="li" sx={{ color: theme.text.primary, mb: 0.5 }}>
                  {children}
                </Typography>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </Box>

        {/* No user avatar */}
      </Box>
    </Box>
  );
};

export default EnhancedMessage;
