/**
 * uchu_trade 配色系统 - 蓝色主题版本
 *
 * 核心主题色（实际使用的蓝色系）：
 * - C1: 道奇蓝 #6495ed - 主色调（按钮、标题、图标、选中状态）
 * - C2: 浅蓝 #90caf9 - 次要按钮、徽章、标题高亮
 * - C3: 紫蓝 #667eea / #764ba2 - 渐变背景、装饰
 * - C4: 深蓝灰 #7d9bb8 / #8ca8c2 - 分析卡片、Pending状态
 * - C5: 翠绿 #2EE5AC - 成功状态、正向数据（辅助色）
 *
 * 背景色系（深色）：
 * - BG1: 极深黑 #0a0a0a - 最底层背景
 * - BG2: 主背景 #181c1f/#212121 - Body/Root
 * - BG3: 次背景 #1E1E1E - Paper/卡片
 * - BG4: 卡片背景 #262830 - 内容卡片
 * - BG5: 悬浮状态 #2e3039 - Hover效果
 *
 * 状态颜色：
 * - S1: 成功 #10b981/#4caf50
 * - S2: 警告 #f59e0b
 * - S3: 错误 #ef4444/#f44336
 * - S4: 信息 #3b82f6/#90caf9
 *
 * 交易配色：
 * - T1: 买入 #198754/#5eddac
 * - T2: 卖出 #DC3545/#f57ad0
 * - T3: 中性 #90caf9
 *
 * 文字颜色：
 * - TXT1: 主文字 #ffffff
 * - TXT2: 次要文字 #e5e7eb/#888888
 * - TXT3: 静音文字 #8b8d94
 * - TXT4: 禁用文字 #6b6d74
 */

export interface ColorScheme {
  mode: 'light' | 'dark';
  background: {
    deepest: string;      // BG1 - 极深黑（仅深色模式）
    primary: string;      // BG2 - 主背景
    secondary: string;    // BG3 - 次背景
    tertiary: string;     // BG4 - 卡片背景
    quaternary: string;
    hover: string;        // BG5 - 悬浮状态
    active: string;
  };
  border: {
    default: string;
    hover: string;
    active: string;
    subtle: string;
  };
  text: {
    primary: string;      // TXT1 - 主文字
    secondary: string;    // TXT2 - 次要文字
    tertiary?: string;    // 第三级文字
    muted: string;        // TXT3 - 静音文字
    disabled: string;     // TXT4 - 禁用文字
  };
  brand: {
    primary: string;      // C1 - 道奇蓝主色
    secondary: string;    // C2 - 浅蓝次要色
    hover: string;
    active: string;
    accent: string;       // C3 - 紫蓝渐变起点
    accentDark?: string;  // C3 - 紫蓝渐变终点
    muted?: string;       // C4 - 深蓝灰
    mutedDark?: string;   // C4 - 浅深蓝灰
    success?: string;     // C5 - 翠绿（成功/正向）
  };
  status: {
    success: string;      // S1 - 成功
    warning: string;      // S2 - 警告
    error: string;        // S3 - 错误
    info: string;         // S4 - 信息
    running: string;
    paused: string;
    stopped: string;
    completed: string;
    failed: string;
    analyzing?: string;   // 分析中状态
  };
  trading: {
    buy: string;          // T1 - 买入深色
    buyLight: string;     // T1 - 买入亮色
    sell: string;         // T2 - 卖出深色
    sellLight: string;    // T2 - 卖出亮色
    profit: string;       // T1 - 盈利（翠绿）
    loss: string;         // T2 - 亏损（粉红）
    neutral: string;      // T3 - 中性
  };
  button: {
    primary: { bg: string; hover: string; active: string; text: string };       // 使用 C1
    secondary: { bg: string; hover: string; active: string; text: string; border: string };
    success: { bg: string; hover: string; active: string; text: string };       // 使用 S1
    danger: { bg: string; hover: string; active: string; text: string };        // 使用 S3
    warning: { bg: string; hover: string; active: string; text: string };       // 使用 S2
    info: { bg: string; hover: string; active: string; text: string };          // 使用 S4
    interactive: { bg: string; hover: string; active: string; text: string };   // 使用 C3
    emphasis: { bg: string; hover: string; active: string; text: string };      // 使用 C4
    gradient?: { bg: string; hover: string; active: string; text: string };     // 渐变按钮
    muted?: { bg: string; hover: string; active: string; text: string };        // 静音按钮
  };
  effects: {
    gradient: {
      primary: string;
      secondary: string;
      light?: string;
      dark: string;
    };
    shadow: {
      sm: string;
      md: string;
      lg: string;
      xl: string;
      glow: string;
    };
  };
  code: {
    background: string;
    keyword: string;
    string: string;
    comment: string;
    function: string;
    variable: string;
    operator: string;
    number: string;
    selection: string;
    cursor: string;
  };
}

// 深色主题（uchu_trade 原配色）
export const darkTheme: ColorScheme = {
  mode: 'dark',

  background: {
    deepest: '#0a0a0a',      // BG1 - 极深黑
    primary: '#181c1f',      // BG2 - 主背景
    secondary: '#1E1E1E',    // BG3 - 次背景/Paper
    tertiary: '#262830',     // BG4 - 卡片背景
    quaternary: '#2e3039',
    hover: '#2e3039',        // BG5 - 悬浮状态
    active: '#353843',
  },

  border: {
    default: '#333333',
    hover: '#444444',
    active: '#555555',
    subtle: 'rgba(255, 255, 255, 0.12)',
  },

  text: {
    primary: '#ffffff',      // TXT1 - 主文字
    secondary: '#e5e7eb',    // TXT2 - 次要文字
    muted: '#8b8d94',        // TXT3 - 静音文字
    disabled: '#6b6d74',     // TXT4 - 禁用文字
  },

  brand: {
    primary: '#6495ed',      // C1 - 道奇蓝主色（实际主色调）
    secondary: '#90caf9',    // C2 - 浅蓝次要色
    hover: '#5578d9',        // C1 hover
    active: '#4a67c4',       // C1 active
    accent: '#667eea',       // C3 - 紫蓝渐变起点
    accentDark: '#764ba2',   // C3 - 紫蓝渐变终点
    muted: '#7d9bb8',        // C4 - 深蓝灰
    mutedDark: '#8ca8c2',    // C4 - 浅深蓝灰
    success: '#2EE5AC',      // C5 - 翠绿（成功/正向）
  },

  status: {
    success: '#4caf50',      // S1 - 成功（绿色）
    warning: '#ff9800',      // S2 - 警告（橙色）
    error: '#f44336',        // S3 - 错误（红色）
    info: '#90caf9',         // S4 - 信息（浅蓝）
    running: '#6495ed',      // C1 - 运行中（道奇蓝）
    paused: '#ff9800',       // S2 - 暂停
    stopped: '#9e9e9e',      // 灰色
    completed: '#4caf50',    // S1 - 已完成（绿色）
    failed: '#f44336',       // S3 - 失败（红色）
    analyzing: '#b39ddb',    // 分析中（紫色）
  },

  trading: {
    buy: '#1b5e20',          // T1 - 买入深色
    buyLight: '#4caf50',     // T1 - 买入亮色（绿色）
    sell: '#b71c1c',         // T2 - 卖出深色
    sellLight: '#f44336',    // T2 - 卖出亮色（红色）
    profit: '#66bb6a',       // T1 - 盈利（浅绿）
    loss: '#ef5350',         // T2 - 亏损（浅红）
    neutral: '#90caf9',      // T3 - 中性（浅蓝）
  },

  button: {
    // C1 - 主要按钮（道奇蓝）
    primary: {
      bg: '#6495ed',         // C1 - 道奇蓝
      hover: '#5578d9',
      active: '#4a67c4',
      text: '#ffffff',
    },
    // C2 - 次要按钮（浅蓝）
    secondary: {
      bg: 'transparent',
      hover: 'rgba(100, 149, 237, 0.08)',
      active: 'rgba(100, 149, 237, 0.16)',
      text: '#6495ed',       // C1
      border: '#6495ed',     // C1
    },
    // S1 - 成功按钮（绿色）
    success: {
      bg: '#4caf50',         // S1
      hover: '#43a047',
      active: '#388e3c',
      text: '#ffffff',
    },
    // S3 - 危险按钮（红色）
    danger: {
      bg: '#f44336',         // S3
      hover: '#e53935',
      active: '#d32f2f',
      text: '#ffffff',
    },
    // S2 - 警告按钮（橙色）
    warning: {
      bg: '#ff9800',         // S2
      hover: '#fb8c00',
      active: '#f57c00',
      text: '#ffffff',
    },
    // S4 - 信息按钮（浅蓝）
    info: {
      bg: '#90caf9',         // S4 - 浅蓝
      hover: '#64b5f6',
      active: '#42a5f5',
      text: '#000000',
    },
    // C3 - 紫蓝渐变按钮
    gradient: {
      bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',  // C3
      hover: 'linear-gradient(135deg, #5a6fd9 0%, #6a4291 100%)',
      active: 'linear-gradient(135deg, #4e5fc8 0%, #5e3a80 100%)',
      text: '#ffffff',
    },
    // C4 - 深蓝灰按钮
    muted: {
      bg: '#7d9bb8',         // C4
      hover: '#6d8aa8',
      active: '#5d7a98',
      text: '#ffffff',
    },
    // C3 - 交互按钮
    interactive: {
      bg: '#667eea',         // C3
      hover: '#5a6fd9',
      active: '#4e5fc8',
      text: '#ffffff',
    },
    // C4 - 强调按钮
    emphasis: {
      bg: '#7d9bb8',         // C4
      hover: '#6d8aa8',
      active: '#5d7a98',
      text: '#ffffff',
    },
  },

  effects: {
    gradient: {
      primary: 'linear-gradient(135deg, #6495ed 0%, #5578d9 100%)',      // C1 - 道奇蓝渐变
      secondary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',    // C3 - 紫蓝渐变
      light: 'linear-gradient(135deg, #90caf9 0%, #6495ed 100%)',        // C2 → C1
      dark: 'linear-gradient(180deg, #181c1f 0%, #1E1E1E 100%)',
    },
    shadow: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
      md: '0 4px 6px rgba(0, 0, 0, 0.4)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.5)',
      xl: '0 20px 25px rgba(0, 0, 0, 0.6)',
      glow: '0 0 20px rgba(46, 229, 172, 0.4)',                         // C1 光晕
    },
  },

  code: {
    background: '#0d0e11',
    keyword: '#2EE5AC',      // C1
    string: '#f59e0b',       // S2
    comment: '#8b8d94',      // TXT3
    function: '#6495ed',     // C3
    variable: '#5eddac',     // C1 亮色
    operator: '#f57ad0',     // C2
    number: '#7b61ff',       // C4
    selection: 'rgba(46, 229, 172, 0.2)',
    cursor: '#2EE5AC',       // C1
  },
};

// 浅色主题（适配 uchu_trade 配色 - 柔和版本）
export const lightTheme: ColorScheme = {
  mode: 'light',

  background: {
    deepest: '#e8eaed',
    primary: '#f5f7f9',      // 柔和的浅灰蓝 - 不刺眼的背景
    secondary: '#eef1f5',    // 稍深的浅灰蓝 - Paper/Drawer
    tertiary: '#e8ecf1',     // 卡片背景 - 带点灰调
    quaternary: '#dde2e8',
    hover: '#d4dae2',
    active: '#c5ccd6',
  },

  border: {
    default: '#d1d8e0',      // 浅蓝灰边框
    hover: '#b8c4d3',
    active: '#9daab8',
    subtle: 'rgba(26, 35, 50, 0.08)',  // 带点蓝调的半透明
  },

  text: {
    primary: '#1a2332',      // TXT1 - 深蓝灰色（更柔和）
    secondary: '#5b6b7f',    // TXT2 - 中蓝灰色
    muted: '#8591a3',        // TXT3 - 浅蓝灰色
    disabled: '#b8c1cc',     // TXT4 - 很浅的蓝灰色
  },

  brand: {
    primary: '#6495ed',      // C1 - 道奇蓝主色（保持一致）
    secondary: '#90caf9',    // C2 - 浅蓝次要色
    hover: '#5578d9',
    active: '#4a67c4',
    accent: '#667eea',       // C3 - 紫蓝渐变起点
    accentDark: '#764ba2',   // C3 - 紫蓝渐变终点
    muted: '#7d9bb8',        // C4 - 深蓝灰
    mutedDark: '#8ca8c2',    // C4 - 浅深蓝灰
    success: '#2EE5AC',      // C5 - 翠绿（成功/正向）
  },

  status: {
    success: '#4caf50',      // S1 - 成功（绿色）
    warning: '#ff9800',      // S2 - 警告（橙色）
    error: '#f44336',        // S3 - 错误（红色）
    info: '#64b5f6',         // S4 - 信息（蓝色，浅色模式用更深的）
    running: '#6495ed',      // C1 - 运行中（道奇蓝）
    paused: '#ff9800',       // S2 - 暂停
    stopped: '#757575',      // 灰色
    completed: '#4caf50',    // S1 - 已完成（绿色）
    failed: '#f44336',       // S3 - 失败（红色）
    analyzing: '#ba68c8',    // 分析中（紫色）
  },

  trading: {
    buy: '#2e7d32',          // T1 - 买入深绿
    buyLight: '#4caf50',     // T1 - 买入浅绿
    sell: '#c62828',         // T2 - 卖出深红
    sellLight: '#f44336',    // T2 - 卖出浅红
    profit: '#66bb6a',       // T1 - 盈利（浅绿）
    loss: '#ef5350',         // T2 - 亏损（浅红）
    neutral: '#90caf9',      // T3 - 中性（浅蓝）
  },

  button: {
    // C1 - 主要按钮（道奇蓝）
    primary: {
      bg: '#6495ed',         // C1 - 道奇蓝
      hover: '#5578d9',
      active: '#4a67c4',
      text: '#ffffff',
    },
    // C2 - 次要按钮（浅蓝）
    secondary: {
      bg: 'transparent',
      hover: 'rgba(100, 149, 237, 0.1)',
      active: 'rgba(100, 149, 237, 0.18)',
      text: '#4a67c4',       // C1 深色版本（浅色模式）
      border: '#6495ed',     // C1
    },
    // S1 - 成功按钮（绿色）
    success: {
      bg: '#4caf50',         // S1
      hover: '#43a047',
      active: '#388e3c',
      text: '#ffffff',
    },
    // S3 - 危险按钮（红色）
    danger: {
      bg: '#f44336',         // S3
      hover: '#e53935',
      active: '#d32f2f',
      text: '#ffffff',
    },
    // S2 - 警告按钮（橙色）
    warning: {
      bg: '#ff9800',         // S2
      hover: '#fb8c00',
      active: '#f57c00',
      text: '#ffffff',
    },
    // S4 - 信息按钮（浅蓝）
    info: {
      bg: '#64b5f6',         // S4 - 浅蓝（浅色模式用更深的）
      hover: '#42a5f5',
      active: '#2196f3',
      text: '#ffffff',
    },
    // C3 - 紫蓝渐变按钮
    gradient: {
      bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',  // C3
      hover: 'linear-gradient(135deg, #5a6fd9 0%, #6a4291 100%)',
      active: 'linear-gradient(135deg, #4e5fc8 0%, #5e3a80 100%)',
      text: '#ffffff',
    },
    // C4 - 深蓝灰按钮
    muted: {
      bg: '#7d9bb8',         // C4
      hover: '#6d8aa8',
      active: '#5d7a98',
      text: '#ffffff',
    },
    // C3 - 交互按钮
    interactive: {
      bg: '#667eea',         // C3
      hover: '#5a6fd9',
      active: '#4e5fc8',
      text: '#ffffff',
    },
    // C4 - 强调按钮
    emphasis: {
      bg: '#7d9bb8',         // C4
      hover: '#6d8aa8',
      active: '#5d7a98',
      text: '#ffffff',
    },
  },

  effects: {
    gradient: {
      primary: 'linear-gradient(135deg, #2EE5AC 0%, #27CC98 100%)',
      secondary: 'linear-gradient(135deg, #5eddac 0%, #f57ad0 100%)',
      dark: 'linear-gradient(180deg, #f5f7f9 0%, #eef1f5 100%)',  // 柔和渐变
    },
    shadow: {
      sm: '0 1px 3px rgba(26, 35, 50, 0.08)',      // 带蓝调的阴影
      md: '0 4px 8px rgba(26, 35, 50, 0.10)',
      lg: '0 10px 20px rgba(26, 35, 50, 0.12)',
      xl: '0 20px 30px rgba(26, 35, 50, 0.15)',
      glow: '0 0 20px rgba(46, 229, 172, 0.25)',   // 柔和的光晕
    },
  },

  code: {
    background: '#f5f5f5',
    keyword: '#1b7e5a',
    string: '#d97706',
    comment: '#9ca3af',
    function: '#4a67c4',
    variable: '#26a69a',
    operator: '#c62828',
    number: '#6b50eb',
    selection: 'rgba(46, 229, 172, 0.15)',
    cursor: '#2EE5AC',
  },
};

// 默认主题（深色）
export const defaultTheme = darkTheme;
