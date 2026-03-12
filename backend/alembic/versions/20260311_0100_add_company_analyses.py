"""Add company_analyses table.

Revision ID: 20260311_0100
Revises: 20260308_0100
Create Date: 2026-03-11 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260311_0100"
down_revision: Union[str, None] = "20260308_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    schema = None if is_sqlite() else "company"

    if not is_sqlite():
        op.execute("CREATE SCHEMA IF NOT EXISTS company")

    json_type = sa.JSON() if is_sqlite() else postgresql.JSONB()

    op.create_table(
        "company_analyses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("symbol", sa.String(20), nullable=False),
        sa.Column("company_name", sa.String(200), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column("full_report", json_type, nullable=False),
        sa.Column("verdict_action", sa.String(10), nullable=False, server_default="WATCH"),
        sa.Column("verdict_conviction", sa.Float, nullable=False, server_default="0.5"),
        sa.Column("verdict_quality", sa.String(20), nullable=False, server_default="GOOD"),
        sa.Column("total_latency_ms", sa.Integer, nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        schema=schema,
    )

    # Indexes
    if is_sqlite():
        op.create_index("idx_ca_user", "company_analyses", ["user_id"])
        op.create_index("idx_ca_symbol", "company_analyses", ["symbol"])
    else:
        op.create_index("idx_ca_user", "company_analyses", ["user_id"], schema=schema)
        op.create_index("idx_ca_symbol", "company_analyses", ["symbol"], schema=schema)


def downgrade() -> None:
    schema = None if is_sqlite() else "company"
    op.drop_table("company_analyses", schema=schema)
