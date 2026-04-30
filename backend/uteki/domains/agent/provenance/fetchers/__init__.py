"""Concrete DataFetcher implementations.

Each fetcher in this package targets one external data source. Importing
this package triggers registration of every fetcher into the global registry
(see uteki.domains.agent.provenance.registry).
"""
from . import cse_fetcher  # noqa: F401  (registers on import)
from . import yfinance_fetcher  # noqa: F401
from . import fmp_fetcher  # noqa: F401
from . import sec_edgar_fetcher  # noqa: F401

from .yfinance_fetcher import seed_from_company_data
from .fmp_fetcher import seed_from_fmp
from .sec_edgar_fetcher import seed_from_edgar

__all__ = [
    "cse_fetcher",
    "yfinance_fetcher",
    "fmp_fetcher",
    "sec_edgar_fetcher",
    "seed_from_company_data",
    "seed_from_fmp",
    "seed_from_edgar",
]
