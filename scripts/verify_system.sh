#!/bin/bash
# 系统完整性验证脚本
# 验证所有组件是否正常工作

set -e

echo "=========================================="
echo "  uteki.open 系统验证脚本"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 已安装"
        return 0
    else
        echo -e "${RED}✗${NC} $1 未安装"
        return 1
    fi
}

check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1 || nc -z localhost $1 2>/dev/null; then
        echo -e "${GREEN}✓${NC} 端口 $1 正在监听 ($2)"
        return 0
    else
        echo -e "${RED}✗${NC} 端口 $1 未监听 ($2)"
        return 1
    fi
}

check_http() {
    if curl -s -f "$1" > /dev/null; then
        echo -e "${GREEN}✓${NC} HTTP端点可访问: $1"
        return 0
    else
        echo -e "${RED}✗${NC} HTTP端点不可访问: $1"
        return 1
    fi
}

# 步骤1: 检查必需工具
echo "步骤1: 检查必需工具"
echo "----------------------------------------"
check_command "docker" || MISSING_TOOLS=1
check_command "docker-compose" || check_command "docker compose" || MISSING_TOOLS=1
check_command "python3" || MISSING_TOOLS=1
check_command "poetry" || MISSING_TOOLS=1
check_command "node" || MISSING_TOOLS=1
check_command "pnpm" || MISSING_TOOLS=1
echo ""

if [ ! -z "$MISSING_TOOLS" ]; then
    echo -e "${YELLOW}⚠${NC}  部分工具未安装，请参考 docs/DEPLOYMENT_GUIDE.md 安装"
    echo ""
fi

# 步骤2: 检查Docker容器
echo "步骤2: 检查Docker容器"
echo "----------------------------------------"
if docker ps | grep -q "uteki-postgres"; then
    echo -e "${GREEN}✓${NC} PostgreSQL 容器运行中"
else
    echo -e "${RED}✗${NC} PostgreSQL 容器未运行"
    DOCKER_ISSUES=1
fi

if docker ps | grep -q "uteki-redis"; then
    echo -e "${GREEN}✓${NC} Redis 容器运行中"
else
    echo -e "${RED}✗${NC} Redis 容器未运行"
    DOCKER_ISSUES=1
fi

if docker ps | grep -q "uteki-clickhouse"; then
    echo -e "${GREEN}✓${NC} ClickHouse 容器运行中"
else
    echo -e "${YELLOW}⚠${NC}  ClickHouse 容器未运行 (可选)"
fi

if docker ps | grep -q "uteki-qdrant"; then
    echo -e "${GREEN}✓${NC} Qdrant 容器运行中"
else
    echo -e "${YELLOW}⚠${NC}  Qdrant 容器未运行 (可选)"
fi

if docker ps | grep -q "uteki-minio"; then
    echo -e "${GREEN}✓${NC} MinIO 容器运行中"
else
    echo -e "${YELLOW}⚠${NC}  MinIO 容器未运行 (可选)"
fi
echo ""

if [ ! -z "$DOCKER_ISSUES" ]; then
    echo -e "${YELLOW}⚠${NC}  部分容器未运行，执行: ./scripts/start-full.sh"
    echo ""
fi

# 步骤3: 检查端口监听
echo "步骤3: 检查端口监听"
echo "----------------------------------------"
check_port 5432 "PostgreSQL" || PORT_ISSUES=1
check_port 6379 "Redis" || PORT_ISSUES=1
check_port 8123 "ClickHouse HTTP" || echo -e "${YELLOW}⚠${NC}  ClickHouse未运行 (可选)"
check_port 9000 "ClickHouse Native / MinIO" || echo -e "${YELLOW}⚠${NC}  ClickHouse/MinIO未运行 (可选)"
check_port 6333 "Qdrant" || echo -e "${YELLOW}⚠${NC}  Qdrant未运行 (可选)"
echo ""

# 步骤4: 检查后端服务
echo "步骤4: 检查后端服务"
echo "----------------------------------------"
if check_port 8000 "Backend API"; then
    check_http "http://localhost:8888/health" || BACKEND_ISSUES=1
    check_http "http://localhost:8888/api/status" || BACKEND_ISSUES=1
    check_http "http://localhost:8888/docs" || BACKEND_ISSUES=1
else
    echo -e "${RED}✗${NC} 后端未启动"
    BACKEND_ISSUES=1
fi
echo ""

if [ ! -z "$BACKEND_ISSUES" ]; then
    echo -e "${YELLOW}⚠${NC}  后端服务有问题，执行:"
    echo "    cd backend && poetry run python -m uteki.main"
    echo ""
fi

# 步骤5: 检查前端服务
echo "步骤5: 检查前端服务"
echo "----------------------------------------"
if check_port 5173 "Frontend Dev Server"; then
    check_http "http://localhost:5173" || FRONTEND_ISSUES=1
else
    echo -e "${YELLOW}⚠${NC}  前端未启动"
    FRONTEND_ISSUES=1
fi
echo ""

if [ ! -z "$FRONTEND_ISSUES" ]; then
    echo -e "${YELLOW}⚠${NC}  前端服务有问题，执行:"
    echo "    cd frontend && pnpm dev"
    echo ""
fi

# 步骤6: 测试API CRUD操作
echo "步骤6: 测试API CRUD操作"
echo "----------------------------------------"
if [ -z "$BACKEND_ISSUES" ]; then
    # 创建测试API密钥
    RESPONSE=$(curl -s -X POST "http://localhost:8888/api/admin/api-keys" \
        -H "Content-Type: application/json" \
        -d '{
            "provider": "test_verify",
            "display_name": "验证测试密钥",
            "api_key": "test-key-'$(date +%s)'",
            "environment": "sandbox",
            "description": "自动验证脚本创建"
        }' 2>/dev/null)

    if echo "$RESPONSE" | grep -q "id"; then
        echo -e "${GREEN}✓${NC} API创建操作成功"

        # 提取ID并尝试读取
        API_KEY_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
        if [ ! -z "$API_KEY_ID" ]; then
            LIST_RESPONSE=$(curl -s "http://localhost:8888/api/admin/api-keys" 2>/dev/null)
            if echo "$LIST_RESPONSE" | grep -q "$API_KEY_ID"; then
                echo -e "${GREEN}✓${NC} API读取操作成功"

                # 删除测试数据
                DELETE_RESPONSE=$(curl -s -X DELETE "http://localhost:8888/api/admin/api-keys/$API_KEY_ID" 2>/dev/null)
                if echo "$DELETE_RESPONSE" | grep -q "success"; then
                    echo -e "${GREEN}✓${NC} API删除操作成功"
                else
                    echo -e "${YELLOW}⚠${NC}  API删除操作失败（可能需要手动清理）"
                fi
            else
                echo -e "${RED}✗${NC} API读取操作失败"
                CRUD_ISSUES=1
            fi
        fi
    else
        echo -e "${RED}✗${NC} API创建操作失败"
        echo "响应: $RESPONSE"
        CRUD_ISSUES=1
    fi
else
    echo -e "${YELLOW}⚠${NC}  跳过CRUD测试（后端未运行）"
fi
echo ""

# 总结
echo "=========================================="
echo "  验证总结"
echo "=========================================="

if [ -z "$MISSING_TOOLS" ] && [ -z "$DOCKER_ISSUES" ] && [ -z "$PORT_ISSUES" ] && [ -z "$BACKEND_ISSUES" ] && [ -z "$FRONTEND_ISSUES" ] && [ -z "$CRUD_ISSUES" ]; then
    echo -e "${GREEN}✓ 系统完全可用！${NC}"
    echo ""
    echo "访问地址:"
    echo "  • 后端API文档: http://localhost:8888/docs"
    echo "  • 后端健康检查: http://localhost:8888/health"
    echo "  • 前端界面: http://localhost:5173"
    echo "  • MinIO控制台: http://localhost:9001 (用户名: uteki, 密码: uteki_dev_pass)"
    echo ""
    echo "下一步:"
    echo "  1. 配置API密钥 (通过 /api/admin/api-keys 接口)"
    echo "  2. 开始开发domain功能"
    echo "  3. 参考 openspec/changes/uteki-replatform/tasks.md"
    exit 0
else
    echo -e "${YELLOW}⚠ 系统部分功能可用（降级模式）${NC}"
    echo ""
    echo "问题汇总:"
    [ ! -z "$MISSING_TOOLS" ] && echo "  • 部分工具未安装"
    [ ! -z "$DOCKER_ISSUES" ] && echo "  • 部分Docker容器未运行"
    [ ! -z "$PORT_ISSUES" ] && echo "  • 部分端口未监听"
    [ ! -z "$BACKEND_ISSUES" ] && echo "  • 后端服务有问题"
    [ ! -z "$FRONTEND_ISSUES" ] && echo "  • 前端服务有问题"
    [ ! -z "$CRUD_ISSUES" ] && echo "  • CRUD操作失败"
    echo ""
    echo "修复建议:"
    echo "  1. 启动数据库: ./scripts/start-full.sh"
    echo "  2. 初始化数据库: cd backend && poetry run python ../scripts/init_database.py"
    echo "  3. 启动后端: cd backend && poetry run python -m uteki.main"
    echo "  4. 启动前端: cd frontend && pnpm dev"
    echo ""
    echo "详细文档: docs/DEPLOYMENT_GUIDE.md"
    exit 1
fi
