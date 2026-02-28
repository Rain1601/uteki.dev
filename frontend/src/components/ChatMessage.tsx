import { Box, Typography } from '@mui/material';
import { Bot } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { TTSButton } from './chat';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
  modelIcon?: string;
}

export default function ChatMessage({ message, modelIcon }: ChatMessageProps) {
  const { theme, isDark } = useTheme();
  const { isMobile, isSmallScreen } = useResponsive();
  const isUser = message.role === 'user';

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        px: isMobile || isSmallScreen ? 1 : 0,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          alignItems: 'flex-start',
          maxWidth: isUser ? '75%' : '100%',
          flexDirection: isUser ? 'row-reverse' : 'row',
        }}
      >
        {/* Assistant avatar */}
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
              <Bot size={16} style={{ color: theme.text.muted }} />
            )}
          </Box>
        )}

        {/* Message content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              color: theme.text.primary,
              lineHeight: 1.7,
              ...(isUser && {
                bgcolor: isDark ? 'rgba(100,149,237,0.12)' : 'rgba(100,149,237,0.08)',
                borderRadius: '18px 18px 4px 18px',
                px: 2,
                py: 1.2,
              }),
            '& p': {
              margin: 0,
              marginBottom: '0.8em',
              '&:last-child': {
                marginBottom: 0,
              },
            },
            '& ul, & ol': {
              marginTop: '0.5em',
              marginBottom: '0.8em',
              paddingLeft: '1.5em',
            },
            '& li': {
              marginBottom: '0.3em',
            },
            '& code': {
              bgcolor: 'rgba(255, 255, 255, 0.05)',
              color: theme.brand.secondary,
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '0.9em',
              fontFamily: 'Monaco, Consolas, monospace',
            },
            '& pre': {
              margin: '1em 0',
              borderRadius: '8px',
              overflow: 'hidden',
            },
            '& blockquote': {
              borderLeft: `3px solid ${theme.brand.primary}`,
              paddingLeft: '1em',
              margin: '1em 0',
              color: theme.text.secondary,
              fontStyle: 'italic',
            },
            '& a': {
              color: theme.brand.primary,
              textDecoration: 'none',
              '&:hover': {
                textDecoration: 'underline',
              },
            },
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              marginTop: '1em',
              marginBottom: '0.5em',
              fontWeight: 600,
              color: theme.text.primary,
            },
            '& h1': { fontSize: '1.8em' },
            '& h2': { fontSize: '1.5em' },
            '& h3': { fontSize: '1.3em' },
            '& table': {
              borderCollapse: 'collapse',
              width: '100%',
              margin: '1em 0',
            },
            '& th, & td': {
              border: `1px solid ${theme.border.default}`,
              padding: '8px 12px',
              textAlign: 'left',
            },
            '& th': {
              bgcolor: theme.background.tertiary,
              fontWeight: 600,
            },
          }}
        >
          <ReactMarkdown
            components={{
              code({ node, className, children, ...props }) {
                const inline = (props as any)?.inline;
                const match = /language-(\w+)/.exec(className || '');
                const codeString = String(children).replace(/\n$/, '');

                return !inline && match ? (
                  <SyntaxHighlighter
                    style={vscDarkPlus as any}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: '8px',
                      fontSize: '0.9em',
                    } as any}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </Box>

        {/* 时间戳 + TTS */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isUser ? 'flex-end' : 'flex-start',
            gap: 0.5,
            mt: 0.5,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: theme.text.muted,
              fontSize: '0.7rem',
            }}
          >
            {message.timestamp.toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Typography>
          {!isUser && message.content && (
            <TTSButton messageId={message.id} text={message.content} />
          )}
        </Box>
        </Box>
      </Box>
    </Box>
  );
}
