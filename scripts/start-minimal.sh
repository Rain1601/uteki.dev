#!/bin/bash
# Minimal startup for development - only critical databases

set -e

echo "Starting minimal uteki.open environment..."
echo "Only PostgreSQL + Redis (Tier 1 Critical)"

docker compose up -d postgres redis

echo ""
echo "Waiting for databases to be ready..."
sleep 5

echo ""
echo "Checking database health..."
python scripts/check_databases.py

echo ""
echo "✓ Minimal environment ready!"
echo ""
echo "Available:"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo ""
echo "To start full environment:"
echo "  docker compose up -d"
