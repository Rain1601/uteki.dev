"""
Database initialization script.

Creates all tables and applies schema for user isolation.
"""

import asyncio
import logging
from sqlalchemy import text
from uteki.common.database import db_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def init_database():
    """Initialize database with all tables."""
    logger.info("Initializing database...")

    # Initialize database connections
    await db_manager.initialize()

    # Import all models to register them with SQLAlchemy
    from uteki.domains.admin.models import (
        APIKey,
        LLMProvider,
        ExchangeConfig
    )
    from uteki.domains.agent.models import (
        ChatConversation,
        ChatMessage
    )
    from uteki.domains.user.models import User

    # Get engine
    from uteki.common.config import settings
    from uteki.infrastructure.database.base import Base

    async with db_manager.postgres_engine.begin() as conn:
        # For SQLite, we need to enable foreign keys
        if settings.database_type == "sqlite":
            await conn.execute(text("PRAGMA foreign_keys = ON"))

        # Create all tables
        logger.info("Creating all tables...")
        await conn.run_sync(Base.metadata.create_all)

    logger.info("✓ Database initialization complete!")

    # Log available tables
    from sqlalchemy import inspect
    async with db_manager.postgres_engine.connect() as conn:
        def get_tables(connection):
            inspector = inspect(connection)
            return inspector.get_table_names()

        tables = await conn.run_sync(get_tables)
        logger.info(f"Available tables: {', '.join(tables)}")


async def upgrade_to_multiuser():
    """
    Upgrade existing database to support multi-user isolation.

    Adds user_id columns to all configuration tables.
    """
    logger.info("Upgrading database for multi-user support...")

    from uteki.common.config import settings

    async with db_manager.postgres_engine.begin() as conn:
        is_sqlite = settings.database_type == "sqlite"

        try:
            # Check if users table exists
            if is_sqlite:
                result = await conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
                )
            else:
                result = await conn.execute(
                    text("SELECT tablename FROM pg_tables WHERE schemaname='auth' AND tablename='users'")
                )

            users_table_exists = result.scalar() is not None

            if not users_table_exists:
                logger.info("Creating auth.users table...")
                # Import to ensure model is registered
                from uteki.domains.user.models import User
                from uteki.infrastructure.database.base import Base

                await conn.run_sync(Base.metadata.create_all)
                logger.info("✓ Created auth.users table")

            # Add user_id columns to existing tables if they don't exist
            tables_to_update = [
                ("admin", "api_keys"),
                ("admin", "llm_providers"),
                ("admin", "exchange_configs"),
                ("agent", "chat_conversations"),
            ]

            for schema, table in tables_to_update:
                table_name = f"{schema}.{table}" if not is_sqlite else table

                try:
                    # Check if user_id column exists
                    if is_sqlite:
                        result = await conn.execute(
                            text(f"PRAGMA table_info({table})")
                        )
                        columns = [row[1] for row in result.fetchall()]
                    else:
                        result = await conn.execute(
                            text(
                                f"SELECT column_name FROM information_schema.columns "
                                f"WHERE table_schema='{schema}' AND table_name='{table}' "
                                f"AND column_name='user_id'"
                            )
                        )
                        columns = [row[0] for row in result.fetchall()]

                    if "user_id" not in columns:
                        logger.info(f"Adding user_id column to {table_name}...")

                        # Add user_id column with default value
                        await conn.execute(
                            text(
                                f"ALTER TABLE {table_name} "
                                f"ADD COLUMN user_id VARCHAR(36) DEFAULT 'default'"
                            )
                        )

                        # For chat_conversations, make it NOT NULL after adding
                        if table == "chat_conversations":
                            # Update existing NULL values
                            await conn.execute(
                                text(
                                    f"UPDATE {table_name} SET user_id = 'default' "
                                    f"WHERE user_id IS NULL"
                                )
                            )

                        logger.info(f"✓ Added user_id to {table_name}")
                    else:
                        logger.info(f"✓ {table_name} already has user_id column")

                except Exception as e:
                    logger.error(f"✗ Failed to update {table_name}: {e}")
                    raise

            logger.info("✓ Multi-user upgrade complete!")

        except Exception as e:
            logger.error(f"✗ Upgrade failed: {e}")
            raise


async def main():
    """Main entry point."""
    import sys

    command = sys.argv[1] if len(sys.argv) > 1 else "init"

    if command == "init":
        await init_database()
    elif command == "upgrade":
        await db_manager.initialize()
        await upgrade_to_multiuser()
    else:
        print("Usage: python -m uteki.scripts.init_db [init|upgrade]")
        print("  init    - Initialize database with all tables")
        print("  upgrade - Upgrade existing database for multi-user support")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
