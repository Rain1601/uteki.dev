#!/bin/bash

# uteki.open 本地开发快速启动脚本

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║        uteki.open - 本地开发环境启动                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 检查是否在项目根目录
if [ ! -f "LOCAL_DEVELOPMENT.md" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

echo "📦 检查依赖..."

# 检查 Python
if ! command -v python &> /dev/null && ! command -v python3 &> /dev/null; then
    echo "❌ Python 未安装"
    exit 1
fi
echo "✅ Python 已安装"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi
echo "✅ Node.js 已安装"

echo ""
echo "🚀 启动选项:"
echo "  1. 仅启动后端 (API 服务器)"
echo "  2. 仅启动前端 (React 应用)"
echo "  3. 同时启动前端和后端"
echo ""
read -p "请选择 (1/2/3): " choice

case $choice in
    1)
        echo ""
        echo "🔧 启动后端服务..."
        cd backend
        python -m uteki.main_dev
        ;;
    2)
        echo ""
        echo "🎨 启动前端应用..."
        cd frontend
        npm run dev
        ;;
    3)
        echo ""
        echo "🔧 在后台启动后端服务..."
        cd backend
        python -m uteki.main_dev > ../backend.log 2>&1 &
        BACKEND_PID=$!
        echo "✅ 后端已启动 (PID: $BACKEND_PID)"
        echo "   日志: backend.log"

        sleep 3

        echo ""
        echo "🎨 启动前端应用..."
        cd ../frontend
        npm run dev

        # 前端退出时，清理后端进程
        echo ""
        echo "🛑 停止后端服务..."
        kill $BACKEND_PID 2>/dev/null
        echo "✅ 清理完成"
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac
