"""Add news and macro tables

Revision ID: 20260203_0100
Revises: 154fa45d98c0
Create Date: 2026-02-03 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260203_0100'
down_revision: Union[str, None] = '154fa45d98c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def is_sqlite():
    """Check if we're running on SQLite"""
    bind = op.get_bind()
    return bind.dialect.name == 'sqlite'


def upgrade() -> None:
    # Schema handling - SQLite doesn't support schemas
    schema_news = None if is_sqlite() else 'news'
    schema_macro = None if is_sqlite() else 'macro'

    if not is_sqlite():
        op.execute("CREATE SCHEMA IF NOT EXISTS news")

    # Create news_articles table
    op.create_table(
        'news_articles',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('source', sa.String(50), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('url', sa.String(500), nullable=False, unique=True),
        sa.Column('author', sa.String(200), nullable=True),
        sa.Column('published_at', sa.DateTime(), nullable=False),

        # Extended fields
        sa.Column('symbols', sa.Text(), nullable=True),
        sa.Column('sentiment_score', sa.Float(), nullable=True),
        sa.Column('sentiment_type', sa.String(20), nullable=True),
        sa.Column('category', sa.String(50), nullable=True),
        sa.Column('keywords', sa.Text(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),

        # Full content fields
        sa.Column('content_full', sa.Text(), nullable=True),
        sa.Column('summary_keypoints', sa.Text(), nullable=True),
        sa.Column('is_full_content', sa.Boolean(), default=False),
        sa.Column('scraped_at', sa.DateTime(), nullable=True),

        # LLM summary
        sa.Column('summary', sa.Text(), nullable=True),

        # Translation fields
        sa.Column('title_zh', sa.Text(), nullable=True),
        sa.Column('content_zh', sa.Text(), nullable=True),
        sa.Column('content_full_zh', sa.Text(), nullable=True),
        sa.Column('summary_keypoints_zh', sa.Text(), nullable=True),
        sa.Column('translation_status', sa.String(20), default='pending'),
        sa.Column('translated_at', sa.DateTime(), nullable=True),
        sa.Column('translation_model', sa.String(50), nullable=True),

        # AI analysis fields
        sa.Column('ai_analysis', sa.Text(), nullable=True),
        sa.Column('ai_impact', sa.String(20), nullable=True),
        sa.Column('ai_analysis_status', sa.String(20), default='pending'),
        sa.Column('ai_analyzed_at', sa.DateTime(), nullable=True),
        sa.Column('ai_analysis_model', sa.String(50), nullable=True),

        # Feedback fields
        sa.Column('ai_feedback_like_count', sa.Integer(), default=0),
        sa.Column('ai_feedback_dislike_count', sa.Integer(), default=0),
        sa.Column('ai_feedback_updated_at', sa.DateTime(), nullable=True),

        # Important flag
        sa.Column('important', sa.Boolean(), default=False),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),

        schema=schema_news
    )

    # Create indexes for news_articles
    op.create_index('idx_news_source_published', 'news_articles', ['source', 'published_at'], schema=schema_news)
    op.create_index('idx_news_published', 'news_articles', ['published_at'], schema=schema_news)
    op.create_index('idx_news_source', 'news_articles', ['source'], schema=schema_news)

    if not is_sqlite():
        op.execute("CREATE SCHEMA IF NOT EXISTS macro")

    # Create economic_events table
    op.create_table(
        'economic_events',
        sa.Column('id', sa.String(100), primary_key=True),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),

        # Time fields
        sa.Column('start_date', sa.DateTime(), nullable=False),
        sa.Column('end_date', sa.DateTime(), nullable=True),
        sa.Column('publish_time', sa.DateTime(), nullable=True),

        # Status fields
        sa.Column('status', sa.String(20), default='upcoming'),
        sa.Column('importance', sa.String(20), default='medium'),

        # Extra data (JSON storage for additional fields)
        sa.Column('extra_data', sa.JSON(), nullable=True),

        # FOMC specific fields
        sa.Column('has_press_conference', sa.Boolean(), nullable=True),
        sa.Column('has_economic_projections', sa.Boolean(), nullable=True),
        sa.Column('quarter', sa.String(10), nullable=True),

        # Earnings specific fields
        sa.Column('company_symbol', sa.String(20), nullable=True),
        sa.Column('company_name', sa.String(200), nullable=True),
        sa.Column('fiscal_quarter', sa.String(20), nullable=True),
        sa.Column('expected_eps', sa.Float(), nullable=True),
        sa.Column('actual_eps', sa.Float(), nullable=True),
        sa.Column('expected_revenue', sa.Float(), nullable=True),
        sa.Column('actual_revenue', sa.Float(), nullable=True),

        # Economic data specific fields
        sa.Column('indicator_name', sa.String(100), nullable=True),
        sa.Column('expected_value', sa.Float(), nullable=True),
        sa.Column('actual_value', sa.Float(), nullable=True),
        sa.Column('previous_value', sa.Float(), nullable=True),
        sa.Column('unit', sa.String(50), nullable=True),

        # Source
        sa.Column('source', sa.String(100), nullable=True),
        sa.Column('source_url', sa.String(500), nullable=True),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),

        schema=schema_macro
    )

    # Create indexes for economic_events
    op.create_index('idx_event_type_date', 'economic_events', ['event_type', 'start_date'], schema=schema_macro)
    op.create_index('idx_event_status_date', 'economic_events', ['status', 'start_date'], schema=schema_macro)
    op.create_index('idx_event_company_date', 'economic_events', ['company_symbol', 'start_date'], schema=schema_macro)
    op.create_index('idx_event_importance_date', 'economic_events', ['importance', 'start_date'], schema=schema_macro)


def downgrade() -> None:
    schema_news = None if is_sqlite() else 'news'
    schema_macro = None if is_sqlite() else 'macro'

    # Drop economic_events table and indexes
    op.drop_index('idx_event_importance_date', table_name='economic_events', schema=schema_macro)
    op.drop_index('idx_event_company_date', table_name='economic_events', schema=schema_macro)
    op.drop_index('idx_event_status_date', table_name='economic_events', schema=schema_macro)
    op.drop_index('idx_event_type_date', table_name='economic_events', schema=schema_macro)
    op.drop_table('economic_events', schema=schema_macro)
    if not is_sqlite():
        op.execute("DROP SCHEMA IF EXISTS macro")

    # Drop news_articles table and indexes
    op.drop_index('idx_news_source', table_name='news_articles', schema=schema_news)
    op.drop_index('idx_news_published', table_name='news_articles', schema=schema_news)
    op.drop_index('idx_news_source_published', table_name='news_articles', schema=schema_news)
    op.drop_table('news_articles', schema=schema_news)
    if not is_sqlite():
        op.execute("DROP SCHEMA IF EXISTS news")
