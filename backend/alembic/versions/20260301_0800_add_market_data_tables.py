"""Add market_data schema and tables (symbols, klines_daily, quality_log, ingestion_runs).

Revision ID: a1b2c3d4e5f6
Revises: 20260131_1304_154fa45d98c0
Create Date: 2026-03-01 08:00:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20260301_0800'
down_revision: Union[str, None] = '20260203_0100'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create market_data schema
    op.execute("CREATE SCHEMA IF NOT EXISTS market_data")

    # --- symbols table ---
    op.create_table(
        'symbols',
        sa.Column('id', sa.String(36), primary_key=True,
                  server_default=sa.text("gen_random_uuid()::text")),
        sa.Column('symbol', sa.String(30), nullable=False),
        sa.Column('name', sa.String(200), nullable=True),
        sa.Column('asset_type', sa.String(20), nullable=False),
        sa.Column('exchange', sa.String(30), nullable=True),
        sa.Column('currency', sa.String(10), server_default='USD'),
        sa.Column('timezone', sa.String(40), server_default='America/New_York'),
        sa.Column('data_source', sa.String(20), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('metadata', postgresql.JSONB(), server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('symbol', 'asset_type', name='uq_symbol_asset_type'),
        schema='market_data',
    )
    op.create_index('idx_symbols_asset_type', 'symbols', ['asset_type'], schema='market_data')
    op.create_index('idx_symbols_active', 'symbols', ['is_active'], schema='market_data')

    # --- klines_daily table ---
    op.create_table(
        'klines_daily',
        sa.Column('time', sa.Date(), nullable=False),
        sa.Column('symbol', sa.String(30), nullable=False),
        sa.Column('symbol_id', sa.String(36), nullable=True),
        sa.Column('open', sa.Numeric(18, 8), nullable=True),
        sa.Column('high', sa.Numeric(18, 8), nullable=True),
        sa.Column('low', sa.Numeric(18, 8), nullable=True),
        sa.Column('close', sa.Numeric(18, 8), nullable=True),
        sa.Column('volume', sa.Numeric(24, 4), nullable=True),
        sa.Column('adj_close', sa.Numeric(18, 8), nullable=True),
        sa.Column('turnover', sa.Numeric(24, 4), nullable=True),
        sa.Column('source', sa.String(20), nullable=True),
        sa.Column('quality', sa.SmallInteger(), server_default='0'),
        sa.PrimaryKeyConstraint('time', 'symbol'),
        schema='market_data',
    )
    op.create_index('idx_klines_daily_symbol', 'klines_daily',
                    ['symbol', sa.text('time DESC')], schema='market_data')
    op.create_index('idx_klines_daily_symbol_id', 'klines_daily',
                    ['symbol_id', sa.text('time DESC')], schema='market_data')

    # --- data_quality_log table ---
    op.create_table(
        'data_quality_log',
        sa.Column('id', sa.String(36), primary_key=True,
                  server_default=sa.text("gen_random_uuid()::text")),
        sa.Column('symbol', sa.String(30), nullable=False),
        sa.Column('symbol_id', sa.String(36), nullable=True),
        sa.Column('check_date', sa.Date(), nullable=False),
        sa.Column('issue_type', sa.String(30), nullable=False),
        sa.Column('severity', sa.String(10), server_default='info'),
        sa.Column('details', postgresql.JSONB(), server_default='{}'),
        sa.Column('resolved', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema='market_data',
    )
    op.create_index('idx_quality_log_symbol', 'data_quality_log',
                    ['symbol', 'check_date'], schema='market_data')
    op.create_index('idx_quality_log_unresolved', 'data_quality_log',
                    ['resolved'], schema='market_data')

    # --- ingestion_runs table ---
    op.create_table(
        'ingestion_runs',
        sa.Column('id', sa.String(36), primary_key=True,
                  server_default=sa.text("gen_random_uuid()::text")),
        sa.Column('source', sa.String(20), nullable=False),
        sa.Column('asset_type', sa.String(20), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('records_inserted', sa.Integer(), server_default='0'),
        sa.Column('records_updated', sa.Integer(), server_default='0'),
        sa.Column('records_failed', sa.Integer(), server_default='0'),
        sa.Column('status', sa.String(20), server_default='running'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('metadata', postgresql.JSONB(), server_default='{}'),
        schema='market_data',
    )
    op.create_index('idx_ingestion_runs_status', 'ingestion_runs',
                    ['status', sa.text('started_at DESC')], schema='market_data')


def downgrade() -> None:
    op.drop_table('ingestion_runs', schema='market_data')
    op.drop_table('data_quality_log', schema='market_data')
    op.drop_table('klines_daily', schema='market_data')
    op.drop_table('symbols', schema='market_data')
    op.execute("DROP SCHEMA IF EXISTS market_data")
