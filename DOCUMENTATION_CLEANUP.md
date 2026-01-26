# 文档清理记录

清理时间: 2026-01-27

---

## 📋 清理原则

1. **统一文档入口**: 所有文档迁移到`docs-site/`
2. **防止随意创建**: 禁止在`docs/`随意新增文档
3. **清晰的组织结构**: 按类别组织文档
4. **消除重复**: 删除冗余文档

---

## 📂 文档迁移记录

### 从 `docs/` 迁移到 `docs-site/`

| 原路径 | 新路径 | 状态 | 说明 |
|--------|--------|------|------|
| `docs/DATABASE_STRATEGY.md` | `docs-site/architecture/database-strategy.md` | ✅ 已迁移 | 多数据库架构说明 |
| `docs/DATA_DISTRIBUTION.md` | `docs-site/architecture/data-distribution.md` | 🔄 待迁移 | 数据分发策略 |
| `docs/DEPLOYMENT_GUIDE.md` | `docs-site/getting-started/deployment.md` | 🔄 待迁移 | 完整部署指南 |
| `docs/FAQ.md` | `docs-site/faq.md` | 🔄 待迁移 | 常见问题 |
| `docs/ARCHITECTURE.md` | `docs-site/architecture/agent-extension.md` | ✅ 已复制 | Agent扩展策略 |

### 保留在根目录的文档

| 文件 | 用途 | 原因 |
|------|------|------|
| `README.md` | 项目概览 | GitHub首页展示 |
| `QUICKSTART.md` | 5分钟快速启动 | 快速参考 |
| `CONTRIBUTING.md` | 贡献指南 | GitHub规范文件 |
| `IMPLEMENTATION_SUMMARY.md` | 实施总结 | 项目状态记录 |

### 保留在 `docs/` 的文档

| 文件 | 用途 | 原因 |
|------|------|------|
| `docs/ARCHITECTURE.md` | 架构设计 | 技术参考文档 |

**说明**: `docs/`目录现在作为**技术参考文档**目录，只存放：
- 架构设计文档
- ADR（架构决策记录）
- 技术规范文档

**不允许**在`docs/`随意创建markdown文件。新文档必须在`docs-site/`创建。

---

## 🗑️ 删除的文档

| 文件 | 删除原因 |
|------|----------|
| `VERIFICATION_REPORT.md` | 内容已整合到`IMPLEMENTATION_SUMMARY.md` |

---

## 📚 文档站点结构 (`docs-site/`)

```
docs-site/
├── index.md                           # 首页
├── faq.md                            # 常见问题
│
├── getting-started/                  # 快速开始
│   ├── quickstart.md                 # 5分钟启动
│   ├── deployment.md                 # 完整部署指南
│   └── first-setup.md                # 首次配置 (待创建)
│
├── guide/                            # 用户指南
│   ├── introduction.md               # 项目介绍 (待创建)
│   ├── concepts.md                   # 核心概念 (待创建)
│   ├── modules/                      # 功能模块
│   │   ├── admin.md                  # Admin模块 (待创建)
│   │   ├── agent.md                  # Agent模块 (待创建)
│   │   ├── trading.md                # Trading模块 (待创建)
│   │   ├── data.md                   # Data模块 (待创建)
│   │   └── evaluation.md             # Evaluation模块 (待创建)
│   └── agent/                        # Agent开发
│       ├── overview.md               # Agent概述 (待创建)
│       ├── trading-agent.md          # TradingAgent (待创建)
│       ├── investing-agent.md        # InvestingAgent (待创建)
│       └── custom-agent.md           # 自定义Agent (待创建)
│
├── architecture/                     # 架构设计
│   ├── overview.md                   # 总体架构 (待创建)
│   ├── ddd.md                        # DDD设计 (待创建)
│   ├── agent-extension.md            # Agent扩展策略 ✅
│   ├── database-strategy.md          # 数据库策略 ✅
│   ├── data-distribution.md          # 数据分发策略 (待迁移)
│   ├── code-organization.md          # 代码组织 (待创建)
│   └── adr/                          # 架构决策记录
│       ├── 001-ddd.md                # ADR-001 (待创建)
│       ├── 002-multi-database.md     # ADR-002 (待创建)
│       ├── 003-agent-framework.md    # ADR-003 (待创建)
│       └── 004-documentation.md      # ADR-004 ✅
│
└── api/                              # API参考
    ├── admin.md                      # Admin API (待创建)
    ├── agent.md                      # Agent API (待创建)
    ├── trading.md                    # Trading API (待创建)
    └── data.md                       # Data API (待创建)
```

---

## 🎯 后续任务

### 待迁移的文档

- [ ] 完成`DATA_DISTRIBUTION.md`迁移到`docs-site/architecture/data-distribution.md`
- [ ] 完成`DEPLOYMENT_GUIDE.md`迁移到`docs-site/getting-started/deployment.md`
- [ ] 完成`FAQ.md`迁移到`docs-site/faq.md`

### 待创建的文档

**Getting Started**:
- [ ] `first-setup.md` - 首次配置指南

**Guide**:
- [ ] `introduction.md` - 项目介绍
- [ ] `concepts.md` - 核心概念
- [ ] `modules/*.md` - 6个domain模块文档
- [ ] `agent/*.md` - Agent开发指南

**Architecture**:
- [ ] `overview.md` - 总体架构
- [ ] `ddd.md` - DDD设计详解
- [ ] `code-organization.md` - 代码组织规范
- [ ] `adr/001-003.md` - 前3个ADR

**API**:
- [ ] `admin.md` - Admin API参考
- [ ] `agent.md` - Agent API参考
- [ ] `trading.md` - Trading API参考
- [ ] `data.md` - Data API参考

### 待删除的旧文档

在确认所有内容迁移完成后：

- [ ] 删除`docs/DATABASE_STRATEGY.md`
- [ ] 删除`docs/DATA_DISTRIBUTION.md`
- [ ] 删除`docs/DEPLOYMENT_GUIDE.md`
- [ ] 删除`docs/FAQ.md`

---

## 📖 文档编写规范

参考 [CONTRIBUTING.md](CONTRIBUTING.md) 的文档规范部分：

1. **文件名**: 全小写，单词用`-`分隔（如`custom-agent.md`）
2. **目录名**: 全小写，单词用`-`分隔
3. **Frontmatter**: 必须包含`title`和`description`
4. **代码块**: 必须指定语言
5. **链接**: 使用相对路径
6. **图片**: 存放在`docs-site/public/`

---

## 🔗 相关文档

- [CONTRIBUTING.md](../CONTRIBUTING.md) - 开发规范
- [ADR-004: 文档系统选型](docs-site/architecture/adr/004-documentation.md)
- [docs-site/.vitepress/config.ts](docs-site/.vitepress/config.ts) - VitePress配置
