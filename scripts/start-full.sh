#!/bin/bash
# Full startup for production - all databases

set -e

echo "Starting full uteki.open environment..."
echo "All databases: PostgreSQL + Redis + ClickHouse + Qdrant + MinIO"

docker compose up -d

echo ""
echo "Waiting for all databases to be ready..."
sleep 15

echo ""
echo "Checking database health..."
python scripts/check_databases.py

echo ""
echo "✓ Full environment ready!"
echo ""
echo "Available services:"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo "  - ClickHouse: localhost:8123 (HTTP), localhost:9000 (Native)"
echo "  - Qdrant: localhost:6333 (REST), localhost:6334 (gRPC)"
echo "  - MinIO: localhost:9000 (API), localhost:9001 (Console)"
echo ""
echo "MinIO Console: http://localhost:9001"
echo "  Username: uteki"
echo "  Password: uteki_dev_pass"
