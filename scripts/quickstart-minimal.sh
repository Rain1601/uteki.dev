#!/bin/bash

# uteki.open 极简模式快速启动脚本
# 仅使用PostgreSQL（最小依赖）

set -e  # 遇到错误立即退出

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              uteki.open 极简模式启动                          ║${NC}"
echo -e "${BLUE}║              (仅需 PostgreSQL)                                ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}极简模式说明:${NC}"
echo -e "  - ${GREEN}✓${NC} PostgreSQL: 必需（主数据库）"
echo -e "  - ${YELLOW}⚠${NC} Redis: 不需要（缓存降级为内存）"
echo -e "  - ${YELLOW}⚠${NC} 其他服务: 不需要"
echo ""
echo -e "${BLUE}适合场景:${NC} 快速开发、测试Admin功能、最小资源占用"
echo ""

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ============================================================================
# Step 1: 检查前提条件
# ============================================================================

echo -e "${YELLOW}[1/5]${NC} 检查前提条件..."

# 检查Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python3未安装${NC}"
    exit 1
fi
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo -e "${GREEN}  ✓ Python $PYTHON_VERSION${NC}"

# 检查Poetry
if ! command -v poetry &> /dev/null; then
    echo -e "${YELLOW}  ⚠ Poetry未安装，尝试安装...${NC}"
    curl -sSL https://install.python-poetry.org | python3 -
    export PATH="$HOME/.local/bin:$PATH"
    if ! command -v poetry &> /dev/null; then
        echo -e "${RED}✗ Poetry安装失败${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}  ✓ Poetry已安装${NC}"

# 检查PostgreSQL
if ! command -v psql &> /dev/null; then
    echo -e "${RED}✗ PostgreSQL未安装${NC}"
    echo ""
    echo "请安装PostgreSQL:"
    echo "  brew install postgresql@15"
    echo "  brew services start postgresql@15"
    exit 1
fi
echo -e "${GREEN}  ✓ PostgreSQL已安装${NC}"

echo ""

# ============================================================================
# Step 2: 检查PostgreSQL服务
# ============================================================================

echo -e "${YELLOW}[2/5]${NC} 检查PostgreSQL服务..."

# 检查PostgreSQL是否运行
if ! psql -U "$USER" -d postgres -c "SELECT 1" &> /dev/null; then
    echo -e "${YELLOW}  ⚠ PostgreSQL未运行，尝试启动...${NC}"
    brew services start postgresql@15 || brew services start postgresql
    sleep 3

    if ! psql -U "$USER" -d postgres -c "SELECT 1" &> /dev/null; then
        echo -e "${RED}✗ PostgreSQL启动失败${NC}"
        echo "请手动启动: brew services start postgresql@15"
        exit 1
    fi
fi
echo -e "${GREEN}  ✓ PostgreSQL正在运行${NC}"

echo ""

# ============================================================================
# Step 3: 创建数据库
# ============================================================================

echo -e "${YELLOW}[3/5]${NC} 配置数据库..."

# 检查uteki数据库是否存在
if psql -U "$USER" -d postgres -lqt | cut -d \| -f 1 | grep -qw uteki; then
    echo -e "${GREEN}  ✓ 数据库uteki已存在${NC}"
else
    echo -e "${BLUE}  → 创建数据库和用户...${NC}"

    # 创建用户（如果不存在）
    psql -U "$USER" -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='uteki'" | grep -q 1 || \
        psql -U "$USER" -d postgres -c "CREATE USER uteki WITH PASSWORD 'uteki_dev_pass';" 2>/dev/null || true

    # 创建数据库
    psql -U "$USER" -d postgres -c "CREATE DATABASE uteki OWNER uteki;" 2>/dev/null || true

    # 授予权限
    psql -U "$USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE uteki TO uteki;" 2>/dev/null || true

    echo -e "${GREEN}  ✓ 数据库创建完成${NC}"
fi

# 创建配置文件
if [ ! -f "backend/.env" ]; then
    echo -e "${BLUE}  → 创建.env配置文件${NC}"
    cp backend/.env.example backend/.env
    echo -e "${GREEN}  ✓ .env已创建${NC}"
else
    echo -e "${GREEN}  ✓ .env已存在${NC}"
fi

echo ""

# ============================================================================
# Step 4: 安装Python依赖
# ============================================================================

echo -e "${YELLOW}[4/5]${NC} 安装Python依赖..."

cd backend

if [ ! -d ".venv" ]; then
    echo -e "${BLUE}  → 创建虚拟环境...${NC}"
    poetry install --no-interaction
    echo -e "${GREEN}  ✓ 依赖安装完成${NC}"
else
    echo -e "${GREEN}  ✓ 虚拟环境已存在${NC}"
    echo -e "${BLUE}  → 更新依赖...${NC}"
    poetry install --no-interaction --quiet
fi

cd ..

echo ""

# ============================================================================
# Step 5: 初始化数据库
# ============================================================================

echo -e "${YELLOW}[5/5]${NC} 初始化数据库..."

# 检查是否已初始化
if psql -U uteki -d uteki -c "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'admin'" 2>/dev/null | grep -q "1 row"; then
    echo -e "${GREEN}  ✓ 数据库已初始化${NC}"
else
    echo -e "${BLUE}  → 创建数据库表结构...${NC}"
    cd backend
    poetry run python ../scripts/init_database.py
    cd ..
    echo -e "${GREEN}  ✓ 数据库初始化完成${NC}"
fi

echo ""

# ============================================================================
# 启动提示
# ============================================================================

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    ✓ 启动准备完成！                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}运行模式: ${YELLOW}极简模式${NC}"
echo -e "${BLUE}PostgreSQL: ${GREEN}本地服务 (localhost:5432)${NC}"
echo -e "${BLUE}Redis: ${YELLOW}未启用 (降级为内存缓存)${NC}"
echo ""
echo -e "${YELLOW}系统将显示Redis警告，这是正常的！${NC}"
echo -e "${YELLOW}Admin Domain不需要Redis即可正常运行。${NC}"
echo ""
echo -e "${BLUE}现在启动FastAPI服务器...${NC}"
echo ""
echo -e "${YELLOW}提示:${NC}"
echo -e "  - API文档: ${BLUE}http://localhost:8888/docs${NC}"
echo -e "  - 健康检查: ${BLUE}http://localhost:8888/health${NC}"
echo -e "  - 按 ${YELLOW}Ctrl+C${NC} 停止服务器"
echo ""
echo -e "${YELLOW}升级到标准模式（添加Redis）:${NC}"
echo -e "  brew install redis"
echo -e "  brew services start redis"
echo -e "  ./scripts/quickstart-local.sh"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""

cd backend
poetry run python -m uteki.main
