/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // uchu_trade 品牌色系
        brand: {
          primary: '#2EE5AC',      // uchu_trade 标志性青绿色
          secondary: '#5eddac',    // 更亮的青绿
          hover: '#27CC98',
          active: '#25B989',
          accent: '#4ECDC4',       // 辅助青色
        },
        // 状态色
        status: {
          success: '#2EE5AC',      // 使用品牌色
          warning: '#ffa726',
          error: '#f44336',
          info: '#29b6f6',
          running: '#2EE5AC',
          paused: '#ffa726',
          stopped: '#9e9e9e',
          completed: '#29b6f6',
          failed: '#f44336',
        },
        // 交易专用色
        trading: {
          buy: '#1b5e20',          // 买入深绿
          buyLight: '#198754',
          sell: '#b71c1c',         // 卖出深红
          sellLight: '#DC3545',
          profit: '#5eddac',       // 利润亮青绿
          loss: '#f57ad0',         // 亏损粉色
        },
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(46, 229, 172, 0.2)',
        'glow': '0 0 20px rgba(46, 229, 172, 0.4)',
        'glow-lg': '0 0 30px rgba(46, 229, 172, 0.5)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #2EE5AC 0%, #27CC98 100%)',
        'gradient-brand-secondary': 'linear-gradient(135deg, #5eddac 0%, #4ECDC4 100%)',
        'gradient-dark': 'linear-gradient(180deg, #121212 0%, #1E1E1E 100%)',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          'Fira Sans',
          'Droid Sans',
          'Helvetica Neue',
          'sans-serif',
        ],
        mono: [
          'Source Code Pro',
          'Menlo',
          'Monaco',
          'Consolas',
          'Courier New',
          'monospace',
        ],
      },
      borderRadius: {
        'card': '12px',
        'button': '8px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'glow': 'glow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(46, 229, 172, 0.4)' },
          '50%': { boxShadow: '0 0 30px rgba(46, 229, 172, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}
