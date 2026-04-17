"""
Fixture loader for company evaluation datasets.

Fixtures live at `backend/tests/fixtures/companies/*.yaml`. See that directory's
README and `_schema.yaml` for the expected structure.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


class FixtureNotFoundError(FileNotFoundError):
    """Raised when a requested fixture name does not resolve to a YAML file."""


# backend/uteki/domains/evaluation/datasets/loader.py
#   → parents[0] = datasets
#   → parents[1] = evaluation
#   → parents[2] = domains
#   → parents[3] = uteki
#   → parents[4] = backend
_FIXTURE_ROOT = Path(__file__).resolve().parents[4] / "tests" / "fixtures" / "companies"


def _is_fixture_file(p: Path) -> bool:
    """Skip underscore-prefixed files (e.g. _schema.yaml, README.md)."""
    return p.is_file() and p.suffix == ".yaml" and not p.name.startswith("_")


def list_company_fixtures() -> list[str]:
    """Return the names (stem) of available company fixtures, sorted."""
    if not _FIXTURE_ROOT.exists():
        return []
    return sorted(p.stem for p in _FIXTURE_ROOT.iterdir() if _is_fixture_file(p))


def load_company_fixture(name: str) -> dict[str, Any]:
    """Load and minimally validate a company fixture by name.

    Raises:
        FixtureNotFoundError: if no file matches the given name.
        ValueError: if the YAML exists but lacks required top-level keys.
    """
    if not name or "/" in name or name.startswith("_"):
        raise ValueError(f"invalid fixture name: {name!r}")

    path = _FIXTURE_ROOT / f"{name}.yaml"
    if not path.exists():
        available = list_company_fixtures()
        raise FixtureNotFoundError(
            f"fixture {name!r} not found at {path}. "
            f"Available: {available}"
        )

    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        raise ValueError(f"fixture {name} is not a YAML mapping")

    # Minimal contract — every fixture must at least identify the company.
    meta = data.get("meta")
    if not isinstance(meta, dict) or not meta.get("symbol"):
        raise ValueError(f"fixture {name} missing meta.symbol")

    return data
