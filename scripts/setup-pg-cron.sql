-- ============================================================================
-- pg_cron Setup for Supabase — Market Data Scheduled Ingestion
-- ============================================================================
--
-- Run this ONCE in Supabase SQL Editor after deploying the backend.
--
-- Prerequisites:
--   1. Enable pg_cron extension in Supabase Dashboard → Database → Extensions
--   2. Enable pg_net extension in Supabase Dashboard → Database → Extensions
--   3. Replace YOUR_BACKEND_URL with your Cloud Run backend URL
--   4. Replace YOUR_SECRET_KEY with your SECRET_KEY from .env
--
-- ============================================================================

-- Step 1: Enable extensions (if not already enabled via Dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Store the backend URL and secret in vault (recommended)
-- Or just hardcode them below — simpler for now.

-- ============================================================================
-- IMPORTANT: Replace these values before running!
-- ============================================================================
-- YOUR_BACKEND_URL = e.g. https://uteki-backend-xxxxx-uc.a.run.app
-- YOUR_SECRET_KEY  = the SECRET_KEY value from your .env or GitHub Secrets

-- ============================================================================
-- Job 1: US stocks/ETF/forex/futures — weekdays UTC 05:00
-- ============================================================================
SELECT cron.schedule(
    'market-data-us',
    '0 5 * * 1-5',
    $$
    SELECT net.http_post(
        url := 'YOUR_BACKEND_URL/api/data/ingestion/trigger',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Cron-Secret', 'YOUR_SECRET_KEY'
        ),
        body := '{"asset_types": ["us_stock", "us_etf", "forex", "futures"]}'::jsonb
    );
    $$
);

-- ============================================================================
-- Job 2: Crypto — every 6 hours (24/7 market)
-- ============================================================================
SELECT cron.schedule(
    'market-data-crypto',
    '15 0,6,12,18 * * *',
    $$
    SELECT net.http_post(
        url := 'YOUR_BACKEND_URL/api/data/ingestion/trigger',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Cron-Secret', 'YOUR_SECRET_KEY'
        ),
        body := '{"asset_types": ["crypto"]}'::jsonb
    );
    $$
);

-- ============================================================================
-- Job 3: HK stocks — weekdays UTC 10:00
-- ============================================================================
SELECT cron.schedule(
    'market-data-hk',
    '0 10 * * 1-5',
    $$
    SELECT net.http_post(
        url := 'YOUR_BACKEND_URL/api/data/ingestion/trigger',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'X-Cron-Secret', 'YOUR_SECRET_KEY'
        ),
        body := '{"asset_types": ["hk_stock"]}'::jsonb
    );
    $$
);

-- ============================================================================
-- Verify: List all scheduled jobs
-- ============================================================================
SELECT * FROM cron.job;

-- ============================================================================
-- Useful management commands (run as needed):
-- ============================================================================
-- View job run history:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
-- Remove a job:
--   SELECT cron.unschedule('market-data-us');
--
-- Update a job schedule:
--   SELECT cron.alter_job(job_id, schedule := '30 5 * * 1-5');
