"""持久化 Bloomberg 新闻到数据库 - news + bond 两个部分"""

import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

sys.path.insert(0, str(Path(__file__).parent.parent))

from uteki.common.database import db_manager
from uteki.domains.news.services.bloomberg_apify import BloombergApifyClient
from uteki.domains.news.services.bloomberg_service import BloombergService


async def main():
    print("初始化数据库连接...")
    await db_manager.initialize()

    service = BloombergService()

    # News 搜索关键词
    news_queries = [
        "bloomberg markets news today",
        "bloomberg economy news",
    ]

    # Bond 搜索关键词
    bond_queries = [
        "bloomberg corporate bond fixed income",
        "bloomberg credit market bonds yield",
    ]

    # 抓取 News 部分
    print("\n=== 抓取 Bloomberg News ===")
    # 直接用 apify_client 搜索，再手动调用 collect
    service.apify_client = BloombergApifyClient()

    # 覆盖默认搜索词，先抓 news
    original_queries = service.apify_client.__class__.__dict__.get('DEFAULT_SEARCH_QUERIES')

    # 用 news queries 搜索
    import uteki.domains.news.services.bloomberg_apify as apify_mod
    old_queries = apify_mod.DEFAULT_SEARCH_QUERIES

    apify_mod.DEFAULT_SEARCH_QUERIES = news_queries
    result_news = await service.collect_and_enrich(max_news=10)
    print(f"News 结果: {result_news}")

    # 用 bond queries 搜索
    print("\n=== 抓取 Bloomberg Bond ===")
    apify_mod.DEFAULT_SEARCH_QUERIES = bond_queries
    result_bond = await service.collect_and_enrich(max_news=10)
    print(f"Bond 结果: {result_bond}")

    # 恢复
    apify_mod.DEFAULT_SEARCH_QUERIES = old_queries

    print("\n持久化完成!")
    print(f"  News: 发现 {result_news.get('new_urls_found', 0)} 篇, 保存 {result_news.get('new_articles_saved', 0)} 篇")
    print(f"  Bond: 发现 {result_bond.get('new_urls_found', 0)} 篇, 保存 {result_bond.get('new_articles_saved', 0)} 篇")


if __name__ == "__main__":
    asyncio.run(main())
