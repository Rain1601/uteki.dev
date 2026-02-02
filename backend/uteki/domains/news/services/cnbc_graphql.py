"""CNBC GraphQL API 采集器 - 获取 Jeff Cox 文章列表"""

import json
import hashlib
import logging
from typing import List, Dict, Optional
from datetime import datetime
import httpx

logger = logging.getLogger(__name__)


class CNBCGraphQLCollector:
    """CNBC GraphQL API 采集器"""

    def __init__(self):
        self.api_url = "https://webql-redesign.cnbcfm.com/graphql"
        self.jeff_cox_id = "36003787"  # Jeff Cox 的作者 ID
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json"
        }
        # 持久化查询的 hash
        self.query_hash = "43ed5bcff58371b2637d1f860e593e2b56295195169a5e46209ba0abb85288b7"

    async def fetch_articles(
        self,
        offset: int = 0,
        page_size: int = 30,
        max_articles: Optional[int] = None
    ) -> List[Dict]:
        """
        从 GraphQL API 获取文章列表

        Args:
            offset: 偏移量
            page_size: 每页文章数（CNBC API 最大 30）
            max_articles: 最多获取文章数

        Returns:
            文章列表
        """
        try:
            params = {
                "operationName": "getAssetList",
                "variables": json.dumps({
                    "id": self.jeff_cox_id,
                    "offset": offset,
                    "pageSize": min(page_size, 30),
                    "nonFilter": True,
                    "includeNative": False,
                    "include": []
                }),
                "extensions": json.dumps({
                    "persistedQuery": {
                        "version": 1,
                        "sha256Hash": self.query_hash
                    }
                })
            }

            logger.info(f"请求 GraphQL API: offset={offset}, pageSize={page_size}")
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(self.api_url, params=params, headers=self.headers)

            if response.status_code != 200:
                logger.error(f"GraphQL 请求失败: {response.status_code}")
                return []

            data = response.json()

            if 'data' not in data or 'assetList' not in data['data']:
                logger.warning("GraphQL 响应格式错误")
                return []

            assets = data['data']['assetList'].get('assets', [])
            logger.info(f"获取到 {len(assets)} 篇文章")

            articles = []
            for asset in assets:
                article = self._convert_asset_to_article(asset)
                if article:
                    articles.append(article)
                    if max_articles and len(articles) >= max_articles:
                        break

            return articles

        except Exception as e:
            logger.error(f"GraphQL 请求异常: {e}", exc_info=True)
            return []

    async def fetch_all_articles(
        self,
        max_articles: Optional[int] = None,
        page_size: int = 30
    ) -> List[Dict]:
        """
        分页获取所有文章

        Args:
            max_articles: 最多获取文章数
            page_size: 每页大小

        Returns:
            所有文章列表
        """
        all_articles = []
        offset = 0
        actual_page_size = min(page_size, 30)

        logger.info(f"开始分页获取 Jeff Cox 文章 (max={max_articles or '无限制'})")

        while True:
            remaining = max_articles - len(all_articles) if max_articles else None
            articles = await self.fetch_articles(
                offset=offset,
                page_size=actual_page_size,
                max_articles=remaining
            )

            if not articles:
                break

            all_articles.extend(articles)
            logger.info(f"已获取 {len(all_articles)} 篇文章")

            if max_articles and len(all_articles) >= max_articles:
                break

            if len(articles) < actual_page_size:
                break

            offset += actual_page_size

        logger.info(f"分页获取完成: 共 {len(all_articles)} 篇文章")
        return all_articles

    def _convert_asset_to_article(self, asset: Dict) -> Optional[Dict]:
        """将 GraphQL asset 转换为标准文章格式"""
        try:
            url = asset.get('url', '')
            if not url:
                return None

            article_id = hashlib.md5(url.encode()).hexdigest()[:20]

            date_published_str = asset.get('datePublished', '')
            published_at = None
            if date_published_str:
                try:
                    published_at = datetime.strptime(
                        date_published_str,
                        '%Y-%m-%dT%H:%M:%S%z'
                    )
                    published_at = published_at.replace(tzinfo=None)
                except Exception as e:
                    logger.warning(f"时间解析失败 {date_published_str}: {e}")

            authors = asset.get('author', [])
            author_name = authors[0]['name'] if authors else 'Jeff Cox'

            section = asset.get('section', {})
            category = section.get('title', 'Economy')

            return {
                'id': article_id,
                'source': 'cnbc_jeff_cox',
                'title': asset.get('title', ''),
                'headline': asset.get('headline', ''),
                'description': asset.get('description', ''),
                'url': url,
                'author': author_name,
                'published_at': published_at,
                'category': category,
                'asset_id': asset.get('id'),
                'type': asset.get('type', 'cnbcnewsstory')
            }

        except Exception as e:
            logger.error(f"转换文章格式失败: {e}", exc_info=True)
            return None


# 全局单例
_graphql_collector: Optional[CNBCGraphQLCollector] = None


def get_graphql_collector() -> CNBCGraphQLCollector:
    """获取全局 GraphQL 采集器实例"""
    global _graphql_collector
    if _graphql_collector is None:
        _graphql_collector = CNBCGraphQLCollector()
    return _graphql_collector
