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

echo "Starting uvicorn..."
exec uvicorn uteki.main:app --host 0.0.0.0 --port ${PORT:-8080} --log-level info
