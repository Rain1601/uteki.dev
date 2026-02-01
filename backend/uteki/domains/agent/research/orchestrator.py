"""
Deep Research Orchestrator - coordinates multi-step research process.
"""

import asyncio
import logging
import os
from typing import AsyncGenerator, Dict, Any, List

from ..llm_adapter import BaseLLMAdapter, LLMConfig
from .search_engine import SearchEngine
from .web_scraper import WebScraper
from .schemas import SearchResult, ScrapedContent

logger = logging.getLogger(__name__)

# Configuration
MAX_SEARCH_RESULTS = int(os.getenv("MAX_SEARCH_RESULTS", "20"))
MAX_SCRAPE_URLS = int(os.getenv("MAX_SCRAPE_URLS", "10"))


class DeepResearchOrchestrator:
    """
    Orchestrates the Deep Research process:
    1. Decompose query into subtasks
    2. Search web for sources
    3. Scrape and extract content
    4. Synthesize findings with LLM
    """

    def __init__(
        self,
        llm_adapter: BaseLLMAdapter | None = None,
        search_engine: SearchEngine | None = None,
        web_scraper: WebScraper | None = None,
    ):
        """
        Initialize orchestrator.

        Args:
            llm_adapter: LLM adapter for query decomposition and synthesis
            search_engine: Search engine instance
            web_scraper: Web scraper instance
        """
        self.llm = llm_adapter
        self.search_engine = search_engine or SearchEngine()
        self.web_scraper = web_scraper or WebScraper()

        logger.info("DeepResearchOrchestrator initialized")

    async def research_stream(
        self,
        query: str,
        max_sources: int = MAX_SEARCH_RESULTS,
        max_scrape: int = MAX_SCRAPE_URLS,
        llm_adapter: BaseLLMAdapter | None = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Execute deep research and stream progress events.

        Args:
            query: User's research query
            max_sources: Maximum search results to collect
            max_scrape: Maximum URLs to scrape
            llm_adapter: LLM adapter instance (required for decomposition and synthesis)

        Yields:
            SSE event dictionaries with type and data fields
        """
        try:
            # Use provided LLM adapter or stored one
            llm = llm_adapter or self.llm
            if not llm:
                yield {
                    "type": "error",
                    "data": {"message": "LLM adapter not configured"},
                }
                return

            # Emit research start
            yield {"type": "research_start", "data": {"query": query}}

            # Step 1: Decompose query into subtasks
            logger.info(f"Decomposing query: {query}")
            subtasks = await self._decompose_query(query, llm)

            if subtasks:
                yield {
                    "type": "thought",
                    "data": {"thoughts": subtasks},
                }
            else:
                # If decomposition fails, use original query
                subtasks = [query]

            # Emit plan
            yield {
                "type": "plan_created",
                "data": {
                    "subtasks": subtasks,
                    "max_sources": max_sources,
                    "max_scrape": max_scrape,
                },
            }

            # Step 2: Search for sources
            logger.info(f"Searching for sources ({max_sources} max)")
            yield {"type": "status", "data": {"message": "Searching the web..."}}

            all_results: List[SearchResult] = []

            for i, subtask in enumerate(subtasks, 1):
                yield {
                    "type": "status",
                    "data": {"message": f"Searching: {subtask} ({i}/{len(subtasks)})"},
                }

                results = await self.search_engine.search(
                    query=subtask,
                    max_results=max_sources // len(subtasks) + 1,
                )

                all_results.extend(results)

                yield {
                    "type": "sources_update",
                    "data": {
                        "count": len(all_results),
                        "current_subtask": i,
                        "total_subtasks": len(subtasks),
                    },
                }

            # Deduplicate and limit
            seen_urls = set()
            unique_results = []
            for result in all_results:
                if result.url not in seen_urls:
                    seen_urls.add(result.url)
                    unique_results.append(result)
                    if len(unique_results) >= max_sources:
                        break

            logger.info(f"Found {len(unique_results)} unique sources")

            # Emit sources complete
            source_urls = [
                {
                    "title": r.title,
                    "url": r.url,
                    "snippet": r.snippet,
                    "source": r.source,
                }
                for r in unique_results
            ]

            yield {
                "type": "sources_complete",
                "data": {
                    "sources": SearchEngine.aggregate_sources(unique_results),
                    "sourceUrls": source_urls,
                },
            }

            # Step 3: Scrape content
            logger.info(f"Scraping {min(len(unique_results), max_scrape)} URLs")
            yield {"type": "status", "data": {"message": "Reading sources..."}}

            urls_to_scrape = [r.url for r in unique_results[:max_scrape]]

            scraped_contents: List[ScrapedContent] = []

            def progress_callback(current: int, total: int):
                """Called after each scrape completes."""
                pass  # We'll emit events in the scrape loop instead

            # Scrape with progress tracking
            for i, url in enumerate(urls_to_scrape, 1):
                yield {
                    "type": "source_read",
                    "data": {
                        "url": url,
                        "current": i,
                        "total": len(urls_to_scrape),
                    },
                }

                content = await self.web_scraper.scrape_url(url)
                if content:
                    scraped_contents.append(content)

            logger.info(f"Successfully scraped {len(scraped_contents)} pages")

            if not scraped_contents:
                yield {
                    "type": "error",
                    "data": {"message": "Failed to scrape any content"},
                }
                return

            # Step 4: Synthesize with LLM
            logger.info("Synthesizing research findings")
            yield {"type": "status", "data": {"message": "Analyzing information..."}}

            synthesis_prompt = self._build_synthesis_prompt(
                query, subtasks, scraped_contents
            )

            # Stream LLM response
            async for chunk in llm.chat_stream([{"role": "user", "content": synthesis_prompt}]):
                if chunk:
                    yield {"type": "content_chunk", "data": {"content": chunk}}

            # Emit completion
            yield {
                "type": "research_complete",
                "data": {
                    "sources_searched": len(unique_results),
                    "sources_scraped": len(scraped_contents),
                    "subtasks": subtasks,
                },
            }

        except Exception as e:
            logger.error(f"Research error: {e}", exc_info=True)
            yield {"type": "error", "data": {"message": str(e)}}

    async def _decompose_query(self, query: str, llm: BaseLLMAdapter) -> List[str]:
        """
        Decompose user query into 2-5 focused subtasks using LLM.

        Args:
            query: User's research query
            llm: LLM adapter instance

        Returns:
            List of subtask strings
        """
        prompt = f"""You are a research assistant. Break down this research query into 2-5 focused subtasks that will help gather comprehensive information.

Research Query: {query}

Return ONLY a JSON array of subtask strings, like:
["subtask 1", "subtask 2", "subtask 3"]

Make subtasks specific and searchable. Each should explore a different aspect of the topic."""

        try:
            response = await llm.chat([{"role": "user", "content": prompt}])

            # Try to parse JSON response
            import json

            # Extract JSON array from response
            start = response.find("[")
            end = response.rfind("]") + 1

            if start >= 0 and end > start:
                subtasks = json.loads(response[start:end])
                if isinstance(subtasks, list) and 2 <= len(subtasks) <= 5:
                    logger.info(f"Decomposed query into {len(subtasks)} subtasks")
                    return subtasks

        except Exception as e:
            logger.warning(f"Query decomposition failed: {e}")

        # Fallback: use original query
        return [query]

    @staticmethod
    def _build_synthesis_prompt(
        query: str, subtasks: List[str], contents: List[ScrapedContent]
    ) -> str:
        """
        Build prompt for LLM synthesis of research findings.

        Args:
            query: Original query
            subtasks: List of subtasks
            contents: Scraped content from web sources

        Returns:
            Synthesis prompt string
        """
        sources_text = "\n\n".join([
            f"--- Source {i + 1}: {content.title or content.url} ---\n{content.content}"
            for i, content in enumerate(contents)
        ])

        prompt = f"""You are a research analyst. Based on the information gathered from multiple web sources, provide a comprehensive answer to the research query.

Research Query: {query}

Subtasks Explored:
{chr(10).join(f"{i + 1}. {task}" for i, task in enumerate(subtasks))}

Information Gathered:
{sources_text}

Instructions:
1. Synthesize the information to answer the research query thoroughly
2. Use markdown formatting for better readability
3. Cite sources when making specific claims (use the source title or URL)
4. Highlight key findings and insights
5. If information is conflicting, acknowledge different perspectives
6. Be objective and evidence-based

Your comprehensive answer:"""

        return prompt
