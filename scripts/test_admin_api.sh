#!/bin/bash

# Admin Domain API测试脚本
# 测试所有新增的API endpoints

API_BASE="http://localhost:8888/api/admin"

echo "=========================================="
echo "  Admin Domain API测试"
echo "=========================================="
echo ""

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4

    echo -e "${YELLOW}测试:${NC} $description"
    echo "  $method $endpoint"

    if [ "$method" == "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$API_BASE$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_BASE$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi

    # 提取HTTP状态码（最后一行）
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "  ${GREEN}✓ 成功${NC} (HTTP $http_code)"
    else
        echo -e "  ${RED}✗ 失败${NC} (HTTP $http_code)"
        echo "  Response: $body"
    fi
    echo ""
}

echo "=========================================="
echo "1. API密钥管理测试"
echo "=========================================="
echo ""

# 创建API密钥
test_endpoint "POST" "/api-keys" \
    '{"provider":"openai","display_name":"OpenAI GPT-4","api_key":"sk-test-123","environment":"production"}' \
    "创建API密钥"

# 列出API密钥
test_endpoint "GET" "/api-keys" "" "列出所有API密钥"

echo "=========================================="
echo "2. LLM提供商管理测试"
echo "=========================================="
echo ""

# 创建LLM提供商（需要先有API密钥，这里使用模拟ID）
test_endpoint "POST" "/llm-providers" \
    '{"provider":"openai","model":"gpt-4","api_key_id":"00000000-0000-0000-0000-000000000000","display_name":"OpenAI GPT-4","is_default":true}' \
    "创建LLM提供商"

# 列出LLM提供商
test_endpoint "GET" "/llm-providers" "" "列出所有LLM提供商"

# 列出激活的LLM提供商
test_endpoint "GET" "/llm-providers/active" "" "列出激活的LLM提供商"

# 获取默认LLM提供商
test_endpoint "GET" "/llm-providers/default" "" "获取默认LLM提供商"

echo "=========================================="
echo "3. 交易所配置管理测试"
echo "=========================================="
echo ""

# 创建交易所配置
test_endpoint "POST" "/exchanges" \
    '{"exchange":"okx","api_key_id":"00000000-0000-0000-0000-000000000000","display_name":"OKX主账户","trading_enabled":true,"spot_enabled":true,"max_position_size":10000}' \
    "创建交易所配置"

# 列出交易所配置
test_endpoint "GET" "/exchanges" "" "列出所有交易所配置"

# 列出激活的交易所
test_endpoint "GET" "/exchanges/active" "" "列出激活的交易所"

echo "=========================================="
echo "4. 数据源配置管理测试"
echo "=========================================="
echo ""

# 创建数据源配置
test_endpoint "POST" "/data-sources" \
    '{"source_type":"fmp","display_name":"Financial Modeling Prep","data_types":["stock","fundamental"],"refresh_interval":300,"priority":0}' \
    "创建数据源配置"

# 列出数据源配置
test_endpoint "GET" "/data-sources" "" "列出所有数据源配置"

# 列出激活的数据源
test_endpoint "GET" "/data-sources/active" "" "列出激活的数据源"

# 根据数据类型列出数据源
test_endpoint "GET" "/data-sources/by-type/stock" "" "列出stock类型数据源"

echo "=========================================="
echo "5. 系统健康检查测试"
echo "=========================================="
echo ""

# 系统健康检查
test_endpoint "GET" "/system/health" "" "系统健康检查"

echo "=========================================="
echo "6. 用户管理测试"
echo "=========================================="
echo ""

# 创建用户
test_endpoint "POST" "/users" \
    '{"email":"test@example.com","username":"testuser","oauth_provider":"email"}' \
    "创建用户"

# 列出用户
test_endpoint "GET" "/users" "" "列出所有用户"

echo "=========================================="
echo "7. 系统配置测试"
echo "=========================================="
echo ""

# 设置系统配置
test_endpoint "POST" "/config" \
    '{"config_key":"risk_management","config_value":{"max_position_size":10000,"max_daily_loss":500},"config_type":"system"}' \
    "设置系统配置"

# 列出配置
test_endpoint "GET" "/config" "" "列出所有配置"

echo "=========================================="
echo "8. 审计日志测试"
echo "=========================================="
echo ""

# 列出审计日志
test_endpoint "GET" "/audit-logs" "" "列出所有审计日志"

echo "=========================================="
echo "  测试完成"
echo "=========================================="
echo ""
echo "提示："
echo "  - 某些测试可能因为外键约束失败（需要真实的API密钥ID）"
echo "  - 可以通过 /docs 查看完整API文档"
echo "  - 使用 http://localhost:8888/api/admin/system/health 查看系统状态"
echo ""
