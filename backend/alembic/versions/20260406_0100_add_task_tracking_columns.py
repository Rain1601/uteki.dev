"""Add task tracking columns (current_gate, gate_results) to company_analyses.

Revision ID: 20260406_0100
Revises: 20260311_0100
Create Date: 2026-04-06 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260406_0100"
down_revision: Union[str, None] = "20260311_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    schema = None if is_sqlite() else "company"
    json_type = sa.JSON() if is_sqlite() else postgresql.JSONB()

    op.add_column(
        "company_analyses",
        sa.Column("current_gate", sa.Integer, nullable=False, server_default="0"),
        schema=schema,
    )
    op.add_column(
        "company_analyses",
        sa.Column("gate_results", json_type, nullable=True),
        schema=schema,
    )


def downgrade() -> None:
    schema = None if is_sqlite() else "company"

    op.drop_column("company_analyses", "gate_results", schema=schema)
    op.drop_column("company_analyses", "current_gate", schema=schema)
