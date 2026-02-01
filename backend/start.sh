#!/bin/bash
set -e

echo "Starting uteki.open backend..."
echo "Environment: $ENVIRONMENT"
echo "Database type: $DATABASE_TYPE"
echo "Port: $PORT"
echo "Python version:"
python --version

echo "Testing import of uteki.main..."
python -c "from uteki.main import app; print('Import successful')" || {
    echo "Failed to import uteki.main"
    exit 1
}

# Initialize database (create tables if they don't exist)
echo "========================================="
echo "Initializing database..."
echo "========================================="
python -m uteki.scripts.init_db init 2>&1 | tee /tmp/db_init.log || {
    echo "⚠️  Database initialization had errors:"
    cat /tmp/db_init.log
    echo "Continuing anyway (tables may already exist)"
}

echo "Starting uvicorn..."
exec uvicorn uteki.main:app --host 0.0.0.0 --port ${PORT:-8080} --log-level info
