"""Add share_token and share_expires_at columns to company_analyses.

Revision ID: 20260406_0200
Revises: 20260406_0100
Create Date: 2026-04-06 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260406_0200"
down_revision: Union[str, None] = "20260406_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    if is_sqlite():
        # SQLite: use batch mode (copy-and-move) for constraint support
        with op.batch_alter_table("company_analyses") as batch_op:
            batch_op.add_column(
                sa.Column("share_token", sa.String(64), nullable=True),
            )
            batch_op.add_column(
                sa.Column("share_expires_at", sa.String(30), nullable=True),
            )
            batch_op.create_unique_constraint("uq_share_token", ["share_token"])
    else:
        op.add_column(
            "company_analyses",
            sa.Column("share_token", sa.String(64), nullable=True, unique=True),
            schema="company",
        )
        op.add_column(
            "company_analyses",
            sa.Column("share_expires_at", sa.String(30), nullable=True),
            schema="company",
        )


def downgrade() -> None:
    if is_sqlite():
        with op.batch_alter_table("company_analyses") as batch_op:
            batch_op.drop_column("share_expires_at")
            batch_op.drop_column("share_token")
    else:
        op.drop_column("company_analyses", "share_expires_at", schema="company")
        op.drop_column("company_analyses", "share_token", schema="company")
