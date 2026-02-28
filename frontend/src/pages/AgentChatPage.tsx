import { useState, useRef, useEffect } from 'react';
import { getAuthHeaders } from '../hooks/useAuth';

// API Base URL - uses environment variable in production, localhost in development
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8888';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Tooltip,
  SwipeableDrawer,
} from '@mui/material';
import { SendHorizonal as SendIcon, Plus as AddIcon, History as HistoryIcon, Search as SearchIcon } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive, useKeyboardVisibility } from '../hooks/useResponsive';
import ChatMessage from '../components/ChatMessage';
import {
  EnhancedMessage,
  ResearchStatusCard,
  TypingIndicator,
} from '../components/chat';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  modelIcon?: string;
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
}

interface Conversation {
  id: string;
  title: string;
  mode: string;
  created_at: string;
}

// 模型选项接口
interface ModelOption {
  id: string;
  name: string;
  provider: string;
  icon: string;
  available: boolean;
}


export default function AgentChatPage() {
  const { theme, isDark } = useTheme();
  const { isMobile, isSmallScreen } = useResponsive();
  const { isKeyboardVisible, keyboardHeight } = useKeyboardVisibility();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedMode, setSelectedMode] = useState('research');
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('claude-sonnet-4-20250514'); // 默认选择Claude
  const [modelSelectorHovered, setModelSelectorHovered] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  // Deep Research state
  const [researchMode, setResearchMode] = useState(false);
  const [researchStatus, setResearchStatus] = useState('');
  const [researchThoughts, setResearchThoughts] = useState<string[]>([]);
  const [researchSources, setResearchSources] = useState<Record<string, number>>({});
  const [researchSourceUrls, setResearchSourceUrls] = useState<any[]>([]);
  const [researchInProgress, setResearchInProgress] = useState(false);
  const [currentSourceReading, setCurrentSourceReading] = useState('');

  // 智能滚动：只有用户在底部附近时才自动滚动
  const scrollToBottom = () => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 100;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 加载会话列表和可用模型
  useEffect(() => {
    loadConversations();
    loadAvailableModels();
  }, []);

  // 加载可用模型
  const loadAvailableModels = async () => {
    try {
      console.log('🔄 Loading available models...');
      const response = await fetch(`${API_BASE_URL}/api/agent/models/available`, { headers: getAuthHeaders(), credentials: 'include' });
      console.log('📡 API Response status:', response.status);
      const data = await response.json();
      console.log('📦 Models data:', data);
      // 显示所有模型（包括未配置的）
      setModelOptions(data.models || []);
      console.log('✅ Model options set:', data.models?.length || 0, 'models');
      // 设置默认模型（只能选择available的）
      if (data.default_model && data.models.length > 0) {
        setSelectedModelId(data.default_model);
        console.log('🎯 Default model selected:', data.default_model);
      }
    } catch (error) {
      console.error('❌ Failed to load available models:', error);
    }
  };

  const loadConversations = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/agent/conversations`, { headers: getAuthHeaders(), credentials: 'include' });
      const data = await response.json();
      setConversations(data.items || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  // Deep Research 发送处理
  const handleDeepResearchSend = async () => {
    if (!message.trim() || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage('');
    setIsStreaming(true);
    setResearchInProgress(true);

    // Reset research state
    setResearchThoughts([]);
    setResearchSources({});
    setResearchSourceUrls([]);
    setResearchStatus('Initializing research...');

    // Create assistant message placeholder
    const assistantMessageId = (Date.now() + 1).toString();
    const currentIcon = modelOptions.find((m) => m.id === selectedModelId)?.icon;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      modelIcon: currentIcon,
      research_data: {
        thoughts: [],
        sources: {},
        sourceUrls: [],
      },
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/agent/research/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          query: userMessage.content,
          max_sources: 20,
          max_scrape: 10,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start research');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const eventData = JSON.parse(line.slice(6));

            switch (eventData.type) {
              case 'research_start':
                setResearchStatus('Research started...');
                break;

              case 'thought':
                if (eventData.data.thoughts) {
                  setResearchThoughts(eventData.data.thoughts);
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? {
                            ...msg,
                            research_data: {
                              ...msg.research_data,
                              thoughts: eventData.data.thoughts,
                            },
                          }
                        : msg
                    )
                  );
                }
                break;

              case 'status':
                setResearchStatus(eventData.data.message);
                break;

              case 'plan_created':
                setResearchStatus('Research plan created');
                break;

              case 'sources_update':
                setResearchStatus(
                  `Found ${eventData.data.count} sources (${eventData.data.current_subtask}/${eventData.data.total_subtasks})`
                );
                break;

              case 'sources_complete':
                setResearchSources(eventData.data.sources || {});
                setResearchSourceUrls(eventData.data.sourceUrls || []);
                setResearchStatus('Sources collected, reading content...');
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          research_data: {
                            ...msg.research_data,
                            sources: eventData.data.sources,
                            sourceUrls: eventData.data.sourceUrls,
                          },
                        }
                      : msg
                  )
                );
                break;

              case 'source_read':
                const urlParts = eventData.data.url.split('/');
                const domain = urlParts[2] || eventData.data.url;
                setCurrentSourceReading(domain);
                setResearchStatus(
                  `Reading: ${domain} (${eventData.data.current}/${eventData.data.total})`
                );
                break;

              case 'content_chunk':
                accumulatedContent += eventData.data.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  )
                );
                break;

              case 'research_complete':
                setResearchInProgress(false);
                setResearchStatus('');
                setCurrentSourceReading('');
                setIsStreaming(false);
                break;

              case 'error':
                console.error('Research error:', eventData.data.message);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: `Error: ${eventData.data.message}` }
                      : msg
                  )
                );
                setResearchInProgress(false);
                setIsStreaming(false);
                break;
            }
          }
        }
      }
    } catch (error) {
      console.error('Research error:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: 'Sorry, an error occurred during research.' }
            : msg
        )
      );
      setResearchInProgress(false);
      setIsStreaming(false);
    }
  };

  // 发送消息（SSE流式）
  const handleSendMessage = async () => {
    if (!message.trim() || isStreaming) return;

    // Use Deep Research if research mode is enabled
    if (researchMode) {
      return handleDeepResearchSend();
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage('');
    setIsStreaming(true);

    // 创建助手消息占位符
    const assistantMessageId = (Date.now() + 1).toString();
    const currentIcon = modelOptions.find((m) => m.id === selectedModelId)?.icon;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      modelIcon: currentIcon,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/agent/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          conversation_id: currentConversationId,
          message: userMessage.content,
          mode: selectedMode,
          stream: true,
          model_id: selectedModelId, // 传递用户选择的模型
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            // 更新会话ID
            if (data.conversation_id && !currentConversationId) {
              setCurrentConversationId(data.conversation_id);
            }

            // 累积内容
            if (!data.done && data.chunk) {
              accumulatedContent += data.chunk;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: accumulatedContent }
                    : msg
                )
              );
            }

            // 完成
            if (data.done) {
              setIsStreaming(false);
              loadConversations(); // 刷新会话列表
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: '抱歉，发送消息时出现错误。' }
            : msg
        )
      );
      setIsStreaming(false);
    }
  };

  // 加载会话历史
  const loadConversation = async (conversationId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/agent/conversations/${conversationId}`,
        { headers: getAuthHeaders(), credentials: 'include' }
      );
      const data = await response.json();

      const loadedMessages: Message[] = data.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.created_at),
      }));

      setMessages(loadedMessages);
      setCurrentConversationId(conversationId);
      setHistoryDrawerOpen(false);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  // 新建对话
  const handleNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
  };

  // 处理回车发送
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 判断是否为空白状态
  const isEmpty = messages.length === 0;

  return (
    <Box
      sx={{
        height: 'calc(100vh - 48px)',
        m: -3,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: theme.background.primary,
        color: theme.text.primary,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 右上角固定按钮 */}
      <Box
        sx={{
          position: 'fixed',
          top: isMobile || isSmallScreen ? 8 : 16,
          right: isMobile || isSmallScreen ? 8 : 16,
          display: 'flex',
          gap: isMobile || isSmallScreen ? 0.5 : 1.5,
          zIndex: 1000,
        }}
      >
        <IconButton
          onClick={() => setHistoryDrawerOpen(true)}
          sx={{
            minWidth: isMobile || isSmallScreen ? 44 : 'auto',
            minHeight: isMobile || isSmallScreen ? 44 : 'auto',
            padding: isMobile || isSmallScreen ? '10px' : '12px 20px',
            fontSize: '0.9rem',
            fontWeight: 500,
            borderRadius: isMobile || isSmallScreen ? '50%' : '12px',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${theme.border.subtle}`,
            backgroundColor: theme.background.secondary,
            color: theme.text.muted,
            '&:hover': {
              transform: 'translateY(-1px)',
              backgroundColor: theme.background.tertiary,
              borderColor: theme.border.default,
              color: theme.text.primary,
              boxShadow: theme.effects.shadow.md,
            },
            '&:active': {
              transform: 'translateY(0)',
            },
          }}
        >
          <HistoryIcon size={20} />
          {!(isMobile || isSmallScreen) && (
            <Box
              component="span"
              sx={{
                ml: 1,
                '@media (max-width: 1400px)': {
                  display: 'none',
                },
              }}
            >
              历史记录
            </Box>
          )}
        </IconButton>

        <IconButton
          onClick={handleNewConversation}
          sx={{
            minWidth: isMobile || isSmallScreen ? 44 : 'auto',
            minHeight: isMobile || isSmallScreen ? 44 : 'auto',
            padding: isMobile || isSmallScreen ? '10px' : '12px 20px',
            fontSize: '0.9rem',
            fontWeight: 500,
            borderRadius: isMobile || isSmallScreen ? '50%' : '12px',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${theme.border.default}`,
            backgroundColor: theme.background.tertiary,
            color: theme.text.secondary,
            '&:hover': {
              transform: 'translateY(-1px)',
              backgroundColor: theme.background.hover,
              borderColor: theme.border.hover,
              color: theme.text.primary,
              boxShadow: theme.effects.shadow.md,
            },
            '&:active': {
              transform: 'translateY(0)',
            },
          }}
        >
          <AddIcon size={20} />
          {!(isMobile || isSmallScreen) && (
            <Box
              component="span"
              sx={{
                ml: 1,
                '@media (max-width: 1400px)': {
                  display: 'none',
                },
              }}
            >
              新对话
            </Box>
          )}
        </IconButton>
      </Box>

      {/* 中心内容区域 */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isEmpty ? 'center' : 'flex-start',
          overflow: 'hidden',
          px: isMobile || isSmallScreen ? 1.5 : 3,
          pt: isEmpty ? 0 : isMobile || isSmallScreen ? 6 : 10,
          pb: isMobile || isSmallScreen ? 1 : 3,
        }}
      >
        {isEmpty ? (
          /* 空白状态 - 居中显示欢迎语 */
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              maxWidth: '800px',
              width: '100%',
            }}
          >
            {/* 标题 */}
            <Typography
              sx={{
                fontSize: isMobile || isSmallScreen ? '1.5rem' : '2.2rem',
                fontWeight: 400,
                textAlign: 'center',
                color: theme.text.primary,
                letterSpacing: '0.02em',
                px: isMobile || isSmallScreen ? 2 : 0,
                fontFamily: 'Times New Roman, serif', // 匹配原项目字体
              }}
            >
              What do you want to know today?
            </Typography>

            {/* 输入框 */}
            <Box sx={{ width: '100%' }}>
              <TextField
                fullWidth
                multiline
                maxRows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={`Message ${modelOptions.find(m => m.id === selectedModelId)?.name || 'AI'}...`}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: theme.background.secondary,
                    borderRadius: '16px',
                    fontSize: '1rem',
                    color: theme.text.primary,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    '& fieldset': {
                      borderColor: theme.border.default,
                      borderWidth: '1px',
                    },
                    '&:hover': {
                      bgcolor: theme.background.tertiary,
                    },
                    '&:hover fieldset': {
                      borderColor: theme.border.hover,
                    },
                    '&.Mui-focused': {
                      bgcolor: theme.background.hover,
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: theme.border.active,
                      borderWidth: '1px',
                    },
                  },
                  '& .MuiInputBase-input': {
                    py: 2.5,
                    px: 3,
                    color: theme.text.primary,
                    '&::placeholder': {
                      color: theme.text.muted,
                      opacity: 0.6,
                    },
                  },
                }}
                InputProps={{
                  endAdornment: (
                    <IconButton
                      onClick={handleSendMessage}
                      disabled={!message.trim() || isStreaming}
                      sx={{
                        color: message.trim() && !isStreaming ? theme.brand.primary : theme.text.disabled,
                        '&:hover': {
                          bgcolor: 'rgba(100, 149, 237, 0.1)',
                        },
                      }}
                    >
                      <SendIcon size={20} />
                    </IconButton>
                  ),
                }}
              />

              {/* Bottom Controls - Research & Model Selector */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mt: 3,
                  gap: 2,
                }}
              >
                {/* Research Mode Button */}
                <Button
                  onClick={() => setResearchMode(!researchMode)}
                  sx={{
                    padding: '12px 20px',
                    backgroundColor: researchMode
                      ? theme.button.interactive.bg
                      : theme.background.secondary,
                    border: researchMode
                      ? `1px solid ${theme.brand.primary}`
                      : `1px solid ${theme.border.subtle}`,
                    borderRadius: '24px',
                    color: researchMode ? theme.brand.muted : theme.text.muted,
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    letterSpacing: '0.3px',
                    textTransform: 'none',
                    boxShadow: researchMode
                      ? `0 0 15px ${theme.brand.muted}26`
                      : 'none',
                    '&:hover': {
                      backgroundColor: researchMode
                        ? theme.button.interactive.hover
                        : theme.background.tertiary,
                      borderColor: researchMode ? theme.brand.hover : theme.border.default,
                      color: researchMode ? theme.brand.mutedDark : theme.text.secondary,
                    },
                  }}
                >
                  <SearchIcon size={16} />
                  <span>Research</span>
                </Button>

                {/* Model Selector - Horizontal Icons */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    padding: '4px 8px',
                    backgroundColor: theme.background.secondary,
                    borderRadius: '12px',
                    border: `1px solid ${theme.border.subtle}`,
                  }}
                >
                  {modelOptions.map((model) => (
                    <Tooltip
                      key={model.id}
                      title={model.available ? model.name : `${model.name} (未配置)`}
                      placement="top"
                    >
                      <Box
                        onClick={() => {
                          if (model.available) {
                            setSelectedModelId(model.id);
                          }
                        }}
                        sx={{
                          position: 'relative',
                          width: '40px',
                          height: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: model.available ? 'pointer' : 'not-allowed',
                          borderRadius: '8px',
                          border: '2px solid transparent',
                          backgroundColor:
                            selectedModelId === model.id
                              ? 'rgba(144, 202, 249, 0.15)'
                              : 'transparent',
                          transition: 'all 0.2s ease',
                          padding: '4px',
                          opacity: model.available ? 1 : 0.3,
                          '&:hover': {
                            backgroundColor:
                              selectedModelId === model.id
                                ? 'rgba(144, 202, 249, 0.15)'
                                : model.available
                                ? theme.background.hover
                                : 'transparent',
                          },
                        }}
                      >
                        <Box
                          component="img"
                          src={model.icon}
                          alt={model.provider}
                          sx={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            objectFit: 'contain',
                            filter: !model.available
                              ? 'grayscale(100%)'
                              : model.provider === 'OpenAI' && isDark
                              ? 'invert(1)'
                              : 'none',
                          }}
                          onError={(e: any) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
        ) : (
          /* 对话状态 - 消息列表 */
          <Box
            ref={scrollContainerRef}
            onScroll={handleScroll}
            sx={{
              flex: 1,
              width: '100%',
              maxWidth: isMobile || isSmallScreen ? '100%' : '1000px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile || isSmallScreen ? 2 : 3,
              px: isMobile || isSmallScreen ? 0 : 0,
              // 移动端底部留出空间给固定的输入框
              pb: isMobile || isSmallScreen ? 16 : 0,
              '&::-webkit-scrollbar': { width: 6 },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': { background: `${theme.brand.primary}50`, borderRadius: 3 },
            }}
          >
            {messages.map((msg) => {
              // Use EnhancedMessage if message has research_data
              if (msg.research_data) {
                return <EnhancedMessage key={msg.id} message={msg} modelIcon={msg.modelIcon} />;
              }
              return <ChatMessage key={msg.id} message={msg} modelIcon={msg.modelIcon} />;
            })}

            {/* Research Progress Cards */}
            {researchInProgress && (
              <>
                {researchStatus && (
                  <ResearchStatusCard
                    status={researchStatus}
                    sourcesCount={Object.values(researchSources).reduce(
                      (a, b) => a + b,
                      0
                    )}
                    currentSource={currentSourceReading}
                  />
                )}
                <TypingIndicator />
              </>
            )}

            {/* Regular chat streaming indicator */}
            {isStreaming && !researchInProgress && (
              <TypingIndicator />
            )}

            <div ref={messagesEndRef} />
          </Box>
        )}
      </Box>

      {/* 底部输入框（对话状态时显示） */}
      {!isEmpty && (
        <Box
          sx={{
            position: isMobile || isSmallScreen ? 'fixed' : 'relative',
            // 键盘弹出时调整底部位置
            bottom: isKeyboardVisible ? keyboardHeight : 0,
            left: 0,
            right: 0,
            borderTop: `1px solid ${theme.border.subtle}`,
            bgcolor: theme.background.primary,
            p: isMobile || isSmallScreen ? 1.5 : 2,
            zIndex: 100,
            // 平滑过渡
            transition: 'bottom 0.2s ease-out',
          }}
        >
          <Box sx={{ maxWidth: isMobile || isSmallScreen ? '100%' : '1000px', mx: 'auto' }}>
            {/* Bottom Controls - Research & Model Selector */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 1.5,
                gap: 2,
              }}
            >
              {/* Research Mode Button */}
              <Button
                onClick={() => setResearchMode(!researchMode)}
                sx={{
                  padding: '12px 20px',
                  backgroundColor: researchMode
                    ? theme.button.interactive.bg
                    : theme.background.secondary,
                  border: researchMode
                    ? `1px solid ${theme.brand.primary}`
                    : `1px solid ${theme.border.subtle}`,
                  borderRadius: '24px',
                  color: researchMode ? theme.brand.muted : theme.text.muted,
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  letterSpacing: '0.3px',
                  textTransform: 'none',
                  boxShadow: researchMode
                    ? `0 0 15px ${theme.brand.muted}26`
                    : 'none',
                  '&:hover': {
                    backgroundColor: researchMode
                      ? theme.button.interactive.hover
                      : theme.background.tertiary,
                    borderColor: researchMode ? theme.brand.hover : theme.border.default,
                    color: researchMode ? theme.brand.mutedDark : theme.text.secondary,
                  },
                }}
              >
                <SearchIcon size={16} />
                <span>Research</span>
              </Button>

              {/* Model Selector - Horizontal Icons */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  padding: '4px 8px',
                  backgroundColor: theme.background.secondary,
                  borderRadius: '12px',
                  border: `1px solid ${theme.border.subtle}`,
                }}
              >
                {modelOptions.map((model) => (
                  <Tooltip
                    key={model.id}
                    title={model.available ? model.name : `${model.name} (未配置)`}
                    placement="top"
                  >
                    <Box
                      onClick={() => {
                        if (model.available) {
                          setSelectedModelId(model.id);
                        }
                      }}
                      sx={{
                        position: 'relative',
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: model.available ? 'pointer' : 'not-allowed',
                        borderRadius: '8px',
                        border: '2px solid transparent',
                        backgroundColor:
                          selectedModelId === model.id
                            ? 'rgba(144, 202, 249, 0.15)'
                            : 'transparent',
                        transition: 'all 0.2s ease',
                        padding: '4px',
                        opacity: model.available ? 1 : 0.3,
                        '&:hover': {
                          backgroundColor:
                            selectedModelId === model.id
                              ? 'rgba(144, 202, 249, 0.15)'
                              : model.available
                              ? theme.background.hover
                              : 'transparent',
                        },
                      }}
                    >
                      <Box
                        component="img"
                        src={model.icon}
                        alt={model.provider}
                        sx={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          objectFit: 'contain',
                          filter: !model.available
                            ? 'grayscale(100%)'
                            : model.provider === 'OpenAI' && isDark
                            ? 'invert(1)'
                            : 'none',
                        }}
                        onError={(e: any) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            </Box>

            <TextField
              fullWidth
              multiline
              maxRows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="继续对话..."
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: theme.background.secondary,
                  borderRadius: '8px',
                  '& fieldset': {
                    borderColor: theme.border.subtle,
                  },
                  '&:hover fieldset': {
                    borderColor: theme.border.default,
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: theme.brand.primary,
                  },
                },
              }}
              InputProps={{
                endAdornment: (
                  <IconButton
                    onClick={handleSendMessage}
                    disabled={!message.trim() || isStreaming}
                    sx={{
                      color: message.trim() && !isStreaming ? theme.brand.primary : theme.text.disabled,
                    }}
                  >
                    <SendIcon size={20} />
                  </IconButton>
                ),
              }}
            />
          </Box>
        </Box>
      )}

      {/* 历史记录侧边栏 */}
      <SwipeableDrawer
        anchor="right"
        open={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
        onOpen={() => setHistoryDrawerOpen(true)}
        disableBackdropTransition={false}
        disableDiscovery={false}
        sx={{
          '& .MuiDrawer-paper': {
            width: isMobile || isSmallScreen ? '85%' : 320,
            maxWidth: 360,
            bgcolor: theme.background.secondary,
            borderLeft: `1px solid ${theme.border.subtle}`,
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            历史对话
          </Typography>
          <List>
            {conversations.map((conv) => (
              <ListItem key={conv.id} disablePadding>
                <ListItemButton
                  onClick={() => loadConversation(conv.id)}
                  selected={conv.id === currentConversationId}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    minHeight: 48, // 增加触摸区域
                    '&.Mui-selected': {
                      bgcolor: `rgba(100, 149, 237, 0.12)`,
                      borderLeft: `3px solid ${theme.brand.primary}`,
                    },
                  }}
                >
                  <ListItemText
                    primary={conv.title}
                    secondary={new Date(conv.created_at).toLocaleDateString()}
                    primaryTypographyProps={{
                      sx: {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </SwipeableDrawer>
    </Box>
  );
}
