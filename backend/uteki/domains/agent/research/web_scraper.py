"""
Web content extraction with multiple strategies.
Uses Trafilatura as primary, BeautifulSoup as fallback.
"""

import asyncio
import logging
import os
from datetime import datetime
from typing import List, Optional

import httpx
from bs4 import BeautifulSoup

from .schemas import ScrapedContent

logger = logging.getLogger(__name__)

# Configuration
WEB_SCRAPER_TIMEOUT = int(os.getenv("WEB_SCRAPER_TIMEOUT", "10"))
MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", "3000"))
MAX_CONCURRENT_SCRAPES = int(os.getenv("MAX_CONCURRENT_SCRAPES", "5"))

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


class WebScraper:
    """Web content scraper with multiple extraction strategies."""

    def __init__(
        self,
        timeout: int = WEB_SCRAPER_TIMEOUT,
        max_content_length: int = MAX_CONTENT_LENGTH,
        max_concurrent: int = MAX_CONCURRENT_SCRAPES,
    ):
        """
        Initialize web scraper.

        Args:
            timeout: HTTP request timeout in seconds
            max_content_length: Maximum content length to extract
            max_concurrent: Maximum concurrent scrape operations
        """
        self.timeout = timeout
        self.max_content_length = max_content_length
        self.max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)

        logger.info(
            f"WebScraper initialized: timeout={timeout}s, "
            f"max_content={max_content_length}, max_concurrent={max_concurrent}"
        )

    async def scrape_url(self, url: str) -> Optional[ScrapedContent]:
        """
        Scrape a single URL.

        Args:
            url: URL to scrape

        Returns:
            ScrapedContent or None if scraping failed
        """
        async with self._semaphore:
            return await self._scrape_single(url)

    async def scrape_urls(
        self, urls: List[str], progress_callback=None
    ) -> List[ScrapedContent]:
        """
        Scrape multiple URLs concurrently.

        Args:
            urls: List of URLs to scrape
            progress_callback: Optional callback(current, total) for progress

        Returns:
            List of successfully scraped contents
        """
        logger.info(f"Scraping {len(urls)} URLs (max_concurrent={self.max_concurrent})")

        results = []
        completed = 0

        tasks = [self.scrape_url(url) for url in urls]

        for coro in asyncio.as_completed(tasks):
            content = await coro
            if content:
                results.append(content)

            completed += 1
            if progress_callback:
                progress_callback(completed, len(urls))

        logger.info(
            f"Scraping complete: {len(results)}/{len(urls)} successful "
            f"({len(results) / len(urls) * 100:.1f}%)"
        )

        return results

    async def _scrape_single(self, url: str) -> Optional[ScrapedContent]:
        """Internal method to scrape a single URL."""
        try:
            # Fetch HTML
            html = await self._fetch_html(url)
            if not html:
                return None

            # Extract title
            title = self._extract_title(html)

            # Try Trafilatura first
            content = self._extract_with_trafilatura(html)
            extraction_method = "trafilatura"

            # Fallback to BeautifulSoup
            if not content or len(content.strip()) < 50:
                logger.debug(f"Trafilatura failed for {url}, trying BeautifulSoup")
                content = self._extract_with_beautifulsoup(html)
                extraction_method = "beautifulsoup"

            if not content or len(content.strip()) < 50:
                logger.warning(f"Failed to extract meaningful content from {url}")
                return None

            # Clean and truncate
            content = self._clean_content(content)

            return ScrapedContent(
                url=url,
                content=content,
                title=title,
                extraction_method=extraction_method,
                timestamp=datetime.now(),
            )

        except Exception as e:
            logger.error(f"Error scraping {url}: {e}")
            return None

    async def _fetch_html(self, url: str) -> Optional[str]:
        """Fetch HTML content from URL."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    url,
                    headers={"User-Agent": USER_AGENT},
                    follow_redirects=True,
                )

                if response.status_code == 200:
                    return response.text
                else:
                    logger.warning(f"HTTP {response.status_code} for {url}")
                    return None

        except httpx.TimeoutException:
            logger.warning(f"Timeout fetching {url}")
            return None
        except httpx.HTTPError as e:
            logger.warning(f"HTTP error fetching {url}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching {url}: {e}")
            return None

    @staticmethod
    def _extract_title(html: str) -> Optional[str]:
        """Extract page title from HTML."""
        try:
            soup = BeautifulSoup(html, "html.parser")
            title_tag = soup.find("title")
            if title_tag:
                return title_tag.get_text().strip()
        except Exception as e:
            logger.debug(f"Error extracting title: {e}")
        return None

    @staticmethod
    def _extract_with_trafilatura(html: str) -> Optional[str]:
        """Extract content using Trafilatura."""
        try:
            import trafilatura

            content = trafilatura.extract(
                html,
                include_comments=False,
                include_tables=False,
                no_fallback=False,
            )
            return content
        except Exception as e:
            logger.debug(f"Trafilatura extraction failed: {e}")
            return None

    @staticmethod
    def _extract_with_beautifulsoup(html: str) -> Optional[str]:
        """Extract content using BeautifulSoup fallback."""
        try:
            soup = BeautifulSoup(html, "html.parser")

            # Remove script and style tags
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()

            # Get text
            text = soup.get_text(separator="\n")
            return text
        except Exception as e:
            logger.debug(f"BeautifulSoup extraction failed: {e}")
            return None

    def _clean_content(self, content: str) -> str:
        """Clean and normalize extracted content."""
        # Normalize whitespace
        lines = [line.strip() for line in content.splitlines()]
        lines = [line for line in lines if line]  # Remove empty lines
        content = "\n".join(lines)

        # Remove excessive newlines
        while "\n\n\n" in content:
            content = content.replace("\n\n\n", "\n\n")

        # Truncate if too long
        if len(content) > self.max_content_length:
            content = content[: self.max_content_length] + "\n\n[Content truncated]"

        return content.strip()
