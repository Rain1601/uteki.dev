"""
Company Analysis Eval Harness — Serial CLI runner.

Triggers the 7-gate pipeline via SSE for a matrix of (symbol × model),
shows live gate-by-gate progress in the terminal, then aggregates
quality + judge scores into a JSON report.

Usage:
    poetry run python -m scripts.eval_harness \\
        --symbols TSLA,AAPL,MSFT \\
        --models openai/deepseek-v3.2,anthropic/claude-sonnet-4-5 \\
        --output eval_2026-04-30.json

By default uses the first user in the DB as the auth subject. Override with --user-email.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from rich.console import Console
from rich.live import Live
from rich.table import Table
from rich.text import Text

# Make backend imports work when running as a script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from uteki.common.database import db_manager  # noqa: E402
from uteki.domains.auth.jwt import create_access_token  # noqa: E402
from uteki.domains.company.skill_runner import _check_gate7_quality  # noqa: E402

GATE_LABELS = ["业务", "Fisher", "护城河", "管理层", "逆向", "估值", "裁决"]
console = Console()


@dataclass
class RunResult:
    symbol: str
    provider: str
    model: str
    analysis_id: str | None = None
    status: str = "pending"  # pending | running | completed | error
    error: str | None = None
    total_latency_ms: int = 0
    started_at: str = ""
    finished_at: str = ""

    # Per-gate parse status (gate_num → status)
    gate_status: dict[int, str] = field(default_factory=dict)
    gate_latency: dict[int, int] = field(default_factory=dict)

    # Quality check
    quality_passed: bool = False
    quality_issues: list[str] = field(default_factory=list)

    # Judge scores
    judge: dict[str, Any] = field(default_factory=dict)


# ── Auth ───────────────────────────────────────────────────────────────────

async def get_user_token(email: str | None = None) -> tuple[str, str]:
    """Return (token, user_id). Uses the first user in DB if email omitted."""
    await db_manager.initialize()
    async with db_manager.get_postgres_session() as session:
        from sqlalchemy import text
        if email:
            r = await session.execute(
                text("SELECT id, email FROM users WHERE email = :e LIMIT 1"),
                {"e": email},
            )
        else:
            r = await session.execute(text("SELECT id, email FROM users LIMIT 1"))
        row = r.fetchone()
        if not row:
            raise RuntimeError("No users in DB. Log in via the frontend at least once first.")
        user_id, user_email = row[0], row[1]

    token = create_access_token({"sub": str(user_id), "email": user_email})
    return token, str(user_id)


# ── SSE Runner ─────────────────────────────────────────────────────────────

def _render_progress(result: RunResult) -> Table:
    """Build a live progress table for one running analysis."""
    table = Table.grid(padding=(0, 1))
    table.add_column(justify="right", style="bold")
    table.add_column()

    title = f"[cyan]{result.symbol}[/cyan] · {result.provider}/{result.model}"
    if result.analysis_id:
        title += f" · [dim]{result.analysis_id[:8]}[/dim]"
    table.add_row("Run", title)

    # Gate dots
    cells = []
    for i, label in enumerate(GATE_LABELS, start=1):
        status = result.gate_status.get(i)
        if status == "complete" or status == "structured":
            dot = "[green]●[/green]"
        elif status == "running":
            dot = "[yellow]◐[/yellow]"
        elif status in ("error", "timeout"):
            dot = "[red]✗[/red]"
        elif status == "text":
            dot = "[blue]●[/blue]"  # text-only (no JSON)
        else:
            dot = "[dim]○[/dim]"
        cells.append(f"{dot} {label}")
    table.add_row("Gates", "  ".join(cells))

    elapsed = (time.time() - _started_ts(result)) if result.started_at else 0
    table.add_row("Status", f"{result.status} · {elapsed:.0f}s")

    return table


def _started_ts(result: RunResult) -> float:
    if not result.started_at:
        return time.time()
    return datetime.fromisoformat(result.started_at).timestamp()


async def run_one(
    client: httpx.AsyncClient,
    token: str,
    symbol: str,
    provider: str,
    model: str,
    as_of: str | None = None,
) -> RunResult:
    """Execute one analysis, render live progress, return result with metrics."""
    result = RunResult(symbol=symbol, provider=provider, model=model)
    result.started_at = datetime.utcnow().isoformat()
    result.status = "running"

    payload: dict = {"symbol": symbol, "provider": provider, "model": model}
    if as_of:
        payload["as_of"] = as_of
    headers = {"Authorization": f"Bearer {token}", "Accept": "text/event-stream"}

    with Live(_render_progress(result), console=console, refresh_per_second=4) as live:
        try:
            async with client.stream(
                "POST", "/api/company/analyze/stream",
                json=payload, headers=headers, timeout=None,
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    result.status = "error"
                    result.error = f"HTTP {resp.status_code}: {body.decode(errors='replace')[:200]}"
                    live.update(_render_progress(result))
                    return result

                event_data = ""
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        event_data = line[6:]
                    elif line == "" and event_data:
                        try:
                            event = json.loads(event_data)
                        except json.JSONDecodeError:
                            event_data = ""
                            continue
                        _apply_event(result, event)
                        live.update(_render_progress(result))
                        event_data = ""
        except Exception as e:
            result.status = "error"
            result.error = f"Stream error: {e}"
            live.update(_render_progress(result))

    result.finished_at = datetime.utcnow().isoformat()
    return result


def _apply_event(result: RunResult, event: dict) -> None:
    """Mutate `result` based on an SSE event."""
    etype = event.get("type")
    if etype == "data_loaded":
        if event.get("analysis_id"):
            result.analysis_id = event["analysis_id"]
    elif etype == "gate_start":
        gate = event.get("gate")
        if gate:
            result.gate_status[gate] = "running"
    elif etype == "gate_complete":
        gate = event.get("gate")
        if gate:
            result.gate_status[gate] = event.get("parse_status", "complete")
            result.gate_latency[gate] = event.get("latency_ms", 0)
    elif etype == "result":
        data = event.get("data", {})
        result.total_latency_ms = data.get("total_latency_ms", 0)
        result.status = "completed"
    elif etype == "error":
        result.status = "error"
        result.error = event.get("message", "unknown")


# ── Quality Check + Judge ──────────────────────────────────────────────────

async def fetch_detail(client: httpx.AsyncClient, token: str, analysis_id: str) -> dict:
    r = await client.get(
        f"/api/company/analyses/{analysis_id}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


async def run_judge(
    client: httpx.AsyncClient, token: str, analysis_id: str, judge_model: str = "deepseek-chat",
) -> dict:
    """Call the existing /api/evaluation/judge endpoint."""
    r = await client.post(
        f"/api/evaluation/judge/{analysis_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"judge_model": judge_model},
        timeout=300,
    )
    if r.status_code != 200:
        return {"error": f"judge HTTP {r.status_code}: {r.text[:200]}"}
    return r.json()


def evaluate_quality(detail: dict) -> tuple[bool, list[str]]:
    """Run our quality checker on the full_report from a finished analysis."""
    full = detail.get("full_report") or {}
    skills = full.get("skills") or {}
    parsed_dict = {
        sn: skills.get(sn, {}).get("parsed", {}) or {}
        for sn in [
            "business_analysis", "fisher_qa", "moat_assessment",
            "management_assessment", "reverse_test", "valuation",
            "position_holding",
        ]
    }
    # final_verdict's parsed contains position_holding nested — unwrap it
    fv_parsed = skills.get("final_verdict", {}).get("parsed") or {}
    if isinstance(fv_parsed.get("position_holding"), dict):
        parsed_dict["position_holding"] = fv_parsed["position_holding"]
    return _check_gate7_quality(parsed_dict)


# ── Aggregation ────────────────────────────────────────────────────────────

def render_summary(results: list[RunResult]) -> Table:
    table = Table(title="Eval Summary", show_lines=True)
    table.add_column("Symbol", style="cyan")
    table.add_column("Model")
    table.add_column("Status")
    table.add_column("Gates", justify="center")
    table.add_column("Time", justify="right")
    table.add_column("Quality")
    table.add_column("Judge", justify="right")

    for r in results:
        gate_summary = "".join(
            "✓" if r.gate_status.get(i) in ("complete", "structured") else
            "T" if r.gate_status.get(i) == "text" else
            "✗"
            for i in range(1, 8)
        )
        time_str = f"{r.total_latency_ms / 1000:.0f}s" if r.total_latency_ms else "—"
        quality_str = (
            "[green]✓[/green]" if r.quality_passed
            else f"[red]{len(r.quality_issues)} issues[/red]" if r.quality_issues
            else "—"
        )
        judge_str = "—"
        agg = r.judge.get("aggregate") if isinstance(r.judge, dict) else None
        if agg:
            judge_str = f"{agg.get('overall', '?')}/10"
        elif r.judge.get("error"):
            judge_str = "[red]err[/red]"

        status_color = {"completed": "green", "error": "red"}.get(r.status, "yellow")
        table.add_row(
            r.symbol,
            f"{r.provider}/{r.model}",
            f"[{status_color}]{r.status}[/{status_color}]",
            gate_summary,
            time_str,
            quality_str,
            judge_str,
        )
    return table


def save_results(results: list[RunResult], path: Path) -> None:
    payload = {
        "generated_at": datetime.utcnow().isoformat(),
        "runs": [asdict(r) for r in results],
        "aggregate": {
            "total": len(results),
            "completed": sum(1 for r in results if r.status == "completed"),
            "errored": sum(1 for r in results if r.status == "error"),
            "quality_passed": sum(1 for r in results if r.quality_passed),
        },
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))


# ── Main ───────────────────────────────────────────────────────────────────

async def main_async(args: argparse.Namespace) -> int:
    symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]
    model_specs = [m.strip() for m in args.models.split(",") if m.strip()]

    if not symbols or not model_specs:
        console.print("[red]No symbols or models specified.[/red]")
        return 1

    console.print(f"[bold]Auth:[/bold] resolving token for {args.user_email or '(first user)'}")
    token, user_id = await get_user_token(args.user_email)
    console.print(f"  user_id={user_id}\n")

    matrix = [(sym, spec) for sym in symbols for spec in model_specs]
    console.print(f"[bold]Plan:[/bold] {len(matrix)} runs ({len(symbols)} symbols × {len(model_specs)} models)\n")

    results: list[RunResult] = []
    async with httpx.AsyncClient(base_url=args.api, timeout=None) as client:
        for i, (symbol, spec) in enumerate(matrix, 1):
            provider, _, model = spec.partition("/")
            if not model:
                console.print(f"[red]Invalid model spec: {spec}. Use provider/model.[/red]")
                continue

            as_of_tag = f" · as_of={args.as_of}" if args.as_of else ""
            console.print(f"[bold cyan]── Run {i}/{len(matrix)} · {symbol} · {provider}/{model}{as_of_tag} ──[/bold cyan]")
            result = await run_one(client, token, symbol, provider, model, as_of=args.as_of)

            # Post-completion: fetch detail, run quality + judge
            if result.status == "completed" and result.analysis_id:
                try:
                    detail = await fetch_detail(client, token, result.analysis_id)
                    passed, issues = evaluate_quality(detail)
                    result.quality_passed = passed
                    result.quality_issues = issues
                    if not args.no_judge:
                        console.print("  [dim]Running judge...[/dim]")
                        result.judge = await run_judge(client, token, result.analysis_id, args.judge_model)
                except Exception as e:
                    console.print(f"  [yellow]Post-processing failed: {e}[/yellow]")

            results.append(result)
            console.print()

    # Summary
    console.print(render_summary(results))

    if args.output:
        out_path = Path(args.output)
        save_results(results, out_path)
        console.print(f"\n[green]Saved → {out_path}[/green]")

    completed = sum(1 for r in results if r.status == "completed")
    return 0 if completed == len(results) else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Company analysis eval harness (serial)")
    parser.add_argument("--symbols", required=True, help="Comma-separated, e.g. TSLA,AAPL,MSFT")
    parser.add_argument("--models", required=True, help="Comma-separated provider/model, e.g. openai/deepseek-v3.2,anthropic/claude-sonnet-4-5")
    parser.add_argument("--user-email", default=None, help="User email to auth as (defaults to first user)")
    parser.add_argument("--api", default="http://localhost:8888", help="Backend base URL")
    parser.add_argument("--output", default=f"eval_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    parser.add_argument("--no-judge", action="store_true", help="Skip the LLM-as-judge pass")
    parser.add_argument("--as-of", default=None,
                        help="ISO date YYYY-MM-DD. When set, pipeline only sees data published on or before this date (Phase γ backtest mode).")
    parser.add_argument("--judge-model", default="deepseek-chat")
    args = parser.parse_args()

    try:
        return asyncio.run(main_async(args))
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted.[/yellow]")
        return 130


if __name__ == "__main__":
    sys.exit(main())
