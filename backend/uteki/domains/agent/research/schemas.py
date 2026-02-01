"""
Data models for Deep Research functionality.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    """Web search result from search engine."""

    title: str = Field(..., description="Page title")
    url: str = Field(..., description="URL of the page")
    snippet: str = Field(..., description="Short description/snippet")
    source: str = Field(..., description="Domain name (e.g., wikipedia.org)")

    class Config:
        json_schema_extra = {
            "example": {
                "title": "Python Documentation",
                "url": "https://docs.python.org/3/",
                "snippet": "Official Python documentation",
                "source": "docs.python.org",
            }
        }


class ScrapedContent(BaseModel):
    """Extracted content from a web page."""

    url: str = Field(..., description="Original URL")
    content: str = Field(..., description="Extracted text content")
    title: Optional[str] = Field(None, description="Page title")
    extraction_method: str = Field(
        ..., description="Method used (trafilatura/beautifulsoup)"
    )
    timestamp: datetime = Field(default_factory=datetime.now, description="When scraped")

    class Config:
        json_schema_extra = {
            "example": {
                "url": "https://example.com/article",
                "content": "Article content here...",
                "title": "Example Article",
                "extraction_method": "trafilatura",
                "timestamp": "2024-01-31T20:00:00",
            }
        }


class ResearchRequest(BaseModel):
    """Request for Deep Research."""

    query: str = Field(..., min_length=1, description="Research query")
    max_sources: int = Field(default=20, ge=1, le=50, description="Max search results")
    max_scrape: int = Field(default=10, ge=1, le=20, description="Max URLs to scrape")

    class Config:
        json_schema_extra = {
            "example": {
                "query": "What are the latest advances in quantum computing?",
                "max_sources": 20,
                "max_scrape": 10,
            }
        }
