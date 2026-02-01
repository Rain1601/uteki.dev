#!/bin/bash

# uteki.open 快速启动脚本
# 一键启动项目（最小化模式）

set -e  # 遇到错误立即退出

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                   uteki.open 快速启动                         ║${NC}"
echo -e "${BLUE}║                    (Docker 模式)                              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ============================================================================
# Step 1: 检查前提条件
# ============================================================================

echo -e "${YELLOW}[1/6]${NC} 检查前提条件..."

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker未安装${NC}"
    echo ""
    echo -e "${YELLOW}您有两个选择:${NC}"
    echo ""
    echo -e "${BLUE}1. 安装Docker (推荐)${NC}"
    echo "   brew install --cask docker"
    echo "   然后重新运行此脚本"
    echo ""
    echo -e "${BLUE}2. 使用本地模式 (不需要Docker)${NC}"
    echo "   ./scripts/quickstart-local.sh"
    echo "   需要: brew install postgresql@15 redis"
    echo ""
    echo -e "详细说明: 查看 ${BLUE}DEPLOYMENT_MODES.md${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ Docker已安装${NC}"

# 检查Docker Compose
if ! docker compose version &> /dev/null; then
    echo -e "${RED}✗ Docker Compose未安装${NC}"
    exit 1
fi
echo -e "${GREEN}  ✓ Docker Compose已安装${NC}"

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

echo ""

# ============================================================================
# Step 2: 创建配置文件
# ============================================================================

echo -e "${YELLOW}[2/6]${NC} 创建配置文件..."

if [ ! -f "backend/.env" ]; then
    echo -e "${BLUE}  → 从.env.example创建.env${NC}"
    cp backend/.env.example backend/.env
    echo -e "${GREEN}  ✓ .env已创建${NC}"
else
    echo -e "${GREEN}  ✓ .env已存在${NC}"
fi

echo ""

# ============================================================================
# Step 3: 启动数据库（最小化模式）
# ============================================================================

echo -e "${YELLOW}[3/6]${NC} 启动数据库服务（最小化模式）..."

# 检查容器是否已运行
if docker compose ps | grep -q "postgres.*Up" && docker compose ps | grep -q "redis.*Up"; then
    echo -e "${GREEN}  ✓ 数据库已运行${NC}"
else
    echo -e "${BLUE}  → 启动PostgreSQL和Redis...${NC}"
    docker compose up -d postgres redis

    # 等待数据库启动
    echo -e "${BLUE}  → 等待数据库就绪...${NC}"
    sleep 5

    # 检查PostgreSQL
    MAX_RETRIES=30
    RETRY=0
    while ! docker compose exec -T postgres pg_isready -U uteki &> /dev/null; do
        RETRY=$((RETRY+1))
        if [ $RETRY -gt $MAX_RETRIES ]; then
            echo -e "${RED}✗ PostgreSQL启动超时${NC}"
            exit 1
        fi
        echo -e "${BLUE}  → 等待PostgreSQL... ($RETRY/$MAX_RETRIES)${NC}"
        sleep 1
    done

    echo -e "${GREEN}  ✓ PostgreSQL已就绪${NC}"
    echo -e "${GREEN}  ✓ Redis已就绪${NC}"
fi

echo ""

# ============================================================================
# Step 4: 安装Python依赖
# ============================================================================

echo -e "${YELLOW}[4/6]${NC} 安装Python依赖..."

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

echo -e "${YELLOW}[5/6]${NC} 初始化数据库..."

# 检查是否已初始化
if docker compose exec -T postgres psql -U uteki -d uteki -c "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'admin'" 2>/dev/null | grep -q "1 row"; then
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
# Step 6: 启动后端服务
# ============================================================================

echo -e "${YELLOW}[6/6]${NC} 启动后端服务..."

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    ✓ 启动准备完成！                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}现在启动FastAPI服务器...${NC}"
echo ""
echo -e "${YELLOW}提示:${NC}"
echo -e "  - API文档: ${BLUE}http://localhost:8888/docs${NC}"
echo -e "  - 健康检查: ${BLUE}http://localhost:8888/health${NC}"
echo -e "  - 按 ${YELLOW}Ctrl+C${NC} 停止服务器"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""

cd backend
poetry run python -m uteki.main
