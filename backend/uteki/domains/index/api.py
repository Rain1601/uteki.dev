"""指数投资智能体 — FastAPI 路由"""

import asyncio
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from uteki.common.database import db_manager
from uteki.domains.auth.deps import get_current_user_optional, get_current_user
from uteki.domains.index.schemas import (
    WatchlistAddRequest, BacktestRequest, BacktestCompareRequest,
    PromptUpdateRequest, MemoryWriteRequest, ToolTestRequest,
    ArenaRunRequest, DecisionAdoptRequest, DecisionApproveRequest,
    DecisionSkipRequest, DecisionRejectRequest,
    ScheduleCreateRequest, ScheduleUpdateRequest,
    AgentChatRequest, AgentConfigUpdateRequest,
    IndexResponse,
)
from uteki.domains.index.services.data_service import DataService, get_data_service
from uteki.domains.index.services.backtest_service import BacktestService, get_backtest_service
from uteki.domains.index.services.prompt_service import PromptService, get_prompt_service
from uteki.domains.index.services.memory_service import MemoryService, get_memory_service
from uteki.domains.index.services.decision_service import DecisionService, get_decision_service
from uteki.domains.index.services.arena_service import ArenaService, get_arena_service
from uteki.domains.index.services.score_service import ScoreService, get_score_service
from uteki.domains.index.services.scheduler_service import SchedulerService, get_scheduler_service
from uteki.domains.index.services.harness_builder import HarnessBuilder

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_db_session():
    async with db_manager.get_postgres_session() as session:
        yield session


def _get_user_id(user: Optional[dict]) -> str:
    return user["user_id"] if user else "default"


# ══════════════════════════════════════════
# Watchlist & Quotes
# ══════════════════════════════════════════

@router.get("/watchlist", summary="获取观察池")
async def get_watchlist(
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
):
    items = await data_service.get_watchlist(session)
    return {"success": True, "data": items}


@router.post("/watchlist", summary="添加标的到观察池")
async def add_to_watchlist(
    request: WatchlistAddRequest,
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
):
    item = await data_service.add_to_watchlist(
        request.symbol, session, name=request.name, etf_type=request.etf_type
    )
    return {"success": True, "data": item}


@router.delete("/watchlist/{symbol}", summary="从观察池移除")
async def remove_from_watchlist(
    symbol: str,
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
):
    removed = await data_service.remove_from_watchlist(symbol, session)
    if not removed:
        raise HTTPException(404, f"Symbol {symbol} not found in watchlist")
    return {"success": True, "message": f"{symbol} removed from watchlist"}


@router.put("/watchlist/{symbol}/notes", summary="更新标的备注")
async def update_watchlist_notes(
    symbol: str,
    request: dict,
    session: AsyncSession = Depends(get_db_session),
):
    from uteki.domains.index.models.watchlist import Watchlist
    query = select(Watchlist).where(
        and_(Watchlist.symbol == symbol.upper(), Watchlist.is_active == True)
    )
    result = await session.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, f"Symbol {symbol} not found in watchlist")
    item.notes = request.get("notes", "")
    await session.commit()
    return {"success": True, "data": item.to_dict()}


@router.get("/quotes/{symbol}", summary="获取实时报价")
async def get_quote(
    symbol: str,
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
):
    quote = await data_service.get_quote(symbol, session)
    return {"success": True, "data": quote}


@router.get("/history/{symbol}", summary="获取历史日线数据")
async def get_history(
    symbol: str,
    start: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
):
    data = await data_service.get_history(symbol, session, start=start, end=end)
    return {"success": True, "data": data, "count": len(data)}


@router.post("/data/refresh", summary="手动刷新所有观察池数据")
async def refresh_data(
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
):
    results = await data_service.update_all_watchlist(session)
    return {"success": True, "data": results}


@router.post("/data/sync", summary="检查并自动同步缺失数据")
async def sync_data(
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
):
    """
    检查所有观察池标的的数据新鲜度，自动补齐缺失数据。
    适合进入 Watchlist 页面时自动调用。
    返回每个 symbol 的同步状态。
    """
    from uteki.domains.index.models.watchlist import Watchlist
    from sqlalchemy import select, func
    from uteki.domains.index.models.index_price import IndexPrice
    from datetime import date, timedelta

    query = select(Watchlist).where(Watchlist.is_active == True)
    result = await session.execute(query)
    symbols = result.scalars().all()

    if not symbols:
        return {"success": True, "data": {"synced": [], "already_fresh": [], "failed": []}}

    today = date.today()
    synced = []
    already_fresh = []
    failed = []

    for w in symbols:
        try:
            # Check last available date
            q = select(func.max(IndexPrice.date)).where(IndexPrice.symbol == w.symbol)
            res = await session.execute(q)
            last_date = res.scalar_one_or_none()

            if not last_date:
                # No data at all — do initial load
                count = await data_service.initial_history_load(w.symbol, session)
                synced.append({"symbol": w.symbol, "action": "initial_load", "records": count})
                continue

            # Count missing trading days
            days_behind = 0
            check = last_date + timedelta(days=1)
            while check < today:
                if check.weekday() < 5:
                    days_behind += 1
                check += timedelta(days=1)

            if days_behind > 0:
                backfill = await data_service.smart_backfill(w.symbol, session)
                synced.append({"symbol": w.symbol, **backfill})
            else:
                already_fresh.append(w.symbol)
        except Exception as e:
            logger.error(f"Sync failed for {w.symbol}: {e}")
            failed.append({"symbol": w.symbol, "error": str(e)})

    return {
        "success": True,
        "data": {
            "synced": synced,
            "already_fresh": already_fresh,
            "failed": failed,
        },
    }


@router.post("/data/validate", summary="验证数据连续性")
async def validate_data(
    symbol: Optional[str] = Query(None, description="Symbol to validate, or all if omitted"),
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
):
    """检测缺失的交易日（排除周末），返回 missing_dates 数组"""
    if symbol:
        result = await data_service.validate_data_continuity(symbol, session)
        return {"success": True, "data": result}
    else:
        results = await data_service.validate_all_watchlist(session)
        return {"success": True, "data": results}


# ══════════════════════════════════════════
# Backtest
# ══════════════════════════════════════════

@router.post("/backtest", summary="单指数回测")
async def run_backtest(
    request: BacktestRequest,
    session: AsyncSession = Depends(get_db_session),
    backtest_service: BacktestService = Depends(get_backtest_service),
):
    result = await backtest_service.run(
        request.symbol, request.start, request.end,
        request.initial_capital, request.monthly_dca, session
    )
    if "error" in result:
        raise HTTPException(400, result["error"])
    return {"success": True, "data": result}


@router.post("/backtest/compare", summary="多指数对比回测")
async def compare_backtest(
    request: BacktestCompareRequest,
    session: AsyncSession = Depends(get_db_session),
    backtest_service: BacktestService = Depends(get_backtest_service),
):
    results = await backtest_service.compare(
        request.symbols, request.start, request.end,
        request.initial_capital, request.monthly_dca, session
    )
    return {"success": True, "data": results}


@router.post("/backtest/replay/{harness_id}", summary="决策重放")
async def replay_decision(
    harness_id: str,
    session: AsyncSession = Depends(get_db_session),
    backtest_service: BacktestService = Depends(get_backtest_service),
):
    result = await backtest_service.replay_decision(harness_id, session)
    if "error" in result:
        raise HTTPException(400, result["error"])
    return {"success": True, "data": result}


# ══════════════════════════════════════════
# Prompt (system / user)
# ══════════════════════════════════════════

@router.get("/prompt/current", summary="获取当前 Prompt")
async def get_current_prompt(
    prompt_type: str = Query("system", description="system / user"),
    session: AsyncSession = Depends(get_db_session),
    prompt_service: PromptService = Depends(get_prompt_service),
):
    prompt = await prompt_service.get_current(session, prompt_type=prompt_type)
    return {"success": True, "data": prompt}


@router.put("/prompt", summary="更新 Prompt（创建新版本）")
async def update_prompt(
    request: PromptUpdateRequest,
    prompt_type: str = Query("system", description="system / user"),
    session: AsyncSession = Depends(get_db_session),
    prompt_service: PromptService = Depends(get_prompt_service),
):
    version = await prompt_service.update_prompt(
        request.content, request.description, session, prompt_type=prompt_type
    )
    return {"success": True, "data": version}


@router.get("/prompt/history", summary="获取 Prompt 版本历史")
async def get_prompt_history(
    prompt_type: str = Query("system", description="system / user"),
    session: AsyncSession = Depends(get_db_session),
    prompt_service: PromptService = Depends(get_prompt_service),
):
    history = await prompt_service.get_history(session, prompt_type=prompt_type)
    return {"success": True, "data": history}


@router.put("/prompt/{version_id}/activate", summary="切换当前 Prompt 版本")
async def activate_prompt_version(
    version_id: str,
    session: AsyncSession = Depends(get_db_session),
    prompt_service: PromptService = Depends(get_prompt_service),
):
    try:
        version = await prompt_service.activate_version(version_id, session)
        return {"success": True, "data": version}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/prompt/{version_id}", summary="删除 Prompt 版本")
async def delete_prompt_version(
    version_id: str,
    session: AsyncSession = Depends(get_db_session),
    prompt_service: PromptService = Depends(get_prompt_service),
):
    try:
        await prompt_service.delete_version(version_id, session)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/prompt/preview", summary="预览 User Prompt 模板渲染结果")
async def preview_user_prompt(
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
    memory_service: MemoryService = Depends(get_memory_service),
    prompt_service: PromptService = Depends(get_prompt_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    builder = HarnessBuilder(data_service, memory_service, prompt_service)
    preview_data = await builder.build_preview_data(session, user_id=_get_user_id(user))
    rendered = await prompt_service.render_user_prompt(session, preview_data)
    variables = prompt_service._build_template_variables(preview_data)
    return {"success": True, "data": {"rendered": rendered, "variables": variables}}


# ══════════════════════════════════════════
# Memory
# ══════════════════════════════════════════

@router.get("/memory", summary="获取 Agent 记忆")
async def get_memory(
    category: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_db_session),
    memory_service: MemoryService = Depends(get_memory_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    memories = await memory_service.read(_get_user_id(user), session, category=category, limit=limit)
    return {"success": True, "data": memories}


@router.post("/memory", summary="写入 Agent 记忆")
async def write_memory(
    request: MemoryWriteRequest,
    session: AsyncSession = Depends(get_db_session),
    memory_service: MemoryService = Depends(get_memory_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    memory = await memory_service.write(
        _get_user_id(user), request.category, request.content, session,
        metadata=request.metadata
    )
    return {"success": True, "data": memory}


@router.delete("/memory/{memory_id}", summary="删除 Agent 记忆")
async def delete_memory(
    memory_id: str,
    session: AsyncSession = Depends(get_db_session),
    memory_service: MemoryService = Depends(get_memory_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    deleted = await memory_service.delete(memory_id, _get_user_id(user), session)
    if not deleted:
        raise HTTPException(404, "Memory not found")
    return {"success": True, "message": "Memory deleted"}


# ══════════════════════════════════════════
# Tools
# ══════════════════════════════════════════

@router.get("/tools", summary="获取所有工具定义")
async def get_tool_definitions():
    from uteki.domains.index.services.agent_skills import TOOL_DEFINITIONS
    return {"success": True, "data": TOOL_DEFINITIONS}


@router.post("/tools/{tool_name}/test", summary="测试运行工具")
async def test_tool(
    tool_name: str,
    request: ToolTestRequest,
    session: AsyncSession = Depends(get_db_session),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    from uteki.domains.index.services.agent_skills import TOOL_DEFINITIONS, ToolExecutor
    if tool_name not in TOOL_DEFINITIONS:
        raise HTTPException(404, f"Tool '{tool_name}' not found")

    executor = ToolExecutor(
        session=session,
        harness_data={},
        agent_key="shared",
        user_id=_get_user_id(user),
    )
    result = await executor.execute(tool_name, request.arguments)
    return {"success": True, "data": json.loads(result)}


# ══════════════════════════════════════════
# Account & Agent Config
# ══════════════════════════════════════════

@router.get("/account/summary", summary="获取账户概览（总资产/现金/持仓市值）")
async def get_account_summary(
    user: Optional[dict] = Depends(get_current_user_optional),
):
    """从 SNB 获取实时账户数据"""
    try:
        from uteki.domains.snb.api import _require_client
        client = _require_client()
        balance = await client.get_balance()
        positions = await client.get_positions()

        bal_data = balance.get("data", {}) if balance.get("success") else {}
        total = bal_data.get("total_value", 0) or 0
        cash = bal_data.get("cash", 0) or 0
        positions_value = total - cash

        return {"success": True, "data": {
            "total": total,
            "cash": cash,
            "positions_value": positions_value,
        }}
    except Exception as e:
        logger.warning(f"Failed to get account summary: {e}")
        return {"success": True, "data": {
            "total": 0, "cash": 0, "positions_value": 0,
            "error": str(e),
        }}


@router.get("/agent-config", summary="获取 Agent 配置")
async def get_agent_config(
    session: AsyncSession = Depends(get_db_session),
    memory_service: MemoryService = Depends(get_memory_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    """从 Memory 读取 agent_config 配置"""
    import json
    memories = await memory_service.read(
        _get_user_id(user), session, category="agent_config", limit=1, agent_key="system"
    )
    if memories:
        try:
            config = json.loads(memories[0].get("content", "{}"))
        except (json.JSONDecodeError, TypeError):
            config = {}
    else:
        config = {}
    return {"success": True, "data": config}


@router.put("/agent-config", summary="保存 Agent 配置")
async def save_agent_config(
    request: AgentConfigUpdateRequest,
    session: AsyncSession = Depends(get_db_session),
    memory_service: MemoryService = Depends(get_memory_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    """保存 agent_config 到 Memory（覆盖式）"""
    import json
    from sqlalchemy import select, and_
    from uteki.domains.index.models.agent_memory import AgentMemory

    user_id = _get_user_id(user)

    # 查找已有的 agent_config 记录
    query = select(AgentMemory).where(
        and_(
            AgentMemory.user_id == user_id,
            AgentMemory.category == "agent_config",
            AgentMemory.agent_key == "system",
        )
    ).limit(1)
    result = await session.execute(query)
    existing = result.scalar_one_or_none()

    config_json = json.dumps(request.config)

    if existing:
        existing.content = config_json
    else:
        mem = AgentMemory(
            user_id=user_id,
            category="agent_config",
            content=config_json,
            agent_key="system",
        )
        session.add(mem)

    await session.commit()
    return {"success": True, "data": request.config}


# ══════════════════════════════════════════
# Arena
# ══════════════════════════════════════════

@router.post("/arena/run", summary="手动触发 Arena 分析")
async def run_arena(
    request: ArenaRunRequest,
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
    memory_service: MemoryService = Depends(get_memory_service),
    prompt_service: PromptService = Depends(get_prompt_service),
    arena_service: ArenaService = Depends(get_arena_service),
    score_service: ScoreService = Depends(get_score_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    # 1. 构建 Harness
    builder = HarnessBuilder(data_service, memory_service, prompt_service)
    harness = await builder.build(
        harness_type=request.harness_type,
        session=session,
        user_id=_get_user_id(user),
        budget=request.budget,
        constraints=request.constraints,
    )

    # 2. 运行 Arena (3-phase pipeline: 决策 → 投票 → 计分)
    arena_result = await arena_service.run(harness["id"], session)

    # 3. 获取 prompt 版本号
    prompt_ver = await prompt_service.get_by_id(harness["prompt_version_id"], session)
    prompt_version_str = prompt_ver["version"] if prompt_ver else None

    return {
        "success": True,
        "data": {
            "harness_id": harness["id"],
            "harness_type": harness["harness_type"],
            "prompt_version_id": harness["prompt_version_id"],
            "prompt_version": prompt_version_str,
            "models": arena_result.get("model_ios", []),
            "votes": arena_result.get("votes", []),
            "final_decision": arena_result.get("final_decision"),
            "pipeline_phases": arena_result.get("pipeline_phases", {}),
        },
    }


@router.post("/arena/run/stream", summary="SSE 流式 Arena 分析")
async def run_arena_stream(
    request: ArenaRunRequest,
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
    memory_service: MemoryService = Depends(get_memory_service),
    prompt_service: PromptService = Depends(get_prompt_service),
    arena_service: ArenaService = Depends(get_arena_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    # 1. 构建 Harness
    builder = HarnessBuilder(data_service, memory_service, prompt_service)
    harness = await builder.build(
        harness_type=request.harness_type,
        session=session,
        user_id=_get_user_id(user),
        budget=request.budget,
        constraints=request.constraints,
    )

    prompt_ver = await prompt_service.get_by_id(harness["prompt_version_id"], session)
    prompt_version_str = prompt_ver["version"] if prompt_ver else None

    queue: asyncio.Queue = asyncio.Queue()

    def emit_progress(event: dict):
        queue.put_nowait(event)

    async def run_arena_task():
        try:
            model_filter = [m.model_dump() for m in request.models] if request.models else None
            result = await arena_service.run(
                harness["id"], session, on_progress=emit_progress,
                model_filter=model_filter,
            )
            queue.put_nowait({
                "type": "result",
                "data": {
                    "harness_id": harness["id"],
                    "harness_type": harness["harness_type"],
                    "prompt_version_id": harness["prompt_version_id"],
                    "prompt_version": prompt_version_str,
                    "models": result.get("model_ios", []),
                    "votes": result.get("votes", []),
                    "final_decision": result.get("final_decision"),
                    "pipeline_phases": result.get("pipeline_phases", {}),
                },
            })
        except Exception as e:
            logger.error(f"Arena stream error: {e}")
            queue.put_nowait({"type": "error", "message": str(e)})
        finally:
            queue.put_nowait(None)  # sentinel

    async def event_generator():
        task = asyncio.create_task(run_arena_task())
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/arena/timeline", summary="获取 Arena 时间线图表数据")
async def get_arena_timeline(
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_db_session),
    arena_service: ArenaService = Depends(get_arena_service),
):
    timeline = await arena_service.get_arena_timeline(session, limit=limit)
    return {"success": True, "data": timeline}


@router.get("/arena/backtest", summary="运行单 Agent 独立回测")
async def run_agent_backtest(
    agent_key: str = Query(..., description="Agent key, e.g. anthropic:claude-sonnet-4-20250514"),
    start_date: str = Query(..., description="Start date, e.g. 2025-01-01"),
    end_date: str = Query(..., description="End date, e.g. 2025-12-31"),
    frequency: str = Query("monthly", description="weekly / biweekly / monthly"),
    session: AsyncSession = Depends(get_db_session),
):
    from datetime import date as date_type
    from uteki.domains.index.services.agent_backtest_service import get_agent_backtest_service
    backtest_service = get_agent_backtest_service()
    result = await backtest_service.run_backtest(
        agent_key=agent_key,
        start_date=date_type.fromisoformat(start_date),
        end_date=date_type.fromisoformat(end_date),
        frequency=frequency,
        session=session,
    )
    return {"success": True, "data": result}


@router.get("/arena/history", summary="获取 Arena 运行历史")
async def get_arena_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db_session),
    arena_service: ArenaService = Depends(get_arena_service),
):
    history = await arena_service.get_arena_history(session, limit=limit, offset=offset)
    return {"success": True, "data": history}


@router.get("/arena/{harness_id}", summary="获取 Arena 结果")
async def get_arena_results(
    harness_id: str,
    session: AsyncSession = Depends(get_db_session),
    arena_service: ArenaService = Depends(get_arena_service),
):
    results = await arena_service.get_arena_results(harness_id, session)
    return {"success": True, "data": results}


@router.get("/arena/{harness_id}/votes", summary="获取 Arena 投票详情")
async def get_arena_votes(
    harness_id: str,
    session: AsyncSession = Depends(get_db_session),
    arena_service: ArenaService = Depends(get_arena_service),
):
    votes = await arena_service.get_votes_for_harness(harness_id, session)
    return {"success": True, "data": votes}


@router.get("/arena/{harness_id}/model/{model_io_id}", summary="获取模型完整 I/O")
async def get_model_io_detail(
    harness_id: str,
    model_io_id: str,
    session: AsyncSession = Depends(get_db_session),
    arena_service: ArenaService = Depends(get_arena_service),
):
    detail = await arena_service.get_model_io_detail(model_io_id, session)
    if not detail:
        raise HTTPException(404, "Model I/O not found")
    return {"success": True, "data": detail}


# ══════════════════════════════════════════
# Decisions
# ══════════════════════════════════════════

@router.get("/decisions", summary="获取决策时间线")
async def get_decisions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_action: Optional[str] = Query(None),
    harness_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_db_session),
    decision_service: DecisionService = Depends(get_decision_service),
):
    timeline = await decision_service.get_timeline(
        session, limit=limit, offset=offset,
        user_action=user_action, harness_type=harness_type,
        start_date=start_date, end_date=end_date,
    )
    return {"success": True, "data": timeline}


@router.get("/decisions/{decision_id}", summary="获取决策详情")
async def get_decision_detail(
    decision_id: str,
    session: AsyncSession = Depends(get_db_session),
    decision_service: DecisionService = Depends(get_decision_service),
):
    detail = await decision_service.get_by_id(decision_id, session)
    if not detail:
        raise HTTPException(404, "Decision not found")
    return {"success": True, "data": detail}


@router.post("/decisions/{harness_id}/approve", summary="批准决策（需 TOTP）")
async def approve_decision(
    harness_id: str,
    request: DecisionApproveRequest,
    session: AsyncSession = Depends(get_db_session),
    decision_service: DecisionService = Depends(get_decision_service),
    score_service: ScoreService = Depends(get_score_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    # TOTP 验证
    from uteki.domains.snb.services.totp_service import get_totp_service
    totp_service = get_totp_service()
    user_id = _get_user_id(user)

    if user:
        valid = await totp_service.verify_totp(session, user_id, request.totp_code)
    else:
        from uteki.common.config import settings as app_settings
        import pyotp
        if not app_settings.snb_totp_secret:
            raise HTTPException(403, "TOTP not configured")
        totp = pyotp.TOTP(app_settings.snb_totp_secret)
        valid = totp.verify(request.totp_code, valid_window=1)

    if not valid:
        raise HTTPException(403, "Invalid TOTP code")

    # 执行实际下单 (SNB place_order)
    execution_results = []
    allocations = request.allocations or []

    if allocations:
        # 检查持仓限制（最多 3 个 ETF）
        try:
            from uteki.domains.snb.api import _require_client
            client = _require_client()
            positions = await client.get_positions()
            current_symbols = {p.get("symbol") for p in (positions or [])}
            new_symbols = {a.get("etf", a.get("symbol", "")) for a in allocations}
            combined = current_symbols | new_symbols
            if len(combined) > 3:
                raise HTTPException(400, f"Position limit exceeded: max 3 ETFs, would have {len(combined)}")

            # 执行每个 allocation 的下单
            for alloc in allocations:
                etf = alloc.get("etf", alloc.get("symbol", ""))
                amount = alloc.get("amount", 0)
                if not etf or amount <= 0:
                    continue

                try:
                    order_result = await client.place_order(
                        symbol=etf, side="BUY", quantity=int(amount),
                        order_type="MKT",
                    )
                    execution_results.append({
                        "symbol": etf,
                        "amount": amount,
                        "status": "submitted",
                        "order": order_result,
                    })
                except Exception as order_err:
                    execution_results.append({
                        "symbol": etf,
                        "amount": amount,
                        "status": "error",
                        "error": str(order_err),
                    })
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"SNB order execution skipped: {e}")
            execution_results.append({"status": "skipped", "reason": str(e)})

    log = await decision_service.create_log(
        harness_id=harness_id,
        user_action="approved",
        session=session,
        executed_allocations=allocations,
        execution_results=execution_results,
        user_notes=request.notes,
    )
    return {"success": True, "data": log}


@router.post("/decisions/{harness_id}/skip", summary="跳过决策")
async def skip_decision(
    harness_id: str,
    request: DecisionSkipRequest,
    session: AsyncSession = Depends(get_db_session),
    decision_service: DecisionService = Depends(get_decision_service),
):
    log = await decision_service.create_log(
        harness_id=harness_id,
        user_action="skipped",
        session=session,
        user_notes=request.notes,
    )
    return {"success": True, "data": log}


@router.post("/decisions/{harness_id}/reject", summary="拒绝决策")
async def reject_decision(
    harness_id: str,
    request: DecisionRejectRequest,
    session: AsyncSession = Depends(get_db_session),
    decision_service: DecisionService = Depends(get_decision_service),
):
    log = await decision_service.create_log(
        harness_id=harness_id,
        user_action="rejected",
        session=session,
        user_notes=request.notes,
    )
    return {"success": True, "data": log}


@router.get("/decisions/{decision_id}/counterfactuals", summary="获取反事实数据")
async def get_counterfactuals(
    decision_id: str,
    session: AsyncSession = Depends(get_db_session),
    decision_service: DecisionService = Depends(get_decision_service),
):
    data = await decision_service.get_counterfactuals(decision_id, session)
    return {"success": True, "data": data}


# ══════════════════════════════════════════
# Leaderboard
# ══════════════════════════════════════════

@router.get("/leaderboard", summary="获取模型排行榜")
async def get_leaderboard(
    prompt_version_id: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_db_session),
    score_service: ScoreService = Depends(get_score_service),
):
    leaderboard = await score_service.get_leaderboard(session, prompt_version_id=prompt_version_id)
    return {"success": True, "data": leaderboard}


# ══════════════════════════════════════════
# Schedules
# ══════════════════════════════════════════

@router.get("/schedules", summary="获取调度任务列表")
async def get_schedules(
    session: AsyncSession = Depends(get_db_session),
    scheduler_service: SchedulerService = Depends(get_scheduler_service),
):
    tasks = await scheduler_service.list_tasks(session)
    return {"success": True, "data": tasks}


@router.post("/schedules", summary="创建调度任务")
async def create_schedule(
    request: ScheduleCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    scheduler_service: SchedulerService = Depends(get_scheduler_service),
):
    task = await scheduler_service.create_task(
        request.name, request.cron_expression, request.task_type,
        session, config=request.config
    )
    return {"success": True, "data": task}


@router.put("/schedules/{task_id}", summary="更新调度任务")
async def update_schedule(
    task_id: str,
    request: ScheduleUpdateRequest,
    session: AsyncSession = Depends(get_db_session),
    scheduler_service: SchedulerService = Depends(get_scheduler_service),
):
    task = await scheduler_service.update_task(
        task_id, session,
        cron_expression=request.cron_expression,
        is_enabled=request.is_enabled,
        config=request.config,
    )
    if not task:
        raise HTTPException(404, "Schedule task not found")
    return {"success": True, "data": task}


@router.delete("/schedules/{task_id}", summary="删除调度任务")
async def delete_schedule(
    task_id: str,
    session: AsyncSession = Depends(get_db_session),
    scheduler_service: SchedulerService = Depends(get_scheduler_service),
):
    deleted = await scheduler_service.delete_task(task_id, session)
    if not deleted:
        raise HTTPException(404, "Schedule task not found")
    return {"success": True, "message": "Schedule task deleted"}


@router.post("/schedules/{task_id}/trigger", summary="手动触发调度任务")
async def trigger_schedule(
    task_id: str,
    session: AsyncSession = Depends(get_db_session),
    scheduler_service: SchedulerService = Depends(get_scheduler_service),
    data_service: DataService = Depends(get_data_service),
    memory_service: MemoryService = Depends(get_memory_service),
    prompt_service: PromptService = Depends(get_prompt_service),
    arena_service: ArenaService = Depends(get_arena_service),
    score_service: ScoreService = Depends(get_score_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    task_data = await scheduler_service.get_task(task_id, session)
    if not task_data:
        raise HTTPException(404, "Schedule task not found")

    config = task_data.get("config", {}) or {}

    if task_data["task_type"] == "arena_analysis":
        # 构建 Harness → 运行 Arena
        builder = HarnessBuilder(data_service, memory_service, prompt_service)
        harness = await builder.build(
            harness_type=config.get("harness_type", "monthly_dca"),
            session=session,
            user_id=_get_user_id(user),
            budget=config.get("budget"),
        )
        arena_result = await arena_service.run(harness["id"], session)

        await scheduler_service.update_run_status(task_id, "pending_user_action", session)
        return {
            "success": True,
            "data": {
                "harness_id": harness["id"],
                "models": arena_result.get("model_ios", []),
                "votes": arena_result.get("votes", []),
                "final_decision": arena_result.get("final_decision"),
                "pipeline_phases": arena_result.get("pipeline_phases", {}),
            },
        }

    elif task_data["task_type"] == "reflection":
        from uteki.domains.index.services.reflection_service import ReflectionService
        reflection_svc = ReflectionService(
            get_decision_service(), get_memory_service()
        )
        result = await reflection_svc.generate_reflection(
            _get_user_id(user), session,
            lookback_days=config.get("lookback_days", 30),
        )
        status = "success" if result.get("status") == "completed" else "skipped"
        await scheduler_service.update_run_status(task_id, status, session)
        return {"success": True, "data": result}

    elif task_data["task_type"] == "counterfactual":
        decision_svc = get_decision_service()
        results = {}
        for days in [7, 30, 90]:
            r = await decision_svc.run_counterfactual_batch(session, tracking_days=days)
            results[f"{days}d"] = r
        await scheduler_service.update_run_status(task_id, "success", session)
        return {"success": True, "data": results}

    elif task_data["task_type"] == "price_update":
        # 使用健壮更新：带重试、智能回填、异常检测
        results = await data_service.robust_update_all(
            session,
            validate=config.get("validate_after_update", True),
            backfill=config.get("enable_backfill", True),
        )

        # 判断任务状态
        has_failures = len(results["failed"]) > 0
        has_anomalies = len(results["anomalies"]) > 0

        if has_failures:
            status = "partial_failure"
            logger.warning(f"Price update partial failure: {results['failed']}")
        elif has_anomalies:
            status = "success_with_warnings"
            logger.warning(f"Price update completed with {len(results['anomalies'])} anomalies")
        else:
            status = "success"

        await scheduler_service.update_run_status(task_id, status, session)

        return {
            "success": not has_failures,
            "data": {
                "status": status,
                "success_count": len(results["success"]),
                "failed": results["failed"],
                "backfilled": results["backfilled"],
                "anomalies": results["anomalies"],
                "total_records": results["total_records"],
            },
        }

    raise HTTPException(400, f"Unknown task type: {task_data['task_type']}")


# ══════════════════════════════════════════
# Agent Chat
# ══════════════════════════════════════════

@router.post("/agent/chat", summary="Agent 对话")
async def agent_chat(
    request: AgentChatRequest,
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
    backtest_service: BacktestService = Depends(get_backtest_service),
    prompt_service: PromptService = Depends(get_prompt_service),
    memory_service: MemoryService = Depends(get_memory_service),
    decision_service: DecisionService = Depends(get_decision_service),
    user: Optional[dict] = Depends(get_current_user_optional),
):
    from uteki.domains.index.services.agent_service import AgentService
    agent = AgentService(prompt_service, memory_service, data_service, backtest_service, decision_service)
    result = await agent.chat(_get_user_id(user), request.message, session)
    return {"success": True, "data": result}


@router.post("/decisions/{harness_id}/adopt", summary="采纳模型建议")
async def adopt_model(
    harness_id: str,
    request: DecisionAdoptRequest,
    session: AsyncSession = Depends(get_db_session),
    arena_service: ArenaService = Depends(get_arena_service),
    score_service: ScoreService = Depends(get_score_service),
):
    from uteki.domains.index.services.agent_service import AgentService
    from uteki.domains.index.models.decision_harness import DecisionHarness
    from sqlalchemy import select

    # 获取模型 I/O 详情
    mio = await arena_service.get_model_io_detail(request.model_io_id, session)
    if not mio:
        raise HTTPException(404, "Model I/O not found")

    # 获取 Harness
    harness_q = select(DecisionHarness).where(DecisionHarness.id == harness_id)
    harness_r = await session.execute(harness_q)
    harness = harness_r.scalar_one_or_none()
    if not harness:
        raise HTTPException(404, "Harness not found")

    # 生成决策卡片
    agent = AgentService(None, None, None, None, None)
    card = agent.generate_decision_card(mio, harness.to_dict())

    # 更新评分
    await score_service.update_on_adoption(
        mio["model_provider"], mio["model_name"],
        harness.prompt_version_id, session
    )

    return {"success": True, "data": card}


# ══════════════════════════════════════════
# Debug
# ══════════════════════════════════════════

@router.post("/debug/create-tables", summary="创建 Index 域数据库表")
async def create_index_tables():
    """使用 SQLAlchemy metadata.create_all 创建所有 index 域表（兼容 SQLite 和 PostgreSQL）"""
    from sqlalchemy import text
    from uteki.common.base import Base
    # 确保所有 index 模型已注册到 Base.metadata
    from uteki.domains.index.models import (  # noqa: F401
        Watchlist, IndexPrice, PromptVersion, AgentMemory,
        DecisionHarness, ModelIO, DecisionLog, Counterfactual,
        ModelScore, ScheduleTask,
    )

    try:
        from uteki.common.config import settings as app_settings
        migrations_applied = []
        async with db_manager.postgres_engine.begin() as conn:
            # PostgreSQL 需要先创建 schema
            if app_settings.database_type != "sqlite":
                await conn.execute(text("CREATE SCHEMA IF NOT EXISTS index"))

            await conn.run_sync(Base.metadata.create_all)

            # 增量迁移：为已存在的表添加新列
            column_migrations = [
                ("index", "watchlist", "notes", "TEXT"),
                ("index", "model_io", "pipeline_steps", "JSONB"),
                ("index", "prompt_version", "prompt_type", "VARCHAR(20) DEFAULT 'system'"),
            ]
            for schema, table, column, col_type in column_migrations:
                try:
                    if app_settings.database_type == "sqlite":
                        await conn.execute(text(
                            f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
                        ))
                    else:
                        await conn.execute(text(
                            f'ALTER TABLE "{schema}".{table} ADD COLUMN IF NOT EXISTS {column} {col_type}'
                        ))
                    migrations_applied.append(f"{schema}.{table}.{column}")
                except Exception:
                    pass  # Column already exists or other non-critical error

        return {"status": "completed", "message": "Index tables created successfully", "migrations": migrations_applied}
    except Exception as e:
        logger.error(f"Failed to create index tables: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/debug/seed", summary="预设默认数据（观察池 + 调度）")
async def seed_defaults(
    session: AsyncSession = Depends(get_db_session),
    data_service: DataService = Depends(get_data_service),
    scheduler_service: SchedulerService = Depends(get_scheduler_service),
    prompt_service: PromptService = Depends(get_prompt_service),
):
    watchlist_count = await data_service.seed_default_watchlist(session)
    schedule_count = await scheduler_service.seed_defaults(session)
    prompt = await prompt_service.get_current(session)  # auto-creates v1.0

    return {
        "success": True,
        "data": {
            "watchlist_seeded": watchlist_count,
            "schedules_seeded": schedule_count,
            "prompt_version": prompt["version"] if prompt else None,
        },
    }
