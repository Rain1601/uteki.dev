import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { ContentCopy, Person, SmartToy } from '@mui/icons-material';
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
  created_at: string;
}

interface EnhancedMessageProps {
  message: Message;
}

const EnhancedMessage: React.FC<EnhancedMessageProps> = ({ message }) => {
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
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: 'rgba(79, 195, 247, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <SmartToy sx={{ fontSize: 20, color: '#4FC3F7' }} />
          </Box>
        )}

        {/* Message Content */}
        <Box
          sx={{
            maxWidth: isUser ? '75%' : '85%',
            backgroundColor: isUser
              ? 'rgba(79, 195, 247, 0.15)'
              : 'rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${
              isUser ? 'rgba(79, 195, 247, 0.3)' : 'rgba(255, 255, 255, 0.08)'
            }`,
            borderRadius: 2,
            padding: 2,
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          }}
        >
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...props }) {
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
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{
                        margin: 0,
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                      }}
                      {...props}
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
                    color: 'rgba(255, 255, 255, 0.85)',
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
                <Typography component="li" sx={{ color: 'rgba(255, 255, 255, 0.85)', mb: 0.5 }}>
                  {children}
                </Typography>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </Box>

        {/* Avatar for user */}
        {isUser && (
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Person sx={{ fontSize: 20, color: 'rgba(255, 255, 255, 0.7)' }} />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default EnhancedMessage;
