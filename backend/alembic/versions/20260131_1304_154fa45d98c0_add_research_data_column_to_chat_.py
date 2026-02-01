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


def upgrade() -> None:
    # Add research_data column to agent.chat_messages table
    op.add_column(
        'chat_messages',
        sa.Column('research_data', sa.JSON(), nullable=True),
        schema='agent'
    )


def downgrade() -> None:
    # Remove research_data column from agent.chat_messages table
    op.drop_column('chat_messages', 'research_data', schema='agent')
