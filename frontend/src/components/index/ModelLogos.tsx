/**
 * LLM Provider Logos — 使用 @lobehub/icons-static-png CDN 图标
 * 与 /agent 页面保持一致
 */

import { Box } from '@mui/material';

const LOBEHUB_CDN = 'https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files';

/** Provider → 图标 URL 映射 */
const LOGO_MAP: Record<string, { dark: string; light?: string }> = {
  anthropic: {
    dark: `${LOBEHUB_CDN}/dark/claude-color.png`,
  },
  openai: {
    dark: `${LOBEHUB_CDN}/light/openai.png`,
    light: `${LOBEHUB_CDN}/dark/openai.png`,
  },
  deepseek: {
    dark: `${LOBEHUB_CDN}/dark/deepseek-color.png`,
  },
  google: {
    dark: `${LOBEHUB_CDN}/dark/gemini-color.png`,
  },
  qwen: {
    dark: `${LOBEHUB_CDN}/dark/qwen-color.png`,
  },
  dashscope: {
    dark: `${LOBEHUB_CDN}/dark/qwen-color.png`,
  },
  minimax: {
    dark: `${LOBEHUB_CDN}/dark/minimax-color.png`,
  },
};

/** Provider 品牌色（与 AgentChatPage 一致） */
const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#CC8F68',
  openai: '#10A37F',
  deepseek: '#3B82F6',
  google: '#F48FB1',
  qwen: '#A855F7',
  dashscope: '#A855F7',
  minimax: '#FFB74D',
};

export function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] || '#9E9E9E';
}

/** 根据 provider 渲染图标 */
export function ModelLogo({
  provider,
  size = 20,
  isDark = true,
}: {
  provider: string;
  size?: number;
  isDark?: boolean;
}) {
  const key = provider.toLowerCase();
  const urls = LOGO_MAP[key];

  if (!urls) {
    // fallback: 首字母圆形
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: 'rgba(128,128,128,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.5,
          fontWeight: 700,
          color: 'rgba(128,128,128,0.6)',
          flexShrink: 0,
        }}
      >
        {provider.charAt(0).toUpperCase()}
      </Box>
    );
  }

  const src = isDark ? urls.dark : (urls.light || urls.dark);

  return (
    <Box
      component="img"
      src={src}
      alt={provider}
      sx={{
        width: size,
        height: size,
        borderRadius: '4px',
        objectFit: 'contain',
        flexShrink: 0,
      }}
      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}

/** Provider 显示名称映射 */
export function getProviderDisplayName(provider: string): string {
  const map: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    google: 'Google',
    qwen: 'Qwen',
    dashscope: 'Qwen',
    minimax: 'MiniMax',
  };
  return map[provider.toLowerCase()] || provider;
}
