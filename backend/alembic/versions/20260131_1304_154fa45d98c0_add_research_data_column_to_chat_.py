"""Add research_data column to chat_messages

Revision ID: 154fa45d98c0
Revises:
Create Date: 2026-01-31 13:04:08.619051+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '154fa45d98c0'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def is_sqlite():
    """Check if we're running on SQLite"""
    bind = op.get_bind()
    return bind.dialect.name == 'sqlite'


def upgrade() -> None:
    # Schema handling - SQLite doesn't support schemas
    schema = None if is_sqlite() else 'agent'

    # Add research_data column to chat_messages table
    # For SQLite, skip if table doesn't exist (database may have been created with models directly)
    try:
        op.add_column(
            'chat_messages',
            sa.Column('research_data', sa.JSON(), nullable=True),
            schema=schema
        )
    except Exception:
        # Table may not exist in SQLite if database was created fresh with models
        pass


def downgrade() -> None:
    schema = None if is_sqlite() else 'agent'

    try:
        op.drop_column('chat_messages', 'research_data', schema=schema)
    except Exception:
        pass
