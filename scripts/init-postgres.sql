-- PostgreSQL initialization script for uteki.open
-- This script runs automatically when the container starts for the first time

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create schemas for each domain
CREATE SCHEMA IF NOT EXISTS admin;
CREATE SCHEMA IF NOT EXISTS trading;
CREATE SCHEMA IF NOT EXISTS data;
CREATE SCHEMA IF NOT EXISTS agent;
CREATE SCHEMA IF NOT EXISTS evaluation;
CREATE SCHEMA IF NOT EXISTS dashboard;
CREATE SCHEMA IF NOT EXISTS market_data;

-- Set search path
ALTER DATABASE uteki SET search_path TO public, admin, trading, data, agent, evaluation, dashboard, market_data;

-- ============================================================================
-- market_data schema: Unified financial K-line database
-- ============================================================================

-- Symbols registry
CREATE TABLE IF NOT EXISTS market_data.symbols (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(30) NOT NULL,
    name VARCHAR(200),
    asset_type VARCHAR(20) NOT NULL,  -- us_stock/us_etf/crypto/forex/hk_stock/a_share/futures
    exchange VARCHAR(30),             -- NASDAQ/BINANCE/HKEX/SSE
    currency VARCHAR(10) DEFAULT 'USD',
    timezone VARCHAR(40) DEFAULT 'America/New_York',
    data_source VARCHAR(20),          -- yfinance/binance/akshare/fmp
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (symbol, asset_type)
);

CREATE INDEX IF NOT EXISTS idx_symbols_asset_type ON market_data.symbols (asset_type);
CREATE INDEX IF NOT EXISTS idx_symbols_active ON market_data.symbols (is_active);

-- Daily K-line data (TimescaleDB hypertable)
CREATE TABLE IF NOT EXISTS market_data.klines_daily (
    time DATE NOT NULL,
    symbol VARCHAR(30) NOT NULL,
    symbol_id UUID REFERENCES market_data.symbols(id),
    open DECIMAL(18,8),
    high DECIMAL(18,8),
    low DECIMAL(18,8),
    close DECIMAL(18,8),
    volume DECIMAL(24,4),
    adj_close DECIMAL(18,8),
    turnover DECIMAL(24,4),
    source VARCHAR(20),
    quality SMALLINT DEFAULT 0,  -- 0=raw, 1=validated, 2=adjusted
    PRIMARY KEY (time, symbol)
);

-- Convert to hypertable with 1-year chunks
SELECT create_hypertable(
    'market_data.klines_daily', 'time',
    chunk_time_interval => INTERVAL '1 year',
    if_not_exists => TRUE
);

-- Enable compression on 90-day-old data
ALTER TABLE market_data.klines_daily SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol'
);
SELECT add_compression_policy('market_data.klines_daily', INTERVAL '90 days', if_not_exists => TRUE);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_klines_daily_symbol ON market_data.klines_daily (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_klines_daily_symbol_id ON market_data.klines_daily (symbol_id, time DESC);

-- Continuous Aggregate: Weekly K-lines (auto-aggregated from daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS market_data.klines_weekly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('7 days', time) AS time,
    symbol_id,
    symbol,
    first(open, time) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close, time) AS close,
    sum(volume) AS volume,
    last(adj_close, time) AS adj_close,
    sum(turnover) AS turnover
FROM market_data.klines_daily
GROUP BY time_bucket('7 days', time), symbol_id, symbol
WITH NO DATA;

-- Continuous Aggregate: Monthly K-lines
CREATE MATERIALIZED VIEW IF NOT EXISTS market_data.klines_monthly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 month', time) AS time,
    symbol_id,
    symbol,
    first(open, time) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close, time) AS close,
    sum(volume) AS volume,
    last(adj_close, time) AS adj_close,
    sum(turnover) AS turnover
FROM market_data.klines_daily
GROUP BY time_bucket('1 month', time), symbol_id, symbol
WITH NO DATA;

-- Refresh policies for continuous aggregates
SELECT add_continuous_aggregate_policy('market_data.klines_weekly',
    start_offset => INTERVAL '30 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('market_data.klines_monthly',
    start_offset => INTERVAL '90 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Data quality log
CREATE TABLE IF NOT EXISTS market_data.data_quality_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(30) NOT NULL,
    symbol_id UUID REFERENCES market_data.symbols(id),
    check_date DATE NOT NULL,
    issue_type VARCHAR(30) NOT NULL,  -- gap/anomaly/split_detected/stale
    severity VARCHAR(10) DEFAULT 'info',  -- info/warning/error
    details JSONB DEFAULT '{}',
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_log_symbol ON market_data.data_quality_log (symbol, check_date DESC);
CREATE INDEX IF NOT EXISTS idx_quality_log_unresolved ON market_data.data_quality_log (resolved) WHERE resolved = FALSE;

-- Ingestion run log
CREATE TABLE IF NOT EXISTS market_data.ingestion_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    records_inserted INT DEFAULT 0,
    records_updated INT DEFAULT 0,
    records_failed INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'running',  -- running/success/partial_failure/failed
    error_message TEXT,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status ON market_data.ingestion_runs (status, started_at DESC);

-- ============================================================================

-- Create a read-only user for analytics (optional)
-- CREATE USER uteki_readonly WITH PASSWORD 'readonly_pass';
-- GRANT CONNECT ON DATABASE uteki TO uteki_readonly;
-- GRANT USAGE ON SCHEMA public, admin, trading, data, agent, evaluation, dashboard, market_data TO uteki_readonly;

-- Log successful initialization
SELECT 'PostgreSQL + TimescaleDB initialized successfully for uteki.open' AS status;
