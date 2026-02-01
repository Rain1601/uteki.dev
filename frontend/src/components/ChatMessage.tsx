import { Box, Avatar, Typography } from '@mui/material';
import { Person as PersonIcon, SmartToy as SmartToyIcon } from '@mui/icons-material';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const { theme } = useTheme();
  const { isMobile, isSmallScreen } = useResponsive();
  const isUser = message.role === 'user';

  return (
    <Box
      sx={{
        display: 'flex',
        gap: isMobile || isSmallScreen ? 1.5 : 2,
        alignItems: 'flex-start',
        px: isMobile || isSmallScreen ? 1 : 0,
      }}
    >
      {/* 头像 */}
      <Avatar
        sx={{
          width: isMobile || isSmallScreen ? 32 : 36,
          height: isMobile || isSmallScreen ? 32 : 36,
          bgcolor: isUser ? theme.brand.primary : theme.brand.accent,
          flexShrink: 0,
        }}
      >
        {isUser ? <PersonIcon sx={{ fontSize: 20 }} /> : <SmartToyIcon sx={{ fontSize: 20 }} />}
      </Avatar>

      {/* 消息内容 */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* 角色标签 */}
        <Typography
          variant="caption"
          sx={{
            color: theme.text.muted,
            fontWeight: 600,
            display: 'block',
            mb: 0.5,
          }}
        >
          {isUser ? 'You' : 'Assistant'}
        </Typography>

        {/* 消息文本 */}
        <Box
          sx={{
            color: theme.text.primary,
            lineHeight: 1.7,
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

        {/* 时间戳 */}
        <Typography
          variant="caption"
          sx={{
            color: theme.text.muted,
            display: 'block',
            mt: 1,
            fontSize: '0.75rem',
          }}
        >
          {message.timestamp.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Typography>
      </Box>
    </Box>
  );
}
