"""CNBC 网页爬虫 - 用于抓取 Jeff Cox 文章的完整内容"""

import re
import hashlib
import logging
from datetime import datetime
from typing import Dict, Optional, List
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class CNBCWebScraper:
    """CNBC 网页内容爬虫"""

    def __init__(self):
        self.base_url = "https://www.cnbc.com/jeff-cox/"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

    async def get_article_links(self, limit: int = 20) -> List[str]:
        """
        获取 Jeff Cox 文章列表页面的所有文章链接

        Args:
            limit: 最多获取的文章数

        Returns:
            文章 URL 列表
        """
        try:
            logger.info(f"正在获取 Jeff Cox 文章列表: {self.base_url}")
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(self.base_url, headers=self.headers)

            if response.status_code != 200:
                logger.error(f"页面请求失败，状态码: {response.status_code}")
                return []

            soup = BeautifulSoup(response.text, 'html.parser')

            # 提取当前年份和去年的文章 URL
            current_year = datetime.now().year
            target_years = [str(current_year), str(current_year - 1)]

            article_urls = set()
            exclude_patterns = [
                'stock-market-today-live-updates',
                '/live-updates',
                '/markets-live-updates'
            ]

            for a_tag in soup.find_all('a', href=True):
                href = a_tag['href']
                year_match = any(f'/{year}/' in href for year in target_years)
                is_cnbc_link = href.startswith('https://www.cnbc.com/')

                if year_match and is_cnbc_link:
                    if not any(pattern in href for pattern in exclude_patterns):
                        article_urls.add(href)

            result = list(sorted(article_urls, reverse=True))[:limit]
            logger.info(f"找到 {len(result)} 篇 Jeff Cox 文章链接")
            return result

        except Exception as e:
            logger.error(f"获取 Jeff Cox 文章列表失败: {e}", exc_info=True)
            return []

    def extract_publish_time(self, soup: BeautifulSoup, url: str) -> Optional[datetime]:
        """提取文章发表时间（优先从页面，备用从 URL）"""
        # 方法 1：从 <time> 标签提取
        try:
            time_element = soup.find('time', {'data-testid': 'published-timestamp'})
            if time_element and time_element.get('datetime'):
                datetime_str = time_element.get('datetime')
                datetime_str = datetime_str.replace('Z', '+00:00')
                if '+' in datetime_str:
                    datetime_str = datetime_str.split('+')[0]
                return datetime.fromisoformat(datetime_str)
        except Exception as e:
            logger.warning(f"从页面提取时间失败: {e}")

        # 方法 2：从 URL 提取日期
        try:
            date_pattern = r'/(\d{4})/(\d{2})/(\d{2})/'
            match = re.search(date_pattern, url)
            if match:
                year, month, day = match.groups()
                return datetime(int(year), int(month), int(day))
        except Exception as e:
            logger.warning(f"从 URL 提取日期失败: {e}")

        return None

    def extract_title(self, soup: BeautifulSoup) -> str:
        """提取文章标题"""
        try:
            title_element = (
                soup.find('h1', class_='ArticleHeader-headline') or
                soup.find('h1') or
                soup.find('title')
            )
            if title_element:
                return title_element.get_text().strip()
        except Exception as e:
            logger.warning(f"提取标题失败: {e}")
        return ""

    async def scrape_article(self, url: str) -> Optional[Dict]:
        """
        抓取单篇文章的完整内容

        Args:
            url: 文章 URL

        Returns:
            文章数据字典
        """
        try:
            logger.info(f"正在抓取文章: {url}")
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=self.headers)

            if response.status_code != 200:
                logger.error(f"文章请求失败，状态码: {response.status_code}")
                return None

            soup = BeautifulSoup(response.text, 'html.parser')

            # 提取标题
            title = self.extract_title(soup)
            if not title:
                logger.warning(f"未找到文章标题: {url}")
                return None

            # 提取作者
            author_element = soup.find('a', class_='Author-authorName')
            author = author_element.text.strip() if author_element else "Jeff Cox"

            # 提取 Key Points 摘要
            key_points_div = soup.find('div', class_='RenderKeyPoints-list')
            summary_keypoints = key_points_div.get_text().strip() if key_points_div else ""

            # 提取完整正文
            content_div = soup.find('div', class_='ArticleBody-articleBody')
            content_full = content_div.get_text().strip() if content_div else ""

            if not content_full:
                logger.warning(f"未找到文章正文: {url}")
                return None

            # 提取发表时间
            published_at = self.extract_publish_time(soup, url)
            if not published_at:
                logger.warning(f"未找到发表时间: {url}")
                return None

            # 生成 URL hash 作为 ID
            url_hash = hashlib.md5(url.encode()).hexdigest()[:50]

            article_data = {
                "id": url_hash,
                "source": "cnbc_jeff_cox",
                "title": title,
                "url": url,
                "author": author,
                "content": "",
                "content_full": content_full,
                "summary_keypoints": summary_keypoints,
                "published_at": published_at,
                "is_full_content": True,
                "scraped_at": datetime.utcnow(),
                "category": "finance"
            }

            logger.info(f"文章抓取成功: {title} ({len(content_full)} 字)")
            return article_data

        except Exception as e:
            logger.error(f"抓取文章失败 {url}: {e}", exc_info=True)
            return None

    async def scrape_latest_articles(self, limit: int = 10) -> List[Dict]:
        """
        抓取最新的 Jeff Cox 文章

        Args:
            limit: 最多抓取的文章数

        Returns:
            文章数据列表
        """
        logger.info(f"开始抓取最新的 {limit} 篇 Jeff Cox 文章")

        article_links = await self.get_article_links(limit)
        if not article_links:
            logger.warning("未获取到任何文章链接")
            return []

        articles = []
        for i, link in enumerate(article_links, 1):
            logger.info(f"[{i}/{len(article_links)}] 正在处理文章...")
            article_data = await self.scrape_article(link)
            if article_data:
                articles.append(article_data)

        logger.info(f"成功抓取 {len(articles)} 篇文章")
        return articles
