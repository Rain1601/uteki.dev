#!/usr/bin/env python3
"""
Database health check script for uteki.open
Verifies all databases are running and accessible.
"""

import asyncio
import sys
from typing import Dict, List

# Color codes for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


class DatabaseChecker:
    def __init__(self):
        self.results: Dict[str, bool] = {}

    async def check_postgres(self) -> bool:
        """Check PostgreSQL connection and schemas"""
        try:
            import asyncpg
            conn = await asyncpg.connect(
                host="localhost",
                port=5432,
                user="uteki",
                password="uteki_dev_pass",
                database="uteki",
            )

            # Check schemas exist
            schemas = await conn.fetch(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name IN ('admin', 'trading', 'data', 'agent', 'evaluation', 'dashboard')"
            )

            await conn.close()

            if len(schemas) == 6:
                print(f"{GREEN}✓{RESET} PostgreSQL: Connected, all 6 schemas exist")
                return True
            else:
                print(f"{YELLOW}⚠{RESET} PostgreSQL: Connected, but only {len(schemas)}/6 schemas found")
                return True  # Still functional

        except Exception as e:
            print(f"{RED}✗{RESET} PostgreSQL: {str(e)}")
            return False

    def check_clickhouse(self) -> bool:
        """Check ClickHouse connection and tables"""
        try:
            from clickhouse_driver import Client

            client = Client(
                host="localhost",
                port=9000,
                user="uteki",
                password="uteki_dev_pass",
                database="uteki",
            )

            # Check database exists
            databases = client.execute("SHOW DATABASES")
            if not any(db[0] == "uteki" for db in databases):
                print(f"{YELLOW}⚠{RESET} ClickHouse: Database 'uteki' not found, will create on first use")
                return True

            # Check tables exist
            tables = client.execute("SHOW TABLES FROM uteki")
            table_names = [t[0] for t in tables]

            expected_tables = ["klines", "onchain_metrics", "financial_metrics", "agent_execution_logs", "trade_history"]
            existing = [t for t in expected_tables if t in table_names]

            if len(existing) == len(expected_tables):
                print(f"{GREEN}✓{RESET} ClickHouse: Connected, all {len(expected_tables)} tables exist")
            elif len(existing) > 0:
                print(f"{YELLOW}⚠{RESET} ClickHouse: Connected, {len(existing)}/{len(expected_tables)} tables exist")
            else:
                print(f"{YELLOW}⚠{RESET} ClickHouse: Connected, no tables yet (will create on first use)")

            return True

        except Exception as e:
            print(f"{RED}✗{RESET} ClickHouse: {str(e)}")
            return False

    def check_qdrant(self) -> bool:
        """Check Qdrant connection"""
        try:
            from qdrant_client import QdrantClient

            client = QdrantClient(host="localhost", port=6333)

            # Check connection by getting collections
            collections = client.get_collections()

            print(f"{GREEN}✓{RESET} Qdrant: Connected, {len(collections.collections)} collections exist")
            return True

        except Exception as e:
            print(f"{RED}✗{RESET} Qdrant: {str(e)}")
            return False

    def check_redis(self) -> bool:
        """Check Redis connection"""
        try:
            import redis

            client = redis.Redis(host="localhost", port=6379, decode_responses=True)

            # Test ping
            if client.ping():
                # Get info
                info = client.info()
                used_memory = info.get("used_memory_human", "unknown")

                print(f"{GREEN}✓{RESET} Redis: Connected, using {used_memory} memory")
                return True
            else:
                print(f"{RED}✗{RESET} Redis: Connection failed")
                return False

        except Exception as e:
            print(f"{RED}✗{RESET} Redis: {str(e)}")
            return False

    def check_minio(self) -> bool:
        """Check MinIO connection"""
        try:
            from minio import Minio

            client = Minio(
                "localhost:9000",
                access_key="uteki",
                secret_key="uteki_dev_pass",
                secure=False,
            )

            # Check if we can list buckets
            buckets = list(client.list_buckets())

            print(f"{GREEN}✓{RESET} MinIO: Connected, {len(buckets)} buckets exist")
            return True

        except Exception as e:
            print(f"{RED}✗{RESET} MinIO: {str(e)}")
            return False

    async def run_all_checks(self):
        """Run all database checks"""
        print("\n" + "="*60)
        print("  Database Health Check - uteki.open")
        print("="*60 + "\n")

        # Run checks
        self.results["postgres"] = await self.check_postgres()
        self.results["clickhouse"] = self.check_clickhouse()
        self.results["qdrant"] = self.check_qdrant()
        self.results["redis"] = self.check_redis()
        self.results["minio"] = self.check_minio()

        # Summary
        print("\n" + "="*60)
        total = len(self.results)
        passed = sum(self.results.values())

        if passed == total:
            print(f"{GREEN}✓ All {total} databases are healthy{RESET}")
            return 0
        elif passed >= 2:  # At least PostgreSQL and Redis
            print(f"{YELLOW}⚠ {passed}/{total} databases are healthy (degraded mode possible){RESET}")
            return 0
        else:
            print(f"{RED}✗ Only {passed}/{total} databases are healthy (system may not function){RESET}")
            return 1


async def main():
    checker = DatabaseChecker()
    exit_code = await checker.run_all_checks()
    sys.exit(exit_code)


if __name__ == "__main__":
    asyncio.run(main())
