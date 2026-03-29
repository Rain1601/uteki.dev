"""
Company Agent API — 7-gate decision tree pipeline.

POST   /api/company/analyze         — synchronous (full result)
POST   /api/company/analyze/stream  — SSE streaming (progressive)
GET    /api/company/analyses         — list analyses (paginated)
GET    /api/company/analyses/{id}    — get analysis detail
DELETE /api/company/analyses/{id}    — delete analysis
DELETE /api/company/cache/{symbol}   — invalidate cache
"""
from __future__ import annotations
import asyncio
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.responses import StreamingResponse

from uteki.domains.auth.deps import get_current_user
from uteki.common.config import settings
from .schemas import CompanyAnalyzeRequest, PositionHoldingOutput
from .financials import fetch_company_data, invalidate_company_cache
from .skill_runner import CompanySkillRunner
from .repository import CompanyAnalysisRepository

logger = logging.getLogger(__name__)
router = APIRouter()

_DEFAULT_MODEL = "deepseek-chat"

# Legacy fallback models (used when AIHubMix is not configured)
_FALLBACK_MODELS = [
    {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "api_key_attr": "anthropic_api_key"},
    {"provider": "openai",    "model": "gpt-4.1",                  "api_key_attr": "openai_api_key"},
    {"provider": "deepseek",  "model": "deepseek-chat",            "api_key_attr": "deepseek_api_key"},
    {"provider": "google",    "model": "gemini-2.5-pro-thinking",  "api_key_attr": "google_api_key", "base_url_attr": "google_api_base_url"},
    {"provider": "qwen",      "model": "qwen-plus",                "api_key_attr": "dashscope_api_key"},
]


async def _resolve_model(provider_override: Optional[str], model_override: Optional[str]) -> Optional[dict]:
    """Resolve model config.

    Priority:
    1. AIHubMix unified (single key for all models) — Admin DB controls which models are enabled
    2. Admin DB direct (legacy — each model has its own key)
    3. .env fallback (legacy direct provider keys)
    """
    aihub_key = getattr(settings, "aihubmix_api_key", None)
    aihub_url = getattr(settings, "aihubmix_base_url", None) or "https://aihubmix.com/v1"

    # 1. AIHubMix + Admin DB as model registry (which models are enabled)
    if aihub_key:
        # If model explicitly specified by caller, use it directly
        if model_override:
            config = {
                "provider": "openai",
                "model": model_override,
                "api_key": aihub_key,
                "base_url": aihub_url,
            }
            logger.info(f"[company] AIHubMix unified: {config['model']}")
            return config

        # Otherwise, pick first enabled model from Admin DB
        try:
            from uteki.domains.admin.service import LLMProviderService
            svc = LLMProviderService()
            models = await svc.get_active_models_for_runtime()
            for m in models:
                if provider_override and m["provider"] != provider_override:
                    continue
                config = {
                    "provider": "openai",
                    "model": m["model"],
                    "api_key": aihub_key,
                    "base_url": aihub_url,
                }
                logger.info(f"[company] AIHubMix + admin registry: {config['model']}")
                return config
        except Exception as e:
            logger.warning(f"[company] admin model list load failed: {e}")

        # Admin DB unavailable — use default model
        config = {
            "provider": "openai",
            "model": _DEFAULT_MODEL,
            "api_key": aihub_key,
            "base_url": aihub_url,
        }
        logger.info(f"[company] AIHubMix default: {config['model']}")
        return config

    # 2. Legacy: Admin DB with direct provider keys
    try:
        from uteki.domains.admin.service import LLMProviderService
        svc = LLMProviderService()
        models = await svc.get_active_models_for_runtime()
        for m in models:
            if provider_override and m["provider"] != provider_override:
                continue
            config = {
                "provider": m["provider"],
                "model": model_override or m["model"],
                "api_key": m["api_key"],
                "base_url": m.get("base_url") or None,
            }
            logger.info(f"[company] legacy admin direct: {config['provider']}/{config['model']}")
            return config
    except Exception as e:
        logger.warning(f"[company] admin model load failed: {e}")

    # 3. Legacy: .env direct provider keys
    for m in _FALLBACK_MODELS:
        if provider_override and m["provider"] != provider_override:
            continue
        api_key = getattr(settings, m["api_key_attr"], None)
        if api_key:
            base_url = getattr(settings, m.get("base_url_attr", ""), None) if m.get("base_url_attr") else None
            config = {
                "provider": m["provider"],
                "model": model_override or m["model"],
                "api_key": api_key,
                "base_url": base_url,
            }
            logger.info(f"[company] legacy env direct: {config['provider']}/{config['model']}")
            return config

    return None


async def _fetch_and_validate(symbol: str) -> dict:
    """Fetch company data and validate it."""
    company_data = await fetch_company_data(symbol)
    if "error" in company_data:
        raise HTTPException(
            status_code=400,
            detail=f"无法获取 {symbol} 的财务数据：{company_data['error']}",
        )
    price_data = company_data.get("price_data", {})
    if not price_data.get("current_price"):
        raise HTTPException(
            status_code=400,
            detail=f"股票代码 {symbol} 未找到，请检查代码是否正确（如 AAPL、TSLA、700.HK）。",
        )
    return company_data


def _build_response(req, company_data, model_config, result):
    """Build the final API response dict."""
    profile = company_data.get("profile", {})
    cache_meta = company_data.get("_cache_meta", {})
    return {
        "symbol": req.symbol,
        "company_name": profile.get("name", req.symbol),
        "sector": profile.get("sector", ""),
        "industry": profile.get("industry", ""),
        "current_price": company_data.get("price_data", {}).get("current_price", 0),
        "skills": result["skills"],
        "verdict": result["verdict"],
        "trace": result.get("trace", []),
        "tool_calls": result.get("tool_calls"),
        "model_used": f"{model_config['provider']}/{model_config['model']}",
        "total_latency_ms": result["total_latency_ms"],
        "data_freshness": {
            "cached": cache_meta.get("cached", False),
            "fetched_at": cache_meta.get("fetched_at", ""),
            "cache_ttl_hours": cache_meta.get("cache_ttl_hours", 168),
        },
    }


async def _save_analysis(user_id: str, response_data: dict, model_config: dict, error_msg: Optional[str] = None) -> Optional[str]:
    """Persist analysis result to DB. Returns analysis_id or None on failure."""
    try:
        verdict = response_data.get("verdict", {}) if response_data else {}
        row = await CompanyAnalysisRepository.create({
            "user_id": user_id,
            "symbol": response_data.get("symbol", "") if response_data else "",
            "company_name": response_data.get("company_name", "") if response_data else "",
            "provider": model_config["provider"],
            "model": model_config["model"],
            "status": "error" if error_msg else "completed",
            "full_report": response_data or {},
            "verdict_action": verdict.get("action", "WATCH"),
            "verdict_conviction": float(verdict.get("conviction", 0.5)),
            "verdict_quality": verdict.get("quality_verdict", "GOOD"),
            "total_latency_ms": response_data.get("total_latency_ms", 0) if response_data else 0,
            "error_message": error_msg,
        })
        return row.get("id")
    except Exception as e:
        logger.error(f"[company] failed to save analysis: {e}", exc_info=True)
        return None


async def _create_running_analysis(user_id: str, symbol: str, company_name: str, model_config: dict) -> Optional[str]:
    """Create a 'running' analysis record in DB at pipeline start. Returns analysis_id or None."""
    try:
        row = await CompanyAnalysisRepository.create({
            "user_id": user_id,
            "symbol": symbol,
            "company_name": company_name,
            "provider": model_config["provider"],
            "model": model_config["model"],
            "status": "running",
            "full_report": {},
        })
        return row.get("id")
    except Exception as e:
        logger.error(f"[company] failed to create running analysis: {e}")
        return None


async def _update_analysis(analysis_id: str, data: dict):
    """Update an existing analysis record."""
    try:
        await CompanyAnalysisRepository.update(analysis_id, data)
    except Exception as e:
        logger.error(f"[company] failed to update analysis {analysis_id}: {e}")


@router.post("/analyze")
async def analyze_company(
    req: CompanyAnalyzeRequest,
    user: dict = Depends(get_current_user),
):
    """Run 7-gate company analysis pipeline (synchronous)."""
    model_config = await _resolve_model(req.provider, req.model)
    if not model_config:
        raise HTTPException(
            status_code=503,
            detail="未找到可用的 LLM 配置。请在 Admin > Models 中添加 API Key。",
        )

    company_data = await _fetch_and_validate(req.symbol)

    logger.info(
        f"[company] starting pipeline: symbol={req.symbol} "
        f"model={model_config['provider']}/{model_config['model']}"
    )
    runner = CompanySkillRunner(model_config, company_data)
    result = await runner.run_pipeline()

    response = _build_response(req, company_data, model_config, result)

    # Persist to DB
    analysis_id = await _save_analysis(user.get("user_id", "default"), response, model_config)
    if analysis_id:
        response["analysis_id"] = analysis_id

    return response


@router.post("/analyze/stream")
async def analyze_company_stream(
    req: CompanyAnalyzeRequest,
    user: dict = Depends(get_current_user),
):
    """Run 7-gate company analysis pipeline with SSE streaming."""
    model_config = await _resolve_model(req.provider, req.model)
    if not model_config:
        raise HTTPException(
            status_code=503,
            detail="未找到可用的 LLM 配置。请在 Admin > Models 中添加 API Key。",
        )

    company_data = await _fetch_and_validate(req.symbol)
    user_id = user.get("user_id", "default")

    queue: asyncio.Queue = asyncio.Queue()

    def emit_progress(event: dict):
        queue.put_nowait(event)

    async def run_pipeline_task():
        analysis_id = None
        try:
            # Emit data_loaded event
            profile = company_data.get("profile", {})
            company_name = profile.get("name", req.symbol)
            cache_meta = company_data.get("_cache_meta", {})

            # Create running record in DB immediately
            analysis_id = await _create_running_analysis(
                user_id, req.symbol, company_name, model_config
            )

            data_loaded_event = {
                "type": "data_loaded",
                "symbol": req.symbol,
                "company_name": company_name,
                "sector": profile.get("sector", ""),
                "industry": profile.get("industry", ""),
                "current_price": company_data.get("price_data", {}).get("current_price", 0),
                "data_freshness": {
                    "cached": cache_meta.get("cached", False),
                    "fetched_at": cache_meta.get("fetched_at", ""),
                },
                "analysis_id": analysis_id,
            }
            queue.put_nowait(data_loaded_event)

            # Wrap on_progress to update DB on gate_complete
            accumulated_skills: dict = {}

            def tracking_emit(event: dict):
                emit_progress(event)
                if event.get("type") == "gate_complete" and analysis_id and event.get("skill"):
                    accumulated_skills[event["skill"]] = {
                        "gate": event.get("gate"),
                        "display_name": event.get("display_name"),
                        "parsed": event.get("parsed", {}),
                        "raw": event.get("raw", ""),
                        "parse_status": event.get("parse_status"),
                        "latency_ms": event.get("latency_ms"),
                        "error": event.get("error"),
                    }
                    # Fire-and-forget DB update (snapshot copy to avoid mutation)
                    skills_snapshot = {k: dict(v) for k, v in accumulated_skills.items()}
                    asyncio.create_task(_update_analysis(analysis_id, {
                        "full_report": {"skills": skills_snapshot},
                    }))

            runner = CompanySkillRunner(model_config, company_data, on_progress=tracking_emit)
            result = await runner.run_pipeline()

            response_data = _build_response(req, company_data, model_config, result)

            # Final update: completed
            if analysis_id:
                response_data["analysis_id"] = analysis_id
                verdict = response_data.get("verdict", {})
                await _update_analysis(analysis_id, {
                    "status": "completed",
                    "full_report": response_data,
                    "verdict_action": verdict.get("action", "WATCH"),
                    "verdict_conviction": float(verdict.get("conviction", 0.5)),
                    "verdict_quality": verdict.get("quality_verdict", "GOOD"),
                    "total_latency_ms": response_data.get("total_latency_ms", 0),
                })

            queue.put_nowait({
                "type": "result",
                "data": response_data,
            })
        except Exception as e:
            logger.error(f"[company] stream error: {e}", exc_info=True)
            if analysis_id:
                await _update_analysis(analysis_id, {
                    "status": "error",
                    "error_message": str(e),
                })
            else:
                # No running record was created, save error as new record
                await _save_analysis(
                    user_id,
                    {"symbol": req.symbol, "company_name": req.symbol},
                    model_config,
                    error_msg=str(e),
                )
            queue.put_nowait({"type": "error", "message": str(e)})
        finally:
            queue.put_nowait(None)  # sentinel

    async def event_generator():
        task = asyncio.create_task(run_pipeline_task())
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"
        finally:
            # Do NOT cancel the task — let the pipeline continue running
            # so that intermediate gate results keep saving to DB.
            # The frontend will poll GET /analyses/{id} to pick up progress.
            if not task.done():
                logger.info("[company] SSE disconnected, pipeline continues in background")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Analysis CRUD endpoints
# ---------------------------------------------------------------------------

@router.get("/analyses")
async def list_analyses(
    symbol: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    """List analysis records for the current user."""
    user_id = user.get("user_id", "default")
    analyses, total = await CompanyAnalysisRepository.list_by_user(
        user_id, symbol=symbol, skip=skip, limit=limit,
    )
    return {"analyses": analyses, "total": total}


@router.get("/analyses/{analysis_id}")
async def get_analysis(
    analysis_id: str,
    user: dict = Depends(get_current_user),
):
    """Get full analysis detail including the complete report."""
    row = await CompanyAnalysisRepository.get_by_id(analysis_id)
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return row


@router.delete("/analyses/{analysis_id}")
async def delete_analysis(
    analysis_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete an analysis record."""
    ok = await CompanyAnalysisRepository.delete(analysis_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return {"status": "ok", "id": analysis_id}


@router.delete("/cache/{symbol}")
async def invalidate_cache(
    symbol: str,
    user: dict = Depends(get_current_user),
):
    """Invalidate cached company data for a symbol."""
    await invalidate_company_cache(symbol)
    return {"status": "ok", "symbol": symbol.upper(), "message": f"Cache invalidated for {symbol.upper()}"}
