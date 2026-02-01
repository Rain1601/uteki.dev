#!/bin/bash

# uteki.open SQLite模式快速启动脚本
# 零依赖！只需Python

set -e  # 遇到错误立即退出

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            uteki.open SQLite模式启动                          ║${NC}"
echo -e "${BLUE}║              (零依赖！极速启动)                               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}SQLite模式说明:${NC}"
echo -e "  - ${GREEN}✓${NC} 数据库: SQLite文件数据库（自动创建）"
echo -e "  - ${GREEN}✓${NC} 零配置: 不需要任何数据库服务"
echo -e "  - ${GREEN}✓${NC} 快速: 3步启动，30秒完成"
echo ""
echo -e "${BLUE}适合场景:${NC} 本地开发、快速测试、最小依赖"
echo ""

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ============================================================================
# Step 1: 检查Python
# ============================================================================

echo -e "${YELLOW}[1/4]${NC} 检查Python..."

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}✗ Python3未安装${NC}"
    echo "请安装Python 3.10+: https://www.python.org/downloads/"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo -e "${GREEN}  ✓ Python $PYTHON_VERSION${NC}"

# 检查Poetry
if ! command -v poetry &> /dev/null && ! command -v ~/.local/bin/poetry &> /dev/null; then
    echo -e "${YELLOW}  ⚠ Poetry未安装，正在安装...${NC}"
    curl -sSL https://install.python-poetry.org | python3 -
    export PATH="$HOME/.local/bin:$PATH"
fi

if command -v poetry &> /dev/null; then
    echo -e "${GREEN}  ✓ Poetry已安装${NC}"
elif command -v ~/.local/bin/poetry &> /dev/null; then
    export PATH="$HOME/.local/bin:$PATH"
    echo -e "${GREEN}  ✓ Poetry已安装${NC}"
else
    echo -e "${RED}✗ Poetry安装失败${NC}"
    exit 1
fi

echo ""

# ============================================================================
# Step 2: 创建配置文件
# ============================================================================

echo -e "${YELLOW}[2/4]${NC} 配置SQLite模式..."

# 创建.env文件
if [ ! -f "backend/.env" ]; then
    echo -e "${BLUE}  → 创建.env配置文件${NC}"
    cp backend/.env.example backend/.env
    # 设置为SQLite模式
    echo "" >> backend/.env
    echo "# SQLite模式配置" >> backend/.env
    echo "DATABASE_TYPE=sqlite" >> backend/.env
    echo "SQLITE_DB_PATH=./data/uteki.db" >> backend/.env
    echo -e "${GREEN}  ✓ .env已创建（SQLite模式）${NC}"
else
    echo -e "${GREEN}  ✓ .env已存在${NC}"
    # 确保设置为SQLite模式
    if ! grep -q "DATABASE_TYPE=sqlite" backend/.env; then
        echo "" >> backend/.env
        echo "# SQLite模式配置" >> backend/.env
        echo "DATABASE_TYPE=sqlite" >> backend/.env
        echo "SQLITE_DB_PATH=./data/uteki.db" >> backend/.env
        echo -e "${GREEN}  ✓ 已切换到SQLite模式${NC}"
    fi
fi

# 创建数据目录
mkdir -p backend/data
echo -e "${GREEN}  ✓ 数据目录已创建${NC}"

echo ""

# ============================================================================
# Step 3: 安装Python依赖
# ============================================================================

echo -e "${YELLOW}[3/4]${NC} 安装Python依赖..."

cd backend

if [ ! -d ".venv" ]; then
    echo -e "${BLUE}  → 创建虚拟环境（这需要1-2分钟）...${NC}"
    poetry install --no-interaction
    echo -e "${GREEN}  ✓ 依赖安装完成${NC}"
else
    echo -e "${GREEN}  ✓ 虚拟环境已存在${NC}"
    echo -e "${BLUE}  → 更新依赖...${NC}"
    poetry install --no-interaction --quiet
    echo -e "${GREEN}  ✓ 依赖已更新${NC}"
fi

cd ..

echo ""

# ============================================================================
# Step 4: 初始化数据库
# ============================================================================

echo -e "${YELLOW}[4/4]${NC} 初始化SQLite数据库..."

# 检查数据库是否已初始化
if [ -f "backend/data/uteki.db" ]; then
    echo -e "${GREEN}  ✓ SQLite数据库已存在${NC}"
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
echo -e "${BLUE}运行模式: ${YELLOW}SQLite模式${NC}"
echo -e "${BLUE}数据库: ${GREEN}./backend/data/uteki.db${NC}"
echo -e "${BLUE}依赖: ${GREEN}零外部服务${NC}"
echo ""
echo -e "${BLUE}现在启动FastAPI服务器...${NC}"
echo ""
echo -e "${YELLOW}提示:${NC}"
echo -e "  - API文档: ${BLUE}http://localhost:8888/docs${NC}"
echo -e "  - 健康检查: ${BLUE}http://localhost:8888/health${NC}"
echo -e "  - 数据库文件: ${BLUE}backend/data/uteki.db${NC}"
echo -e "  - 按 ${YELLOW}Ctrl+C${NC} 停止服务器"
echo ""
echo -e "${YELLOW}注意:${NC}"
echo -e "  - Redis警告是正常的（SQLite模式不需要Redis）"
echo -e "  - 数据保存在本地文件，可随时备份"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""

cd backend
poetry run python -m uteki.main
