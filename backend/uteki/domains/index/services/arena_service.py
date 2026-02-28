"""多模型 Arena 调度服务 — 3 阶段 Pipeline (决策 → 投票 → 计分)

Supabase REST API 版
"""

import asyncio
import json
import logging
import re
import string
import time
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Callable
from uuid import uuid4

from sqlalchemy import select, func

from uteki.common.config import settings
from uteki.common.database import SupabaseRepository, db_manager
from uteki.domains.index.models.model_io import ModelIO
from uteki.domains.index.models.decision_harness import DecisionHarness
from uteki.domains.index.models.decision_log import DecisionLog
from uteki.domains.index.models.arena_vote import ArenaVote
from uteki.domains.index.models.model_score import ModelScore
from uteki.domains.index.models.prompt_version import PromptVersion

logger = logging.getLogger(__name__)

# 模型超时 60s
MODEL_TIMEOUT = 60

# 模型配置
ARENA_MODELS = [
    {"provider": "anthropic", "model": "claude-sonnet-4-20250514", "api_key_attr": "anthropic_api_key"},
    {"provider": "openai", "model": "gpt-4o", "api_key_attr": "openai_api_key"},
    {"provider": "deepseek", "model": "deepseek-chat", "api_key_attr": "deepseek_api_key"},
    {"provider": "google", "model": "gemini-2.5-pro-thinking", "api_key_attr": "google_api_key"},
    {"provider": "qwen", "model": "qwen-plus", "api_key_attr": "dashscope_api_key"},
    {"provider": "minimax", "model": "MiniMax-Text-01", "api_key_attr": "minimax_api_key"},
    {"provider": "doubao", "model": "doubao-seed-2-0-pro-260215", "api_key_attr": "doubao_api_key"},
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_id(data: dict) -> dict:
    """Ensure dict has id + timestamps for a new row."""
    if "id" not in data:
        data["id"] = str(uuid4())
    data.setdefault("created_at", _now_iso())
    data.setdefault("updated_at", _now_iso())
    return data


async def _backup_rows(table: str, rows: list, model_class=None):
    """Best-effort SQLite backup (failure only warns)."""
    try:
        async with db_manager.get_postgres_session() as session:
            for row in rows:
                if model_class:
                    safe = {k: v for k, v in row.items() if hasattr(model_class, k)}
                    await session.merge(model_class(**safe))
    except Exception as e:
        logger.warning(f"SQLite backup failed for {table}: {e}")


def load_models_from_db() -> List[Dict[str, Any]]:
    """从 admin 配置加载模型列表，fallback 到 agent_memory。

    优先级：admin.llm_providers (解密) → agent_memory (legacy) → 空列表
    Shared by Arena, Agent Chat, Reflection, Backtest services.
    """
    # Priority 1: Admin LLM Providers (encrypted, via Supabase)
    try:
        from uteki.domains.admin.service import get_llm_provider_service, get_encryption_service
        import asyncio

        llm_svc = get_llm_provider_service()
        enc = get_encryption_service()

        # Run async method synchronously (called from sync context)
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're inside an async context, use a thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                models = pool.submit(
                    lambda: asyncio.run(llm_svc.get_active_models_for_runtime(encryption_service=enc))
                ).result(timeout=10)
        else:
            models = asyncio.run(llm_svc.get_active_models_for_runtime(encryption_service=enc))

        if models:
            logger.info(f"Loaded {len(models)} models from admin config")
            return models
    except Exception as e:
        logger.warning(f"Failed to load models from admin config: {e}")

    # Priority 2: Legacy agent_memory (for backward compat)
    try:
        repo = SupabaseRepository("agent_memory")
        row = repo.select_one(eq={"category": "model_config", "agent_key": "system"})
        if row:
            models = json.loads(row.get("content") or "[]")
            result = [m for m in models if m.get("enabled", True) and m.get("api_key")]
            if result:
                logger.info(f"Loaded {len(result)} models from agent_memory (legacy)")
                return result
    except Exception as e:
        logger.warning(f"Failed to load models from agent_memory: {e}")

    return []


class ArenaService:
    """多模型 Arena — 3 阶段 Pipeline

    Phase 1: 所有 Agent 通过 Skill Pipeline 独立决策
    Phase 2: 跨 Agent 匿名投票
    Phase 3: 计分 + 自动采纳 winner
    """

    async def run(
        self,
        harness_id: str,
        tool_definitions: Optional[List[Dict]] = None,
        on_progress: Optional[Callable] = None,
        model_filter: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """运行 Arena 3-phase pipeline（支持中断恢复）

        Args:
            model_filter: Optional list of {"provider": ..., "model": ...} to restrict which models run.
        """
        pipeline_start = time.time()
        phase_timings: Dict[str, int] = {}

        # Load models: DB config preferred, fallback to hardcoded ARENA_MODELS
        db_models = load_models_from_db()
        if db_models:
            # DB models already have api_key directly
            base_models = db_models
            logger.info(f"Arena using {len(base_models)} models from DB config")
        else:
            # Fallback to hardcoded ARENA_MODELS + env keys
            base_models = ARENA_MODELS
            logger.info("Arena using hardcoded ARENA_MODELS (no DB config)")

        # Determine which models to run
        if model_filter:
            filter_keys = {(m["provider"], m["model"]) for m in model_filter}
            active_models = [m for m in base_models if (m["provider"], m["model"]) in filter_keys]
            if not active_models:
                active_models = base_models
        else:
            active_models = base_models

        # 获取 Harness
        harness_repo = SupabaseRepository("decision_harness")
        harness = harness_repo.select_one(eq={"id": harness_id})
        if not harness:
            raise ValueError(f"Harness not found: {harness_id}")

        # 获取 prompt 版本
        prompt_repo = SupabaseRepository("prompt_version")
        prompt_version = prompt_repo.select_one(eq={"id": harness.get("prompt_version_id")})
        system_prompt = prompt_version.get("content", "") if prompt_version else ""

        # 构建用户 prompt（从 DB 读取 user prompt 模板渲染，fallback 到硬编码）
        try:
            from uteki.domains.index.services.prompt_service import get_prompt_service
            prompt_service = get_prompt_service()
            user_prompt = await prompt_service.render_user_prompt(harness)
        except Exception as e:
            logger.warning(f"Failed to render user prompt from template, falling back: {e}")
            user_prompt = self._serialize_harness(harness)

        # 检查 pipeline_state 实现中断恢复
        pipeline_state = harness.get("pipeline_state") or {}

        # ── Phase 1: 决策 ──
        if not pipeline_state.get("phase1_done"):
            phase1_start = time.time()
            if on_progress:
                on_progress({"type": "phase_start", "phase": "decide", "total_models": len(active_models)})
            model_ios = await self._run_phase1_decisions(
                harness_id=harness_id,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                harness_data=harness,
                tool_definitions=tool_definitions,
                on_progress=on_progress,
                model_list=active_models,
            )
            phase_timings["phase1_ms"] = int((time.time() - phase1_start) * 1000)
            self._update_pipeline_state(harness_id, "phase1_done", True)
        else:
            # Phase 1 已完成，从 DB 读取 model_ios
            model_ios = self.get_arena_results(harness_id)
            logger.info(f"Phase 1 already done for {harness_id}, loaded {len(model_ios)} results")

        # 筛选成功的 model_io
        successful_ios = [m for m in model_ios if m.get("status") == "success"]

        # ── Phase 2: 投票 ──
        votes: List[Dict[str, Any]] = []
        if not pipeline_state.get("phase2_done"):
            phase2_start = time.time()
            if on_progress:
                on_progress({"type": "phase_start", "phase": "vote", "total_models": len(successful_ios)})
            if len(successful_ios) >= 2:
                votes = await self._run_phase2_voting(
                    harness_id=harness_id,
                    successful_ios=successful_ios,
                )
            else:
                logger.info(f"Skipping voting: only {len(successful_ios)} successful models")
            phase_timings["phase2_ms"] = int((time.time() - phase2_start) * 1000)
            self._update_pipeline_state(harness_id, "phase2_done", True)
        else:
            # Load existing votes
            votes = self._get_votes_for_harness(harness_id)
            logger.info(f"Phase 2 already done for {harness_id}, loaded {len(votes)} votes")

        # ── Phase 3: 计分 + 采纳 ──
        final_decision: Optional[Dict[str, Any]] = None
        if not pipeline_state.get("phase3_done"):
            phase3_start = time.time()
            if on_progress:
                on_progress({"type": "phase_start", "phase": "tally", "total_models": len(successful_ios)})
            final_decision = await self._run_phase3_tally(
                harness_id=harness_id,
                harness=harness,
                votes=votes,
                successful_ios=successful_ios,
            )
            phase_timings["phase3_ms"] = int((time.time() - phase3_start) * 1000)
            self._update_pipeline_state(harness_id, "phase3_done", True)

        phase_timings["total_ms"] = int((time.time() - pipeline_start) * 1000)

        return {
            "harness_id": harness_id,
            "model_ios": model_ios,
            "votes": votes,
            "final_decision": final_decision,
            "pipeline_phases": phase_timings,
        }

    # ================================================================
    # Phase 1: Agent Decisions (Skill Pipeline + Single-shot Fallback)
    # ================================================================

    async def _run_phase1_decisions(
        self,
        harness_id: str,
        system_prompt: str,
        user_prompt: str,
        harness_data: Dict[str, Any],
        tool_definitions: Optional[List[Dict]] = None,
        on_progress: Optional[Callable] = None,
        model_list: Optional[List[Dict]] = None,
    ) -> List[Dict[str, Any]]:
        """Phase 1: 所有 Agent 并行执行 Skill Pipeline 决策"""
        available_models = []
        for m in (model_list or ARENA_MODELS):
            if "api_key" in m and m["api_key"]:
                # DB config: api_key is directly in the model dict
                available_models.append(m)
            elif "api_key_attr" in m:
                # Fallback config: resolve api_key from env settings
                api_key = getattr(settings, m["api_key_attr"], None)
                if api_key:
                    available_models.append({**m, "api_key": api_key})

        if not available_models:
            logger.error("No models configured with API keys for Arena")
            return []

        tasks = [
            self._call_model_with_pipeline(
                model_config=m,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                harness_id=harness_id,
                harness_data=harness_data,
                tool_definitions=tool_definitions,
                on_progress=on_progress,
            )
            for m in available_models
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        model_ios = []
        for r in results:
            if isinstance(r, Exception):
                logger.error(f"Arena model error: {r}")
            elif r:
                model_ios.append(r)

        return model_ios

    async def _call_model_with_pipeline(
        self,
        model_config: Dict[str, Any],
        system_prompt: str,
        user_prompt: str,
        harness_id: str,
        harness_data: Dict[str, Any],
        tool_definitions: Optional[List[Dict]] = None,
        on_progress: Optional[Callable] = None,
    ) -> Optional[Dict[str, Any]]:
        """调用单个模型: 先尝试 Skill Pipeline，失败则降级为 single-shot"""
        provider_name = model_config["provider"]
        model_name = model_config["model"]
        agent_key = f"{provider_name}:{model_name}"

        if on_progress:
            on_progress({"type": "model_start", "model": agent_key, "phase": "decide"})

        model_start = time.time()

        # 尝试 Skill Pipeline
        try:
            from uteki.domains.index.services.agent_skills import AgentSkillRunner

            runner = AgentSkillRunner(
                model_config=model_config,
                harness_data=harness_data,
                agent_key=agent_key,
            )

            pipeline_result = await runner.run_pipeline(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                on_progress=on_progress,
            )

            if pipeline_result["status"] == "pipeline_success":
                result = await self._save_pipeline_result(
                    harness_id=harness_id,
                    model_config=model_config,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    pipeline_result=pipeline_result,
                )
                if on_progress:
                    on_progress({
                        "type": "model_complete",
                        "model": agent_key,
                        "status": "success",
                        "parse_status": result.get("parse_status", "unknown"),
                        "latency_ms": int((time.time() - model_start) * 1000),
                    })
                return result
            else:
                logger.warning(
                    f"Pipeline partial for {agent_key}, falling back to single-shot"
                )
        except Exception as e:
            logger.warning(
                f"Pipeline failed for {agent_key}: {e}, falling back to single-shot"
            )

        # Single-shot fallback
        result = await self._call_model_single_shot(
            model_config=model_config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            harness_id=harness_id,
        )
        if on_progress and result:
            on_progress({
                "type": "model_complete",
                "model": agent_key,
                "status": result.get("status", "unknown"),
                "parse_status": result.get("parse_status", "unknown"),
                "latency_ms": int((time.time() - model_start) * 1000),
            })
        return result

    async def _save_pipeline_result(
        self,
        harness_id: str,
        model_config: Dict[str, Any],
        system_prompt: str,
        user_prompt: str,
        pipeline_result: Dict[str, Any],
    ) -> Dict[str, Any]:
        """将 pipeline 结果保存为 ModelIO"""
        provider_name = model_config["provider"]
        model_name = model_config["model"]
        full_input = f"[System Prompt]\n{system_prompt}\n\n[Decision Harness]\n{user_prompt}"
        output_raw = pipeline_result["output_raw"]
        latency_ms = pipeline_result["latency_ms"]

        output_structured = self._parse_structured_output(output_raw)
        parse_status = output_structured.pop("_parse_status", "raw_only")

        # 处理 pipeline_steps: 截断 output 为 summary（前 500 字符）
        raw_steps = pipeline_result.get("pipeline_steps", [])
        stored_steps = []
        for step in raw_steps:
            stored_step = {
                "skill": step.get("skill"),
                "latency_ms": step.get("latency_ms"),
                "status": "error" if step.get("error") else "success",
            }
            if step.get("output"):
                stored_step["output_summary"] = step["output"][:500]
            if step.get("error"):
                stored_step["error"] = str(step["error"])[:200]
            stored_steps.append(stored_step)

        input_tokens = len(full_input) // 4
        output_tokens = len(output_raw) // 4
        cost = self._estimate_cost(provider_name, model_name, input_tokens, output_tokens)
        # Pipeline has ~4 skill calls, rough cost multiplier
        cost *= 4

        repo = SupabaseRepository("model_io")
        data = _ensure_id({
            "harness_id": harness_id,
            "model_provider": provider_name,
            "model_name": model_name,
            "input_prompt": full_input,
            "input_token_count": input_tokens,
            "output_raw": output_raw,
            "output_structured": output_structured if parse_status != "raw_only" else None,
            "tool_calls": pipeline_result.get("tool_calls"),
            "output_token_count": output_tokens,
            "latency_ms": latency_ms,
            "cost_usd": cost,
            "parse_status": parse_status,
            "status": "success",
            "pipeline_steps": stored_steps if stored_steps else None,
        })
        result = repo.insert(data)
        row = result.data[0] if result.data else data
        await _backup_rows("model_io", [row], ModelIO)

        logger.info(f"Pipeline result saved: {provider_name}/{model_name} {latency_ms}ms")
        return row

    async def _call_model_single_shot(
        self,
        model_config: Dict[str, Any],
        system_prompt: str,
        user_prompt: str,
        harness_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Single-shot fallback (original _call_model logic)"""
        from uteki.domains.agent.llm_adapter import (
            LLMAdapterFactory, LLMProvider, LLMConfig, LLMMessage
        )

        provider_name = model_config["provider"]
        model_name = model_config["model"]
        api_key = model_config["api_key"]
        full_input = f"[System Prompt]\n{system_prompt}\n\n[Decision Harness]\n{user_prompt}"

        repo = SupabaseRepository("model_io")
        start_time = time.time()
        try:
            provider_map = {
                "anthropic": LLMProvider.ANTHROPIC,
                "openai": LLMProvider.OPENAI,
                "deepseek": LLMProvider.DEEPSEEK,
                "google": LLMProvider.GOOGLE,
                "qwen": LLMProvider.QWEN,
                "minimax": LLMProvider.MINIMAX,
                "doubao": LLMProvider.DOUBAO,
            }
            provider = provider_map.get(provider_name)
            if not provider:
                raise ValueError(f"Unknown provider: {provider_name}")

            # Resolve base_url: model_config > provider defaults
            base_url = model_config.get("base_url") or (
                settings.google_api_base_url if provider_name == "google" else None
            )
            temperature = model_config.get("temperature", 0)
            max_tokens = model_config.get("max_tokens", 4096)

            adapter = LLMAdapterFactory.create_adapter(
                provider=provider,
                api_key=api_key,
                model=model_name,
                config=LLMConfig(temperature=temperature, max_tokens=max_tokens),
                base_url=base_url,
            )

            messages = [
                LLMMessage(role="system", content=system_prompt),
                LLMMessage(role="user", content=user_prompt),
            ]

            async def _collect_response():
                text = ""
                async for chunk in adapter.chat(messages, stream=False):
                    text += chunk
                return text

            output_raw = await asyncio.wait_for(
                _collect_response(),
                timeout=MODEL_TIMEOUT,
            )

            latency_ms = int((time.time() - start_time) * 1000)
            output_structured = self._parse_structured_output(output_raw)
            parse_status = output_structured.pop("_parse_status", "raw_only")

            input_tokens = len(full_input) // 4
            output_tokens = len(output_raw) // 4
            cost = self._estimate_cost(provider_name, model_name, input_tokens, output_tokens)

            data = _ensure_id({
                "harness_id": harness_id,
                "model_provider": provider_name,
                "model_name": model_name,
                "input_prompt": full_input,
                "input_token_count": input_tokens,
                "output_raw": output_raw,
                "output_structured": output_structured if parse_status != "raw_only" else None,
                "tool_calls": None,
                "output_token_count": output_tokens,
                "latency_ms": latency_ms,
                "cost_usd": cost,
                "parse_status": parse_status,
                "status": "success",
            })
            result = repo.insert(data)
            row = result.data[0] if result.data else data
            await _backup_rows("model_io", [row], ModelIO)

            logger.info(f"Single-shot {provider_name}/{model_name}: {latency_ms}ms, parse={parse_status}")
            return row

        except asyncio.TimeoutError:
            latency_ms = int((time.time() - start_time) * 1000)
            data = _ensure_id({
                "harness_id": harness_id,
                "model_provider": provider_name,
                "model_name": model_name,
                "input_prompt": full_input,
                "status": "timeout",
                "latency_ms": latency_ms,
                "error_message": f"Timeout after {MODEL_TIMEOUT}s",
            })
            result = repo.insert(data)
            row = result.data[0] if result.data else data
            await _backup_rows("model_io", [row], ModelIO)
            logger.warning(f"Single-shot {provider_name}/{model_name}: timeout {latency_ms}ms")
            return row

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            data = _ensure_id({
                "harness_id": harness_id,
                "model_provider": provider_name,
                "model_name": model_name,
                "input_prompt": full_input,
                "status": "error",
                "latency_ms": latency_ms,
                "error_message": str(e),
            })
            result = repo.insert(data)
            row = result.data[0] if result.data else data
            await _backup_rows("model_io", [row], ModelIO)
            logger.error(f"Single-shot {provider_name}/{model_name}: error {e}")
            return row

    # ================================================================
    # Phase 2: Cross-Agent Voting
    # ================================================================

    async def _run_phase2_voting(
        self,
        harness_id: str,
        successful_ios: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Phase 2: 每个成功的 Agent 对其他 Agent 的方案投票"""
        # 并行投票
        vote_tasks = [
            self._vote_for_model(
                harness_id=harness_id,
                voter_io=voter_io,
                all_ios=successful_ios,
            )
            for voter_io in successful_ios
        ]

        vote_results = await asyncio.gather(*vote_tasks, return_exceptions=True)

        all_votes: List[Dict[str, Any]] = []
        for result in vote_results:
            if isinstance(result, Exception):
                logger.error(f"Voting error: {result}")
            elif result:
                all_votes.extend(result)

        # 批量写入 votes
        vote_repo = SupabaseRepository("arena_vote")
        vote_records = []
        for v in all_votes:
            vote_data = _ensure_id({
                "harness_id": v["harness_id"],
                "voter_model_io_id": v["voter_model_io_id"],
                "target_model_io_id": v["target_model_io_id"],
                "vote_type": v["vote_type"],
                "reasoning": v.get("reasoning"),
            })
            vote_records.append(vote_data)
        if vote_records:
            result = vote_repo.insert(vote_records)
            await _backup_rows("arena_vote", result.data or vote_records, ArenaVote)

        logger.info(f"Phase 2 voting complete: {len(all_votes)} votes recorded")
        return all_votes

    async def _vote_for_model(
        self,
        harness_id: str,
        voter_io: Dict[str, Any],
        all_ios: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """单个模型对其他方案投票"""
        voter_id = voter_io["id"]
        voter_provider = voter_io["model_provider"]
        voter_model = voter_io["model_name"]

        # 构建投票 prompt
        vote_prompt = self._build_vote_prompt(voter_id, all_ios)
        if not vote_prompt:
            return []

        # 使用同一模型进行投票 — 先查 DB 配置的 active_models，再 fallback 到 ARENA_MODELS
        api_key = None
        model_base_url = None
        db_models = load_models_from_db()
        for m in db_models:
            if m["provider"] == voter_provider and m["model"] == voter_model:
                api_key = m.get("api_key")
                model_base_url = m.get("base_url")
                break
        if not api_key:
            for m in ARENA_MODELS:
                if m["provider"] == voter_provider and m["model"] == voter_model:
                    api_key = getattr(settings, m.get("api_key_attr", ""), None)
                    break
        if not api_key:
            return []

        from uteki.domains.agent.llm_adapter import (
            LLMAdapterFactory, LLMProvider, LLMConfig, LLMMessage
        )

        provider_map = {
            "anthropic": LLMProvider.ANTHROPIC,
            "openai": LLMProvider.OPENAI,
            "deepseek": LLMProvider.DEEPSEEK,
            "google": LLMProvider.GOOGLE,
            "qwen": LLMProvider.QWEN,
            "minimax": LLMProvider.MINIMAX,
            "doubao": LLMProvider.DOUBAO,
        }
        provider = provider_map.get(voter_provider)
        if not provider:
            return []

        base_url = model_base_url or (
            settings.google_api_base_url if voter_provider == "google" else None
        )

        try:
            adapter = LLMAdapterFactory.create_adapter(
                provider=provider,
                api_key=api_key,
                model=voter_model,
                config=LLMConfig(temperature=0, max_tokens=2048),
                base_url=base_url,
            )

            messages = [
                LLMMessage(role="system", content=VOTE_SYSTEM_PROMPT),
                LLMMessage(role="user", content=vote_prompt),
            ]

            async def _collect():
                text = ""
                async for chunk in adapter.chat(messages, stream=False):
                    text += chunk
                return text

            output = await asyncio.wait_for(_collect(), timeout=MODEL_TIMEOUT)

            logger.info(
                f"[Vote Debug] voter={voter_provider}/{voter_model} "
                f"voter_id={voter_id[:8]}... "
                f"raw_output={output[:200]}..."
            )

            # 解析投票结果
            parsed = self._parse_vote_output(output)
            if not parsed:
                logger.warning(f"Vote parse failed for {voter_provider}/{voter_model}, treating as abstain")
                return []

            logger.info(
                f"[Vote Debug] voter={voter_provider}/{voter_model} "
                f"parsed={json.dumps({k: str(v)[:80] for k, v in parsed.items()}, ensure_ascii=False)}"
            )

            # 构建 plan_label → model_io_id 映射
            plan_map = self._build_plan_map(voter_id, all_ios)

            votes: List[Dict[str, Any]] = []
            fallback_reasoning = parsed.get("reasoning", "")

            # 2 approve votes
            for approve_key in ["approve_1", "approve_2"]:
                plan_label = parsed.get(approve_key)
                target_id = plan_map.get(plan_label) if plan_label else None
                if target_id:
                    reason = parsed.get(f"{approve_key}_reason") or fallback_reasoning
                    votes.append({
                        "harness_id": harness_id,
                        "voter_model_io_id": voter_id,
                        "target_model_io_id": target_id,
                        "vote_type": "approve",
                        "reasoning": reason,
                    })

            # 0-1 reject vote
            reject_label = parsed.get("reject")
            reject_target = plan_map.get(reject_label) if reject_label else None
            if reject_target:
                reason = parsed.get("reject_reason") or fallback_reasoning
                votes.append({
                    "harness_id": harness_id,
                    "voter_model_io_id": voter_id,
                    "target_model_io_id": reject_target,
                    "vote_type": "reject",
                    "reasoning": reason,
                })

            return votes

        except Exception as e:
            logger.error(f"Voting failed for {voter_provider}/{voter_model}: {e}")
            return []

    @staticmethod
    def _build_vote_prompt(voter_io_id: str, all_ios: List[Dict[str, Any]]) -> Optional[str]:
        """构建匿名化投票 prompt"""
        # 排除投票者自己的方案
        other_ios = [m for m in all_ios if m["id"] != voter_io_id]
        if len(other_ios) < 1:
            return None

        plan_labels = [
            f"Plan_{string.ascii_uppercase[i]}={io.get('model_provider')}/{io.get('model_name')}"
            for i, io in enumerate(other_ios)
        ]
        logger.info(
            f"[Vote Debug] Building prompt for voter={voter_io_id[:8]}... "
            f"all_ios_count={len(all_ios)} other_ios_count={len(other_ios)} "
            f"plan_labels={plan_labels}"
        )

        lines = [
            "以下是本次 Arena 中其他 Agent 的投资决策方案（已匿名化）。",
            "请仔细审阅每个方案，然后进行投票。\n",
        ]

        for i, io in enumerate(other_ios):
            label = f"Plan_{string.ascii_uppercase[i]}"
            structured = io.get("output_structured") or {}
            action = structured.get("action", "未知")
            allocations = structured.get("allocations", [])
            confidence = structured.get("confidence", "未知")
            reasoning = structured.get("reasoning", "无")

            alloc_text = json.dumps(allocations, ensure_ascii=False) if allocations else "无"

            lines.append(f"--- {label} ---")
            lines.append(f"Action: {action}")
            lines.append(f"Allocations: {alloc_text}")
            lines.append(f"Confidence: {confidence}")
            lines.append(f"Reasoning: {reasoning[:500]}")
            lines.append("")

        lines.append(
            "请按照投票规则进行投票。输出 JSON 格式。"
        )

        return "\n".join(lines)

    @staticmethod
    def _build_plan_map(voter_io_id: str, all_ios: List[Dict[str, Any]]) -> Dict[str, str]:
        """构建 Plan_A/B/C... → model_io_id 映射"""
        plan_map = {}
        idx = 0
        for io in all_ios:
            if io["id"] != voter_io_id:
                label = f"Plan_{string.ascii_uppercase[idx]}"
                plan_map[label] = io["id"]
                idx += 1
        return plan_map

    @staticmethod
    def _parse_vote_output(raw: str) -> Optional[Dict[str, Any]]:
        """解析投票结果

        新格式（每票独立 reason）:
        {
            "approve_1": {"plan": "Plan_B", "reason": "..."},
            "approve_2": {"plan": "Plan_D", "reason": "..."},
            "reject": {"plan": "Plan_A", "reason": "..."} | null
        }

        兼容旧格式:
        {
            "approve_1": "Plan_B",
            "approve_2": "Plan_D",
            "reject": "Plan_A" | null,
            "reasoning": "..."
        }
        """
        parsed = None

        # Try JSON block
        json_match = re.search(r'```json\s*(.*?)\s*```', raw, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try direct JSON
        if not parsed:
            try:
                candidate = json.loads(raw)
                if isinstance(candidate, dict):
                    parsed = candidate
            except (json.JSONDecodeError, ValueError):
                pass

        # Regex fallback
        if not parsed:
            result: Dict[str, Any] = {}
            for key in ["approve_1", "approve_2", "reject"]:
                m = re.search(rf'"{key}"\s*:\s*"(Plan_[A-Z])"', raw)
                if m:
                    result[key] = m.group(1)
            reasoning_m = re.search(r'"reasoning"\s*:\s*"(.*?)"', raw, re.DOTALL)
            if reasoning_m:
                result["reasoning"] = reasoning_m.group(1)
            parsed = result if result.get("approve_1") else None

        if not parsed or "approve_1" not in parsed:
            return None

        # Normalize: convert new format to unified internal format
        # New format: {"approve_1": {"plan": "Plan_X", "reason": "..."}, ...}
        # Old format: {"approve_1": "Plan_X", "reasoning": "..."}
        # Unified:    {"approve_1": "Plan_X", "approve_1_reason": "...", ...}
        result = {}
        for key in ["approve_1", "approve_2", "reject"]:
            val = parsed.get(key)
            if val is None:
                continue
            if isinstance(val, dict):
                # New format
                result[key] = val.get("plan", "")
                result[f"{key}_reason"] = val.get("reason", "")
            else:
                # Old format (string)
                result[key] = val

        # Old format fallback reasoning
        if "reasoning" in parsed:
            result["reasoning"] = parsed["reasoning"]

        return result if result.get("approve_1") else None

    # ================================================================
    # Phase 3: Tally & Adopt
    # ================================================================

    async def _run_phase3_tally(
        self,
        harness_id: str,
        harness: Dict[str, Any],
        votes: List[Dict[str, Any]],
        successful_ios: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """Phase 3: 计算每个方案的 net_score，确定 winner，自动采纳"""
        if not successful_ios:
            logger.info("No successful models, skipping tally")
            return None

        # 0 or 1 model: 直接采纳（无需投票）
        if len(successful_ios) == 1:
            winner = successful_ios[0]
            await self._adopt_winner(harness_id, harness, winner, 0, 0, 0)
            return self._format_final_decision(winner, 0, 0, 0, {})

        # 计算每个候选的 net_score
        score_map: Dict[str, Dict[str, int]] = {}
        for io in successful_ios:
            score_map[io["id"]] = {"approve": 0, "reject": 0}

        for v in votes:
            target_id = v.get("target_model_io_id")
            if target_id in score_map:
                if v["vote_type"] == "approve":
                    score_map[target_id]["approve"] += 1
                elif v["vote_type"] == "reject":
                    score_map[target_id]["reject"] += 1

        # 4-layer tiebreak: net_score → historical model_score → confidence → created_at
        historical_scores = self._get_historical_scores()

        def sort_key(io: Dict[str, Any]):
            io_id = io["id"]
            scores = score_map.get(io_id, {"approve": 0, "reject": 0})
            net = scores["approve"] - scores["reject"]
            provider = io.get("model_provider", "")
            model = io.get("model_name", "")
            hist_key = f"{provider}:{model}"
            hist_score = historical_scores.get(hist_key, 0)
            confidence = (io.get("output_structured") or {}).get("confidence", 0) or 0
            created = io.get("created_at", "")
            # Sort descending for net, hist, confidence; ascending for created_at
            return (-net, -hist_score, -confidence, created)

        ranked = sorted(successful_ios, key=sort_key)
        winner = ranked[0]
        winner_scores = score_map.get(winner["id"], {"approve": 0, "reject": 0})
        net_score = winner_scores["approve"] - winner_scores["reject"]

        # Risk guard check (currently pass-through)
        from uteki.domains.index.services.risk_guard import get_risk_guard
        risk_guard = get_risk_guard()
        risk_result = await risk_guard.check(
            decision=winner.get("output_structured") or {},
            portfolio_state=harness.get("account_state") or {},
        )
        if risk_result.status == "blocked":
            logger.warning(f"Risk guard blocked winner: {risk_result.reasons}")
            # Still adopt but mark as blocked in notes
        if risk_result.modified_allocations:
            winner_structured = winner.get("output_structured") or {}
            winner_structured["allocations"] = risk_result.modified_allocations

        # Adopt winner
        await self._adopt_winner(
            harness_id, harness, winner,
            net_score, winner_scores["approve"], winner_scores["reject"],
        )

        # Record benchmark DCA
        await self._record_benchmark_dca(harness_id, harness)

        # Update model scores
        await self._update_model_scores(
            harness, successful_ios, score_map, winner
        )

        # Write memories (shared + per-agent)
        await self._write_post_vote_memories(
            harness_id, votes, successful_ios, winner, score_map
        )

        return self._format_final_decision(
            winner, net_score, winner_scores["approve"], winner_scores["reject"],
            score_map,
        )

    async def _adopt_winner(
        self,
        harness_id: str,
        harness: Dict[str, Any],
        winner: Dict[str, Any],
        net_score: int,
        approve_count: int,
        reject_count: int,
    ):
        """自动创建 DecisionLog 采纳 winner"""
        structured = winner.get("output_structured") or {}
        log_repo = SupabaseRepository("decision_log")
        data = _ensure_id({
            "harness_id": harness_id,
            "adopted_model_io_id": winner["id"],
            "user_action": "auto_voted",
            "original_allocations": structured.get("allocations"),
            "user_notes": json.dumps({
                "net_score": net_score,
                "approve": approve_count,
                "reject": reject_count,
                "winner_model": f"{winner.get('model_provider')}/{winner.get('model_name')}",
            }, ensure_ascii=False),
        })
        result = log_repo.insert(data)
        await _backup_rows("decision_log", result.data or [data], DecisionLog)

    async def _record_benchmark_dca(
        self,
        harness_id: str,
        harness: Dict[str, Any],
    ):
        """记录 benchmark DCA 对照"""
        task = harness.get("task") or {}
        budget = task.get("budget", 0)
        watchlist = task.get("watchlist", [])

        if not budget or not watchlist:
            return

        per_etf = round(budget / len(watchlist), 2)
        dca_allocations = [
            {"symbol": s, "amount": per_etf, "percentage": round(100 / len(watchlist), 1)}
            for s in watchlist
        ]

        log_repo = SupabaseRepository("decision_log")
        data = _ensure_id({
            "harness_id": harness_id,
            "adopted_model_io_id": None,
            "user_action": "benchmark_dca",
            "original_allocations": dca_allocations,
            "user_notes": "Pure DCA benchmark: equal allocation to all watchlist ETFs",
        })
        result = log_repo.insert(data)
        await _backup_rows("decision_log", result.data or [data], DecisionLog)

    async def _update_model_scores(
        self,
        harness: Dict[str, Any],
        successful_ios: List[Dict[str, Any]],
        score_map: Dict[str, Dict[str, int]],
        winner: Dict[str, Any],
    ):
        """投票后更新 ModelScore"""
        score_repo = SupabaseRepository("model_score")
        for io in successful_ios:
            provider = io["model_provider"]
            model = io["model_name"]
            scores = score_map.get(io["id"], {"approve": 0, "reject": 0})
            is_winner = io["id"] == winner["id"]

            existing = score_repo.select_one(eq={
                "model_provider": provider,
                "model_name": model,
                "prompt_version_id": harness.get("prompt_version_id"),
            })

            if existing:
                update_data = {
                    "total_decisions": (existing.get("total_decisions") or 0) + 1,
                    "approve_vote_count": (existing.get("approve_vote_count") or 0) + scores["approve"],
                    "rejection_count": (existing.get("rejection_count") or 0) + scores["reject"],
                    "updated_at": _now_iso(),
                }
                if is_winner:
                    update_data["adoption_count"] = (existing.get("adoption_count") or 0) + 1
                score_repo.update(update_data, eq={"id": existing["id"]})
            else:
                new_score = _ensure_id({
                    "model_provider": provider,
                    "model_name": model,
                    "prompt_version_id": harness.get("prompt_version_id"),
                    "adoption_count": 1 if is_winner else 0,
                    "rejection_count": 0,
                    "approve_vote_count": scores["approve"],
                    "total_decisions": 1,
                    "win_count": 0,
                    "loss_count": 0,
                    "counterfactual_win_count": 0,
                    "counterfactual_total": 0,
                    "avg_return_pct": 0.0,
                })
                score_repo.insert(new_score)

    async def _write_post_vote_memories(
        self,
        harness_id: str,
        votes: List[Dict[str, Any]],
        successful_ios: List[Dict[str, Any]],
        winner: Dict[str, Any],
        score_map: Dict[str, Dict[str, int]],
    ):
        """投票结束后写入共享记忆 + per-agent 私有记忆"""
        from uteki.domains.index.services.memory_service import get_memory_service
        ms = get_memory_service()

        winner_structured = winner.get("output_structured") or {}
        winner_scores = score_map.get(winner["id"], {"approve": 0, "reject": 0})

        # 共享记忆: 投票获胜方案
        import datetime as dt_module
        winner_summary = json.dumps({
            "date": dt_module.datetime.now().isoformat()[:10],
            "winner_model": f"{winner.get('model_provider')}/{winner.get('model_name')}",
            "action": winner_structured.get("action"),
            "allocations": winner_structured.get("allocations"),
            "reasoning": (winner_structured.get("reasoning") or "")[:200],
            "net_score": winner_scores["approve"] - winner_scores["reject"],
        }, ensure_ascii=False)

        await ms.write_arena_learning(
            user_id="default",
            winner_summary=winner_summary,
            metadata={"harness_id": harness_id},
        )

        # Per-agent 私有记忆: 每个 agent 的投票理由
        io_id_map = {io["id"]: io for io in successful_ios}
        voter_votes: Dict[str, List[Dict[str, Any]]] = {}
        for v in votes:
            voter_id = v.get("voter_model_io_id", "")
            if voter_id not in voter_votes:
                voter_votes[voter_id] = []
            voter_votes[voter_id].append(v)

        for voter_id, vote_list in voter_votes.items():
            voter_io = io_id_map.get(voter_id)
            if not voter_io:
                continue
            agent_key = f"{voter_io['model_provider']}:{voter_io['model_name']}"

            reasoning_parts = []
            for v in vote_list:
                target_io = io_id_map.get(v.get("target_model_io_id", ""))
                target_label = f"{target_io['model_provider']}/{target_io['model_name']}" if target_io else "unknown"
                reasoning_parts.append(
                    f"{v['vote_type']} → {target_label}: {(v.get('reasoning') or '')[:100]}"
                )

            await ms.write_vote_reasoning(
                user_id="default",
                agent_key=agent_key,
                reasoning="\n".join(reasoning_parts),
                metadata={"harness_id": harness_id},
            )

    def _get_historical_scores(self) -> Dict[str, int]:
        """获取各模型的历史 model_score (adoption - rejection)"""
        score_repo = SupabaseRepository("model_score")
        rows = score_repo.select_data()
        scores = {}
        for row in rows:
            key = f"{row['model_provider']}:{row['model_name']}"
            current = scores.get(key, 0)
            scores[key] = current + ((row.get("adoption_count") or 0) - (row.get("rejection_count") or 0))
        return scores

    @staticmethod
    def _format_final_decision(
        winner: Dict[str, Any],
        net_score: int,
        approve_count: int,
        reject_count: int,
        score_map: Dict[str, Dict[str, int]],
    ) -> Dict[str, Any]:
        """格式化最终决策结果"""
        structured = winner.get("output_structured") or {}
        return {
            "winner_model_io_id": winner["id"],
            "winner_model_provider": winner.get("model_provider"),
            "winner_model_name": winner.get("model_name"),
            "winner_action": structured.get("action"),
            "net_score": net_score,
            "total_approve": approve_count,
            "total_reject": reject_count,
            "vote_summary": {
                io_id: {
                    "approve": s["approve"],
                    "reject": s["reject"],
                    "net": s["approve"] - s["reject"],
                }
                for io_id, s in score_map.items()
            },
        }

    # ================================================================
    # Pipeline State Management
    # ================================================================

    @staticmethod
    def _update_pipeline_state(harness_id: str, key: str, value: Any):
        """更新 pipeline_state 中的某个 phase 标记"""
        harness_repo = SupabaseRepository("decision_harness")
        harness = harness_repo.select_one(eq={"id": harness_id})
        if harness:
            state = harness.get("pipeline_state") or {}
            state[key] = value
            harness_repo.update({"pipeline_state": state, "updated_at": _now_iso()}, eq={"id": harness_id})

    def _get_votes_for_harness(self, harness_id: str) -> List[Dict[str, Any]]:
        """从 DB 加载已有投票记录"""
        vote_repo = SupabaseRepository("arena_vote")
        return vote_repo.select_data(eq={"harness_id": harness_id})

    # ================================================================
    # Helpers (unchanged from original)
    # ================================================================

    # 中文 key → 英文 key 映射
    _CN_KEY_MAP = {
        "操作": "action",
        "分配": "allocations",
        "信心度": "confidence",
        "决策理由": "reasoning",
        "思考过程": "chain_of_thought",
        "风险评估": "risk_assessment",
        "失效条件": "invalidation",
        "标的": "etf",
        "金额": "amount",
        "比例": "percentage",
        "理由": "reason",
    }

    # 中文操作名 → 英文
    _CN_ACTION_MAP = {
        "买入": "BUY",
        "卖出": "SELL",
        "持有": "HOLD",
        "调仓": "REBALANCE",
        "跳过": "SKIP",
    }

    @classmethod
    def _normalize_keys(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """将中文 key 映射为英文 key，保持下游兼容"""
        normalized = {}
        for k, v in data.items():
            en_key = cls._CN_KEY_MAP.get(k, k)
            # 递归处理 allocations 列表中的 dict
            if en_key == "allocations" and isinstance(v, list):
                v = [
                    {cls._CN_KEY_MAP.get(ak, ak): av for ak, av in item.items()}
                    if isinstance(item, dict) else item
                    for item in v
                ]
            # 映射操作名
            if en_key == "action" and isinstance(v, str):
                v = cls._CN_ACTION_MAP.get(v, v.upper())
            normalized[en_key] = v
        return normalized

    def _parse_structured_output(self, raw: str) -> Dict[str, Any]:
        """解析模型输出为结构化格式（多层 fallback）"""
        if not raw or not raw.strip():
            return {"_parse_status": "raw_only"}

        def _try_parse(text: str) -> Optional[Dict[str, Any]]:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return self._normalize_keys(parsed)
            return None

        # 1. ```json ... ``` 代码块提取
        try:
            json_match = re.search(r'```json\s*(.*?)\s*```', raw, re.DOTALL)
            if json_match:
                result = _try_parse(json_match.group(1))
                if result:
                    result["_parse_status"] = "structured"
                    return result
        except (json.JSONDecodeError, ValueError):
            pass

        # 2. 提取 raw 中最大的 {...} JSON 块（跳过前后文本说明）
        try:
            parsed = self._extract_largest_json_block(raw)
            if parsed and isinstance(parsed, dict):
                result = self._normalize_keys(parsed)
                result["_parse_status"] = "structured"
                return result
        except (json.JSONDecodeError, ValueError):
            pass

        # 3. 直接 json.loads
        try:
            result = _try_parse(raw.strip())
            if result:
                result["_parse_status"] = "structured"
                return result
        except (json.JSONDecodeError, ValueError):
            pass

        # 4. 去掉常见 prefix 后重试
        stripped = self._strip_common_prefixes(raw)
        if stripped != raw:
            try:
                result = _try_parse(stripped)
                if result:
                    result["_parse_status"] = "structured"
                    return result
            except (json.JSONDecodeError, ValueError):
                pass

        # 5. Regex 提取 action/操作 + allocations/分配 + confidence/信心度 → partial
        result: Dict[str, Any] = {}
        # English or Chinese action
        action_match = re.search(r'"?(?:action|操作)"?\s*[:=]\s*"?([^",}\s]+)"?', raw, re.IGNORECASE)
        if action_match:
            action_val = action_match.group(1)
            result["action"] = self._CN_ACTION_MAP.get(action_val, action_val.upper())

        # English or Chinese confidence
        conf_match = re.search(r'"?(?:confidence|信心度)"?\s*[:=]\s*([\d.]+)', raw, re.IGNORECASE)
        if conf_match:
            result["confidence"] = float(conf_match.group(1))

        # English or Chinese allocations
        alloc_match = re.search(r'"?(?:allocations|分配)"?\s*:\s*\[(.+?)\]', raw, re.DOTALL)
        if alloc_match:
            try:
                alloc_list = json.loads(f"[{alloc_match.group(1)}]")
                result["allocations"] = [
                    {self._CN_KEY_MAP.get(k, k): v for k, v in item.items()}
                    if isinstance(item, dict) else item
                    for item in alloc_list
                ]
            except (json.JSONDecodeError, ValueError):
                pass

        # English or Chinese reasoning
        reasoning_match = re.search(
            r'"?(?:reasoning|决策理由)"?\s*:\s*"((?:[^"\\]|\\.)*)"', raw, re.DOTALL
        )
        if reasoning_match:
            result["reasoning"] = reasoning_match.group(1)

        if result:
            result["_parse_status"] = "partial"
            return result

        return {"_parse_status": "raw_only"}

    @staticmethod
    def _extract_largest_json_block(text: str) -> Optional[Dict[str, Any]]:
        """从文本中找到最大的 {...} JSON 块并解析"""
        # 找到所有可能的 JSON 对象起始点
        best = None
        best_len = 0
        i = 0
        while i < len(text):
            if text[i] == '{':
                # 尝试匹配平衡括号
                depth = 0
                j = i
                in_string = False
                escape = False
                while j < len(text):
                    ch = text[j]
                    if escape:
                        escape = False
                    elif ch == '\\' and in_string:
                        escape = True
                    elif ch == '"' and not escape:
                        in_string = not in_string
                    elif not in_string:
                        if ch == '{':
                            depth += 1
                        elif ch == '}':
                            depth -= 1
                            if depth == 0:
                                candidate = text[i:j + 1]
                                if len(candidate) > best_len:
                                    try:
                                        parsed = json.loads(candidate)
                                        if isinstance(parsed, dict):
                                            best = parsed
                                            best_len = len(candidate)
                                    except (json.JSONDecodeError, ValueError):
                                        pass
                                break
                    j += 1
            i += 1
        return best

    @staticmethod
    def _strip_common_prefixes(text: str) -> str:
        """去掉常见的文本前缀"""
        stripped = text.strip()
        prefixes = [
            r'^以下是我的分析[：:]\s*',
            r'^Based on.*?[:：]\s*',
            r'^Here is my (?:analysis|decision|recommendation)[：:]\s*',
            r'^(?:Analysis|Decision|Recommendation)[：:]\s*',
            r'^```\s*\n?',
        ]
        for pattern in prefixes:
            stripped = re.sub(pattern, '', stripped, count=1, flags=re.IGNORECASE)
        stripped = re.sub(r'\s*```\s*$', '', stripped)
        return stripped.strip()

    @staticmethod
    def _fmt(value: Any, prefix: str = "", suffix: str = "") -> str:
        if value is None:
            return "[数据暂不可用]"
        return f"{prefix}{value}{suffix}"

    @classmethod
    def _serialize_harness(cls, harness: Dict[str, Any]) -> str:
        """序列化 Harness 为 prompt 文本"""
        snapshot = harness.get("market_snapshot") or {}

        quotes = snapshot.get("quotes", snapshot if "quotes" not in snapshot else {})
        valuations = snapshot.get("valuations", {})
        macro = snapshot.get("macro", {})
        sentiment = snapshot.get("sentiment", {})

        lines = [
            f"日期: {harness.get('created_at', 'unknown')}",
            f"决策类型: {harness.get('harness_type')}",
            "",
            "=== 市场行情 ===",
        ]
        for symbol, data in quotes.items():
            price = data.get("price", "N/A")
            pe = data.get("pe_ratio", "N/A")
            ma50 = data.get("ma50", "N/A")
            ma200 = data.get("ma200", "N/A")
            rsi = data.get("rsi", "N/A")
            lines.append(f"{symbol}: 价格=${price} | PE={pe} | MA50={ma50} | MA200={ma200} | RSI={rsi}")

        if valuations:
            lines.append("")
            lines.append("=== 估值数据 ===")
            for symbol, v in valuations.items():
                pe = cls._fmt(v.get("pe_ratio"))
                cape = cls._fmt(v.get("shiller_cape"))
                div_yield = cls._fmt(v.get("dividend_yield"), suffix="%")
                ey = cls._fmt(v.get("earnings_yield"), suffix="%")
                erp = cls._fmt(v.get("equity_risk_premium"), suffix="%")
                lines.append(f"{symbol}: PE={pe} | CAPE={cape} | 股息率={div_yield} | 盈利收益率={ey} | 风险溢价={erp}")

        lines.append("")
        lines.append("=== 宏观经济 ===")
        lines.append(f"联邦基金利率: {cls._fmt(macro.get('fed_funds_rate'), suffix='%')}")
        lines.append(f"利率方向: {cls._fmt(macro.get('fed_rate_direction'))}")
        lines.append(f"CPI 同比: {cls._fmt(macro.get('cpi_yoy'), suffix='%')}")
        lines.append(f"核心 PCE 同比: {cls._fmt(macro.get('core_pce_yoy'), suffix='%')}")
        lines.append(f"GDP 季环比: {cls._fmt(macro.get('gdp_growth_qoq'), suffix='%')}")
        lines.append(f"失业率: {cls._fmt(macro.get('unemployment_rate'), suffix='%')}")
        lines.append(f"ISM 制造业 PMI: {cls._fmt(macro.get('ism_manufacturing_pmi'))}")
        lines.append(f"ISM 服务业 PMI: {cls._fmt(macro.get('ism_services_pmi'))}")
        lines.append(f"收益率曲线 2Y-10Y: {cls._fmt(macro.get('yield_curve_2y10y'), suffix='bps')}")
        lines.append(f"VIX: {cls._fmt(macro.get('vix'))}")
        lines.append(f"美元指数 DXY: {cls._fmt(macro.get('dxy'))}")

        lines.append("")
        lines.append("=== 市场情绪 ===")
        lines.append(f"Fear & Greed 指数: {cls._fmt(sentiment.get('fear_greed_index'))}")
        lines.append(f"AAII 看多比例: {cls._fmt(sentiment.get('aaii_bull_ratio'), suffix='%')}")
        lines.append(f"AAII 看空比例: {cls._fmt(sentiment.get('aaii_bear_ratio'), suffix='%')}")
        lines.append(f"Put/Call Ratio: {cls._fmt(sentiment.get('put_call_ratio'))}")
        lines.append(f"新闻情绪评分: {cls._fmt(sentiment.get('news_sentiment_score'))}")
        events = sentiment.get("news_key_events", [])
        if events:
            for evt in events[:5]:
                lines.append(f"  - {evt}")

        lines.append("")
        lines.append("=== 账户状态 ===")
        account = harness.get("account_state") or {}
        lines.append(f"现金: ${account.get('cash', 0)}")
        lines.append(f"总资产: ${account.get('total', 0)}")
        for pos in account.get("positions", []):
            lines.append(f"持仓: {pos.get('symbol', '?')} {pos.get('quantity', 0)}股")

        lines.append("")
        lines.append("=== 记忆摘要 ===")
        memory = harness.get("memory_summary") or {}
        for d in memory.get("recent_decisions", []):
            lines.append(f"近期决策: {d.get('content', '')[:100]}")
        if memory.get("recent_reflection"):
            lines.append(f"近期反思: {memory['recent_reflection'].get('content', '')[:100]}")
        for exp in memory.get("experiences", []):
            lines.append(f"经验: {exp.get('content', '')[:80]}")
        for win in memory.get("recent_voting_winners", []):
            lines.append(f"投票获胜方案: {win[:100]}")

        lines.append("")
        lines.append("=== 任务 ===")
        task = harness.get("task") or {}
        lines.append(f"类型: {task.get('type', 'unknown')}")
        if task.get("budget"):
            lines.append(f"预算: ${task['budget']}")
        constraints = task.get("constraints", {})
        if constraints:
            lines.append(f"约束: {json.dumps(constraints, ensure_ascii=False)}")
        watchlist = task.get("watchlist", [])
        if watchlist:
            lines.append(f"可投资标的: {', '.join(watchlist)}")

        return "\n".join(lines)

    @staticmethod
    def _estimate_cost(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
        rates = {
            "anthropic": {"input": 3.0, "output": 15.0},
            "openai": {"input": 2.5, "output": 10.0},
            "deepseek": {"input": 0.14, "output": 0.28},
            "google": {"input": 0.075, "output": 0.30},
            "qwen": {"input": 0.8, "output": 2.0},
            "minimax": {"input": 1.0, "output": 3.0},
            "doubao": {"input": 0.8, "output": 2.0},
        }
        rate = rates.get(provider, {"input": 1.0, "output": 5.0})
        return round(
            (input_tokens * rate["input"] + output_tokens * rate["output"]) / 1_000_000,
            4,
        )

    # ================================================================
    # Query Methods
    # ================================================================

    def get_arena_results(self, harness_id: str) -> List[Dict[str, Any]]:
        """获取某次 Arena 的所有模型结果"""
        io_repo = SupabaseRepository("model_io")
        return io_repo.select_data(eq={"harness_id": harness_id})

    def get_model_io_detail(self, model_io_id: str) -> Optional[Dict[str, Any]]:
        """获取单个模型的完整 I/O"""
        io_repo = SupabaseRepository("model_io")
        return io_repo.select_one(eq={"id": model_io_id})

    def get_votes_for_harness(self, harness_id: str) -> List[Dict[str, Any]]:
        """获取某次 Arena 的投票详情（公开 API）"""
        return self._get_votes_for_harness(harness_id)

    async def get_arena_timeline(self, limit: int = 50) -> List[Dict[str, Any]]:
        """获取 Arena 时间线图表数据（按时间正序）"""
        if not db_manager.supabase_available:
            return await self._get_arena_timeline_from_postgres(limit)

        harness_repo = SupabaseRepository("decision_harness")
        io_repo = SupabaseRepository("model_io")
        log_repo = SupabaseRepository("decision_log")
        prompt_repo = SupabaseRepository("prompt_version")

        # Get harnesses ordered by created_at
        harnesses = harness_repo.select_data(order="created_at.asc", limit=limit * 2)
        if not harnesses:
            return []

        harness_ids = [h["id"] for h in harnesses]

        # Get model_io counts per harness
        all_ios = io_repo.select_data(in_={"harness_id": harness_ids}, columns="id,harness_id")
        io_counts = {}
        for io in all_ios:
            hid = io["harness_id"]
            io_counts[hid] = io_counts.get(hid, 0) + 1

        # Get adopted decisions
        logs = log_repo.select_data(
            in_={"harness_id": harness_ids},
            neq={"adopted_model_io_id": None},
        )
        adopted_io_ids = [l["adopted_model_io_id"] for l in logs if l.get("adopted_model_io_id")]
        adopted_ios = {}
        if adopted_io_ids:
            adopted_rows = io_repo.select_data(in_={"id": adopted_io_ids}, columns="id,output_structured")
            adopted_ios = {r["id"]: r.get("output_structured") for r in adopted_rows}
        log_map = {}
        for l in logs:
            if l.get("adopted_model_io_id"):
                log_map[l["harness_id"]] = l["adopted_model_io_id"]

        # Get prompt versions
        prompt_ids = list(set(h.get("prompt_version_id") for h in harnesses if h.get("prompt_version_id")))
        prompt_map = {}
        if prompt_ids:
            prompts = prompt_repo.select_data(in_={"id": prompt_ids}, columns="id,version")
            prompt_map = {p["id"]: p.get("version") for p in prompts}

        # Assemble timeline -- filter to harnesses with model_io
        timeline = []
        for h in harnesses:
            hid = h["id"]
            model_count = io_counts.get(hid, 0)
            if model_count == 0:
                continue

            account = h.get("account_state") or {}
            adopted_io_id = log_map.get(hid)
            adopted_structured = adopted_ios.get(adopted_io_id) if adopted_io_id else None
            action = None
            if adopted_structured and isinstance(adopted_structured, dict):
                action = adopted_structured.get("action")

            timeline.append({
                "harness_id": hid,
                "created_at": h.get("created_at"),
                "account_total": account.get("total"),
                "action": action,
                "harness_type": h.get("harness_type"),
                "model_count": model_count,
                "prompt_version": prompt_map.get(h.get("prompt_version_id")),
                "budget": (h.get("task") or {}).get("budget"),
            })

            if len(timeline) >= limit:
                break

        return timeline

    async def _get_arena_timeline_from_postgres(self, limit: int) -> List[Dict[str, Any]]:
        """PostgreSQL fallback for get_arena_timeline when Supabase is unavailable."""
        async with db_manager.get_postgres_session() as session:
            # Harnesses with model_io count
            io_count_sub = (
                select(ModelIO.harness_id, func.count(ModelIO.id).label("cnt"))
                .group_by(ModelIO.harness_id)
                .subquery()
            )
            stmt = (
                select(DecisionHarness, io_count_sub.c.cnt)
                .join(io_count_sub, DecisionHarness.id == io_count_sub.c.harness_id)
                .order_by(DecisionHarness.created_at.asc())
                .limit(limit)
            )
            harness_rows = (await session.execute(stmt)).all()
            if not harness_rows:
                return []

            harness_ids = [h.id for h, _ in harness_rows]

            # Decision logs → adopted io map
            log_stmt = (
                select(DecisionLog.harness_id, DecisionLog.adopted_model_io_id)
                .where(DecisionLog.harness_id.in_(harness_ids))
                .where(DecisionLog.adopted_model_io_id.isnot(None))
            )
            log_rows = (await session.execute(log_stmt)).all()
            log_map = {r.harness_id: r.adopted_model_io_id for r in log_rows}

            # Adopted model_io output_structured
            adopted_io_ids = list(set(log_map.values()))
            adopted_ios = {}
            if adopted_io_ids:
                io_stmt = select(ModelIO.id, ModelIO.output_structured).where(ModelIO.id.in_(adopted_io_ids))
                adopted_rows = (await session.execute(io_stmt)).all()
                adopted_ios = {r.id: r.output_structured for r in adopted_rows}

            # Prompt versions
            prompt_ids = list(set(h.prompt_version_id for h, _ in harness_rows if h.prompt_version_id))
            prompt_map = {}
            if prompt_ids:
                p_stmt = select(PromptVersion.id, PromptVersion.version).where(PromptVersion.id.in_(prompt_ids))
                p_rows = (await session.execute(p_stmt)).all()
                prompt_map = {r.id: r.version for r in p_rows}

            # Assemble
            timeline = []
            for h, model_count in harness_rows:
                account = h.account_state or {}
                adopted_io_id = log_map.get(h.id)
                adopted_structured = adopted_ios.get(adopted_io_id) if adopted_io_id else None
                action = None
                if adopted_structured and isinstance(adopted_structured, dict):
                    action = adopted_structured.get("action")

                timeline.append({
                    "harness_id": h.id,
                    "created_at": h.created_at.isoformat() if h.created_at else None,
                    "account_total": account.get("total"),
                    "action": action,
                    "harness_type": h.harness_type,
                    "model_count": model_count,
                    "prompt_version": prompt_map.get(h.prompt_version_id),
                    "budget": (h.task or {}).get("budget"),
                })
            return timeline

    async def get_arena_history(self, limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
        """获取 Arena 运行历史列表"""
        harness_repo = SupabaseRepository("decision_harness")
        io_repo = SupabaseRepository("model_io")
        log_repo = SupabaseRepository("decision_log")
        prompt_repo = SupabaseRepository("prompt_version")

        # Fetch more harnesses than needed since we filter by model_count > 0
        harnesses = harness_repo.select_data(order="created_at.desc", limit=(limit + offset) * 2)
        if not harnesses:
            return []

        harness_ids = [h["id"] for h in harnesses]

        # Model counts
        all_ios = io_repo.select_data(in_={"harness_id": harness_ids}, columns="id,harness_id")
        io_counts = {}
        for io in all_ios:
            hid = io["harness_id"]
            io_counts[hid] = io_counts.get(hid, 0) + 1

        # Get auto_voted winners
        auto_logs = log_repo.select_data(
            in_={"harness_id": harness_ids},
            eq={"user_action": "auto_voted"},
        )
        winner_io_ids = [l["adopted_model_io_id"] for l in auto_logs if l.get("adopted_model_io_id")]
        winner_ios = {}
        if winner_io_ids:
            rows = io_repo.select_data(
                in_={"id": winner_io_ids},
                columns="id,model_provider,model_name,output_structured"
            )
            winner_ios = {r["id"]: r for r in rows}
        auto_log_map = {}
        for l in auto_logs:
            if l.get("adopted_model_io_id"):
                auto_log_map[l["harness_id"]] = l["adopted_model_io_id"]

        # Prompt versions
        prompt_ids = list(set(h.get("prompt_version_id") for h in harnesses if h.get("prompt_version_id")))
        prompt_map = {}
        if prompt_ids:
            prompts = prompt_repo.select_data(in_={"id": prompt_ids}, columns="id,version")
            prompt_map = {p["id"]: p.get("version") for p in prompts}

        # Filter and paginate
        filtered = [h for h in harnesses if io_counts.get(h["id"], 0) > 0]
        paged = filtered[offset:offset + limit]

        result = []
        for h in paged:
            hid = h["id"]
            winner_io_id = auto_log_map.get(hid)
            winner = winner_ios.get(winner_io_id, {}) if winner_io_id else {}

            winner_structured = winner.get("output_structured")
            result.append({
                "harness_id": hid,
                "harness_type": h.get("harness_type"),
                "created_at": h.get("created_at"),
                "budget": (h.get("task") or {}).get("budget"),
                "model_count": io_counts.get(hid, 0),
                "prompt_version": prompt_map.get(h.get("prompt_version_id")),
                "vote_winner_model": (
                    f"{winner.get('model_provider')}/{winner.get('model_name')}"
                    if winner.get("model_provider") else None
                ),
                "vote_winner_action": (
                    winner_structured.get("action")
                    if winner_structured and isinstance(winner_structured, dict)
                    else None
                ),
            })

        return result


# Voting system prompt
VOTE_SYSTEM_PROMPT = """你是一名专业的投资决策评审员。你需要审阅其他投资顾问的方案并投票。

投票规则：
1. 你必须选出 2 个你最认可的方案（approve_1, approve_2）
2. 你可以选择 1 个你最不认可的方案作为反对票（reject），也可以放弃反对票（设为 null）
3. 你不能对自己的方案投票（你的方案不在列表中）

评审标准：
- 分析逻辑是否清晰、完整
- 风险评估是否充分
- 仓位分配是否合理（不过于集中或分散）
- 信心度是否与分析深度匹配
- 是否考虑了宏观环境和市场趋势

请输出 JSON 格式，每个投票必须有独立的理由：
```json
{
  "approve_1": {"plan": "Plan_X", "reason": "为什么认可这个方案"},
  "approve_2": {"plan": "Plan_Y", "reason": "为什么认可这个方案"},
  "reject": {"plan": "Plan_Z", "reason": "为什么反对这个方案"} 或 null
}
```"""

_arena_service: Optional[ArenaService] = None


def get_arena_service() -> ArenaService:
    global _arena_service
    if _arena_service is None:
        _arena_service = ArenaService()
    return _arena_service
