import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'uteki.open',
  description: '开源AI量化交易平台 - 面向个人交易者的专业工具',
  lang: 'zh-CN',

  // 主题配置
  themeConfig: {
    logo: '/logo.svg',

    // 导航栏
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/getting-started/quickstart' },
      { text: '指南', link: '/guide/introduction' },
      { text: '架构', link: '/architecture/overview' },
      { text: 'API参考', link: '/api/admin' },
      {
        text: '资源',
        items: [
          { text: 'GitHub', link: 'https://github.com/yourusername/uteki.open' },
          { text: '更新日志', link: '/changelog' },
          { text: '常见问题', link: '/faq' }
        ]
      }
    ],

    // 侧边栏
    sidebar: {
      '/getting-started/': [
        {
          text: '快速开始',
          items: [
            { text: '介绍', link: '/getting-started/introduction' },
            { text: '快速启动', link: '/getting-started/quickstart' },
            { text: '完整部署', link: '/getting-started/deployment' },
            { text: '首次配置', link: '/getting-started/first-setup' }
          ]
        }
      ],

      '/guide/': [
        {
          text: '用户指南',
          items: [
            { text: '项目介绍', link: '/guide/introduction' },
            { text: '核心概念', link: '/guide/concepts' },
            { text: '系统架构', link: '/guide/architecture' }
          ]
        },
        {
          text: '功能模块',
          items: [
            { text: 'Admin - 系统管理', link: '/guide/modules/admin' },
            { text: 'Agent - AI代理', link: '/guide/modules/agent' },
            { text: 'Trading - 交易执行', link: '/guide/modules/trading' },
            { text: 'Data - 数据采集', link: '/guide/modules/data' },
            { text: 'Evaluation - 评估测试', link: '/guide/modules/evaluation' },
            { text: 'Dashboard - 可视化', link: '/guide/modules/dashboard' }
          ]
        },
        {
          text: 'Agent开发',
          items: [
            { text: 'Agent概述', link: '/guide/agent/overview' },
            { text: 'Trading Agent', link: '/guide/agent/trading-agent' },
            { text: 'Investing Agent', link: '/guide/agent/investing-agent' },
            { text: 'Research Agent', link: '/guide/agent/research-agent' },
            { text: '自定义Agent', link: '/guide/agent/custom-agent' }
          ]
        }
      ],

      '/architecture/': [
        {
          text: '架构设计',
          items: [
            { text: '总体架构', link: '/architecture/overview' },
            { text: 'DDD设计', link: '/architecture/ddd' },
            { text: 'Agent扩展策略', link: '/architecture/agent-extension' },
            { text: '数据库策略', link: '/architecture/database' },
            { text: '前端架构', link: '/architecture/frontend' }
          ]
        },
        {
          text: '开发规范',
          items: [
            { text: '代码组织', link: '/architecture/code-organization' },
            { text: '命名规范', link: '/architecture/naming-convention' },
            { text: '文档规范', link: '/architecture/documentation' },
            { text: 'Git工作流', link: '/architecture/git-workflow' }
          ]
        },
        {
          text: '架构决策记录 (ADR)',
          items: [
            { text: 'ADR-001: 选择DDD架构', link: '/architecture/adr/001-ddd' },
            { text: 'ADR-002: 多数据库策略', link: '/architecture/adr/002-multi-database' },
            { text: 'ADR-003: Agent框架设计', link: '/architecture/adr/003-agent-framework' },
            { text: 'ADR-004: 文档系统选型', link: '/architecture/adr/004-documentation' }
          ]
        }
      ],

      '/api/': [
        {
          text: 'API参考',
          items: [
            { text: 'Admin API', link: '/api/admin' },
            { text: 'Agent API', link: '/api/agent' },
            { text: 'Trading API', link: '/api/trading' },
            { text: 'Data API', link: '/api/data' },
            { text: 'Evaluation API', link: '/api/evaluation' }
          ]
        }
      ]
    },

    // 社交链接
    socialLinks: [
      { icon: 'github', link: 'https://github.com/yourusername/uteki.open' }
    ],

    // 页脚
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present uteki.open'
    },

    // 搜索
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换'
            }
          }
        }
      }
    },

    // 编辑链接
    editLink: {
      pattern: 'https://github.com/yourusername/uteki.open/edit/main/docs-site/:path',
      text: '在 GitHub 上编辑此页'
    },

    // 最后更新时间
    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'short'
      }
    }
  },

  // Markdown配置
  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    }
  },

  // 站点地图
  sitemap: {
    hostname: 'https://docs.uteki.open'
  }
})
