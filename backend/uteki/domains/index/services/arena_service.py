"""多模型 Arena 调度服务 — 3 阶段 Pipeline (决策 → 投票 → 计分)"""

import asyncio
import json
import logging
import re
import string
import time
from typing import Optional, List, Dict, Any, Callable

from sqlalchemy import select, func, desc, asc, update
from sqlalchemy.ext.asyncio import AsyncSession

from uteki.common.config import settings
from uteki.common.database import db_manager
from uteki.domains.index.models.model_io import ModelIO
from uteki.domains.index.models.decision_harness import DecisionHarness
from uteki.domains.index.models.decision_log import DecisionLog
from uteki.domains.index.models.prompt_version import PromptVersion
from uteki.domains.index.models.arena_vote import ArenaVote
from uteki.domains.index.models.model_score import ModelScore

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
]


class ArenaService:
    """多模型 Arena — 3 阶段 Pipeline

    Phase 1: 所有 Agent 通过 Skill Pipeline 独立决策
    Phase 2: 跨 Agent 匿名投票
    Phase 3: 计分 + 自动采纳 winner
    """

    async def run(
        self,
        harness_id: str,
        session: AsyncSession,
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

        # Determine which models to run
        if model_filter:
            filter_keys = {(m["provider"], m["model"]) for m in model_filter}
            active_models = [m for m in ARENA_MODELS if (m["provider"], m["model"]) in filter_keys]
            if not active_models:
                active_models = ARENA_MODELS
        else:
            active_models = ARENA_MODELS

        # 获取 Harness
        harness_q = select(DecisionHarness).where(DecisionHarness.id == harness_id)
        harness_r = await session.execute(harness_q)
        harness = harness_r.scalar_one_or_none()
        if not harness:
            raise ValueError(f"Harness not found: {harness_id}")

        # 获取 prompt 版本
        prompt_q = select(PromptVersion).where(PromptVersion.id == harness.prompt_version_id)
        prompt_r = await session.execute(prompt_q)
        prompt_version = prompt_r.scalar_one_or_none()
        system_prompt = prompt_version.content if prompt_version else ""

        # 构建用户 prompt（从 DB 读取 user prompt 模板渲染，fallback 到硬编码）
        try:
            from uteki.domains.index.services.prompt_service import get_prompt_service
            prompt_service = get_prompt_service()
            user_prompt = await prompt_service.render_user_prompt(session, harness.to_dict())
        except Exception as e:
            logger.warning(f"Failed to render user prompt from template, falling back: {e}")
            user_prompt = self._serialize_harness(harness)

        # 检查 pipeline_state 实现中断恢复
        pipeline_state = harness.pipeline_state or {}

        # ── Phase 1: 决策 ──
        if not pipeline_state.get("phase1_done"):
            phase1_start = time.time()
            if on_progress:
                on_progress({"type": "phase_start", "phase": "decide", "total_models": len(active_models)})
            model_ios = await self._run_phase1_decisions(
                harness_id=harness_id,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                harness_data=harness.to_dict(),
                session=session,
                tool_definitions=tool_definitions,
                on_progress=on_progress,
                model_list=active_models,
            )
            phase_timings["phase1_ms"] = int((time.time() - phase1_start) * 1000)
            await self._update_pipeline_state(harness_id, session, "phase1_done", True)
        else:
            # Phase 1 已完成，从 DB 读取 model_ios
            model_ios = await self.get_arena_results(harness_id, session)
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
                    session=session,
                )
            else:
                logger.info(f"Skipping voting: only {len(successful_ios)} successful models")
            phase_timings["phase2_ms"] = int((time.time() - phase2_start) * 1000)
            await self._update_pipeline_state(harness_id, session, "phase2_done", True)
        else:
            # Load existing votes
            votes = await self._get_votes_for_harness(harness_id, session)
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
                session=session,
            )
            phase_timings["phase3_ms"] = int((time.time() - phase3_start) * 1000)
            await self._update_pipeline_state(harness_id, session, "phase3_done", True)

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
        session: AsyncSession,
        tool_definitions: Optional[List[Dict]] = None,
        on_progress: Optional[Callable] = None,
        model_list: Optional[List[Dict]] = None,
    ) -> List[Dict[str, Any]]:
        """Phase 1: 所有 Agent 并行执行 Skill Pipeline 决策"""
        available_models = []
        for m in (model_list or ARENA_MODELS):
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

        async with db_manager.get_postgres_session() as model_session:
            # 尝试 Skill Pipeline
            try:
                from uteki.domains.index.services.agent_skills import AgentSkillRunner

                runner = AgentSkillRunner(
                    model_config=model_config,
                    harness_data=harness_data,
                    agent_key=agent_key,
                    session=model_session,
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
                        session=model_session,
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
                session=model_session,
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
        session: AsyncSession,
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

        model_io = ModelIO(
            harness_id=harness_id,
            model_provider=provider_name,
            model_name=model_name,
            input_prompt=full_input,
            input_token_count=input_tokens,
            output_raw=output_raw,
            output_structured=output_structured if parse_status != "raw_only" else None,
            tool_calls=pipeline_result.get("tool_calls"),
            output_token_count=output_tokens,
            latency_ms=latency_ms,
            cost_usd=cost,
            parse_status=parse_status,
            status="success",
            pipeline_steps=stored_steps if stored_steps else None,
        )
        session.add(model_io)
        await session.commit()
        await session.refresh(model_io)

        logger.info(f"Pipeline result saved: {provider_name}/{model_name} {latency_ms}ms")
        return model_io.to_dict()

    async def _call_model_single_shot(
        self,
        model_config: Dict[str, Any],
        system_prompt: str,
        user_prompt: str,
        harness_id: str,
        session: AsyncSession,
    ) -> Optional[Dict[str, Any]]:
        """Single-shot fallback (original _call_model logic)"""
        from uteki.domains.agent.llm_adapter import (
            LLMAdapterFactory, LLMProvider, LLMConfig, LLMMessage
        )

        provider_name = model_config["provider"]
        model_name = model_config["model"]
        api_key = model_config["api_key"]
        full_input = f"[System Prompt]\n{system_prompt}\n\n[Decision Harness]\n{user_prompt}"

        start_time = time.time()
        try:
            provider_map = {
                "anthropic": LLMProvider.ANTHROPIC,
                "openai": LLMProvider.OPENAI,
                "deepseek": LLMProvider.DEEPSEEK,
                "google": LLMProvider.GOOGLE,
                "qwen": LLMProvider.QWEN,
                "minimax": LLMProvider.MINIMAX,
            }
            provider = provider_map.get(provider_name)
            if not provider:
                raise ValueError(f"Unknown provider: {provider_name}")

            base_url = settings.google_api_base_url if provider_name == "google" else None

            adapter = LLMAdapterFactory.create_adapter(
                provider=provider,
                api_key=api_key,
                model=model_name,
                config=LLMConfig(temperature=0, max_tokens=4096),
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

            model_io = ModelIO(
                harness_id=harness_id,
                model_provider=provider_name,
                model_name=model_name,
                input_prompt=full_input,
                input_token_count=input_tokens,
                output_raw=output_raw,
                output_structured=output_structured if parse_status != "raw_only" else None,
                tool_calls=None,
                output_token_count=output_tokens,
                latency_ms=latency_ms,
                cost_usd=cost,
                parse_status=parse_status,
                status="success",
            )
            session.add(model_io)
            await session.commit()
            await session.refresh(model_io)

            logger.info(f"Single-shot {provider_name}/{model_name}: {latency_ms}ms, parse={parse_status}")
            return model_io.to_dict()

        except asyncio.TimeoutError:
            latency_ms = int((time.time() - start_time) * 1000)
            model_io = ModelIO(
                harness_id=harness_id,
                model_provider=provider_name,
                model_name=model_name,
                input_prompt=full_input,
                status="timeout",
                latency_ms=latency_ms,
                error_message=f"Timeout after {MODEL_TIMEOUT}s",
            )
            session.add(model_io)
            await session.commit()
            await session.refresh(model_io)
            logger.warning(f"Single-shot {provider_name}/{model_name}: timeout {latency_ms}ms")
            return model_io.to_dict()

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            model_io = ModelIO(
                harness_id=harness_id,
                model_provider=provider_name,
                model_name=model_name,
                input_prompt=full_input,
                status="error",
                latency_ms=latency_ms,
                error_message=str(e),
            )
            session.add(model_io)
            await session.commit()
            await session.refresh(model_io)
            logger.error(f"Single-shot {provider_name}/{model_name}: error {e}")
            return model_io.to_dict()

    # ================================================================
    # Phase 2: Cross-Agent Voting
    # ================================================================

    async def _run_phase2_voting(
        self,
        harness_id: str,
        successful_ios: List[Dict[str, Any]],
        session: AsyncSession,
    ) -> List[Dict[str, Any]]:
        """Phase 2: 每个成功的 Agent 对其他 Agent 的方案投票"""
        # 并行投票 — 每个 voter 使用独立 session
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
        async with db_manager.get_postgres_session() as vote_session:
            for v in all_votes:
                vote = ArenaVote(
                    harness_id=v["harness_id"],
                    voter_model_io_id=v["voter_model_io_id"],
                    target_model_io_id=v["target_model_io_id"],
                    vote_type=v["vote_type"],
                    reasoning=v.get("reasoning"),
                )
                vote_session.add(vote)
            await vote_session.commit()

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

        # 使用同一模型进行投票
        api_key_attr = None
        for m in ARENA_MODELS:
            if m["provider"] == voter_provider and m["model"] == voter_model:
                api_key_attr = m["api_key_attr"]
                break
        if not api_key_attr:
            return []

        api_key = getattr(settings, api_key_attr, None)
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
        }
        provider = provider_map.get(voter_provider)
        if not provider:
            return []

        base_url = settings.google_api_base_url if voter_provider == "google" else None

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

            # 解析投票结果
            parsed = self._parse_vote_output(output)
            if not parsed:
                logger.warning(f"Vote parse failed for {voter_provider}/{voter_model}, treating as abstain")
                return []

            # 构建 plan_label → model_io_id 映射
            plan_map = self._build_plan_map(voter_id, all_ios)

            votes: List[Dict[str, Any]] = []

            # 2 approve votes
            for approve_key in ["approve_1", "approve_2"]:
                plan_label = parsed.get(approve_key)
                target_id = plan_map.get(plan_label) if plan_label else None
                if target_id:
                    votes.append({
                        "harness_id": harness_id,
                        "voter_model_io_id": voter_id,
                        "target_model_io_id": target_id,
                        "vote_type": "approve",
                        "reasoning": parsed.get("reasoning", ""),
                    })

            # 0-1 reject vote
            reject_label = parsed.get("reject")
            reject_target = plan_map.get(reject_label) if reject_label else None
            if reject_target:
                votes.append({
                    "harness_id": harness_id,
                    "voter_model_io_id": voter_id,
                    "target_model_io_id": reject_target,
                    "vote_type": "reject",
                    "reasoning": parsed.get("reasoning", ""),
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

        期望格式:
        {
            "approve_1": "Plan_B",
            "approve_2": "Plan_D",
            "reject": "Plan_A" | null,
            "reasoning": "..."
        }
        """
        # Try JSON block
        json_match = re.search(r'```json\s*(.*?)\s*```', raw, re.DOTALL)
        if json_match:
            try:
                parsed = json.loads(json_match.group(1))
                if "approve_1" in parsed:
                    return parsed
            except json.JSONDecodeError:
                pass

        # Try direct JSON
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and "approve_1" in parsed:
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass

        # Regex fallback
        result: Dict[str, Any] = {}
        for key in ["approve_1", "approve_2", "reject"]:
            m = re.search(rf'"{key}"\s*:\s*"(Plan_[A-Z])"', raw)
            if m:
                result[key] = m.group(1)

        reasoning_m = re.search(r'"reasoning"\s*:\s*"(.*?)"', raw, re.DOTALL)
        if reasoning_m:
            result["reasoning"] = reasoning_m.group(1)

        return result if result.get("approve_1") else None

    # ================================================================
    # Phase 3: Tally & Adopt
    # ================================================================

    async def _run_phase3_tally(
        self,
        harness_id: str,
        harness: DecisionHarness,
        votes: List[Dict[str, Any]],
        successful_ios: List[Dict[str, Any]],
        session: AsyncSession,
    ) -> Optional[Dict[str, Any]]:
        """Phase 3: 计算每个方案的 net_score，确定 winner，自动采纳"""
        if not successful_ios:
            logger.info("No successful models, skipping tally")
            return None

        # 0 or 1 model: 直接采纳（无需投票）
        if len(successful_ios) == 1:
            winner = successful_ios[0]
            await self._adopt_winner(harness_id, harness, winner, 0, 0, 0, session)
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
        async with db_manager.get_postgres_session() as score_session:
            historical_scores = await self._get_historical_scores(score_session)

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
            portfolio_state=harness.account_state or {},
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
            session,
        )

        # Record benchmark DCA
        await self._record_benchmark_dca(harness_id, harness, session)

        # Update model scores
        await self._update_model_scores(
            harness, successful_ios, score_map, winner, session
        )

        # Write memories (shared + per-agent)
        await self._write_post_vote_memories(
            harness_id, votes, successful_ios, winner, score_map, session
        )

        return self._format_final_decision(
            winner, net_score, winner_scores["approve"], winner_scores["reject"],
            score_map,
        )

    async def _adopt_winner(
        self,
        harness_id: str,
        harness: DecisionHarness,
        winner: Dict[str, Any],
        net_score: int,
        approve_count: int,
        reject_count: int,
        session: AsyncSession,
    ):
        """自动创建 DecisionLog 采纳 winner"""
        structured = winner.get("output_structured") or {}
        async with db_manager.get_postgres_session() as log_session:
            decision_log = DecisionLog(
                harness_id=harness_id,
                adopted_model_io_id=winner["id"],
                user_action="auto_voted",
                original_allocations=structured.get("allocations"),
                user_notes=json.dumps({
                    "net_score": net_score,
                    "approve": approve_count,
                    "reject": reject_count,
                    "winner_model": f"{winner.get('model_provider')}/{winner.get('model_name')}",
                }, ensure_ascii=False),
            )
            log_session.add(decision_log)
            await log_session.commit()

    async def _record_benchmark_dca(
        self,
        harness_id: str,
        harness: DecisionHarness,
        session: AsyncSession,
    ):
        """记录 benchmark DCA 对照"""
        task = harness.task or {}
        budget = task.get("budget", 0)
        watchlist = task.get("watchlist", [])

        if not budget or not watchlist:
            return

        per_etf = round(budget / len(watchlist), 2)
        dca_allocations = [
            {"symbol": s, "amount": per_etf, "percentage": round(100 / len(watchlist), 1)}
            for s in watchlist
        ]

        async with db_manager.get_postgres_session() as log_session:
            benchmark_log = DecisionLog(
                harness_id=harness_id,
                adopted_model_io_id=None,
                user_action="benchmark_dca",
                original_allocations=dca_allocations,
                user_notes="Pure DCA benchmark: equal allocation to all watchlist ETFs",
            )
            log_session.add(benchmark_log)
            await log_session.commit()

    async def _update_model_scores(
        self,
        harness: DecisionHarness,
        successful_ios: List[Dict[str, Any]],
        score_map: Dict[str, Dict[str, int]],
        winner: Dict[str, Any],
        session: AsyncSession,
    ):
        """投票后更新 ModelScore"""
        async with db_manager.get_postgres_session() as score_session:
            for io in successful_ios:
                provider = io["model_provider"]
                model = io["model_name"]
                scores = score_map.get(io["id"], {"approve": 0, "reject": 0})
                is_winner = io["id"] == winner["id"]

                # 查找或创建 ModelScore
                q = select(ModelScore).where(
                    ModelScore.model_provider == provider,
                    ModelScore.model_name == model,
                    ModelScore.prompt_version_id == harness.prompt_version_id,
                )
                result = await score_session.execute(q)
                ms = result.scalar_one_or_none()

                if not ms:
                    ms = ModelScore(
                        model_provider=provider,
                        model_name=model,
                        prompt_version_id=harness.prompt_version_id,
                        adoption_count=0,
                        rejection_count=0,
                        approve_vote_count=0,
                        total_decisions=0,
                        win_count=0,
                        loss_count=0,
                        counterfactual_win_count=0,
                        counterfactual_total=0,
                        avg_return_pct=0.0,
                    )
                    score_session.add(ms)

                ms.total_decisions = (ms.total_decisions or 0) + 1
                if is_winner:
                    ms.adoption_count = (ms.adoption_count or 0) + 1
                ms.approve_vote_count = (ms.approve_vote_count or 0) + scores["approve"]
                ms.rejection_count = (ms.rejection_count or 0) + scores["reject"]

            await score_session.commit()

    async def _write_post_vote_memories(
        self,
        harness_id: str,
        votes: List[Dict[str, Any]],
        successful_ios: List[Dict[str, Any]],
        winner: Dict[str, Any],
        score_map: Dict[str, Dict[str, int]],
        session: AsyncSession,
    ):
        """投票结束后写入共享记忆 + per-agent 私有记忆"""
        from uteki.domains.index.services.memory_service import get_memory_service
        ms = get_memory_service()

        winner_structured = winner.get("output_structured") or {}
        winner_scores = score_map.get(winner["id"], {"approve": 0, "reject": 0})

        # 共享记忆: 投票获胜方案
        import datetime
        winner_summary = json.dumps({
            "date": datetime.datetime.now().isoformat()[:10],
            "winner_model": f"{winner.get('model_provider')}/{winner.get('model_name')}",
            "action": winner_structured.get("action"),
            "allocations": winner_structured.get("allocations"),
            "reasoning": (winner_structured.get("reasoning") or "")[:200],
            "net_score": winner_scores["approve"] - winner_scores["reject"],
        }, ensure_ascii=False)

        async with db_manager.get_postgres_session() as mem_session:
            await ms.write_arena_learning(
                user_id="default",
                session=mem_session,
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

            async with db_manager.get_postgres_session() as mem_session:
                await ms.write_vote_reasoning(
                    user_id="default",
                    agent_key=agent_key,
                    session=mem_session,
                    reasoning="\n".join(reasoning_parts),
                    metadata={"harness_id": harness_id},
                )

    async def _get_historical_scores(
        self, session: AsyncSession
    ) -> Dict[str, int]:
        """获取各模型的历史 model_score (adoption - rejection)"""
        q = select(ModelScore)
        result = await session.execute(q)
        scores = {}
        for ms in result.scalars().all():
            key = f"{ms.model_provider}:{ms.model_name}"
            current = scores.get(key, 0)
            scores[key] = current + (ms.adoption_count - ms.rejection_count)
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
    async def _update_pipeline_state(
        harness_id: str, session: AsyncSession, key: str, value: Any
    ):
        """更新 pipeline_state 中的某个 phase 标记"""
        async with db_manager.get_postgres_session() as ps_session:
            q = select(DecisionHarness).where(DecisionHarness.id == harness_id)
            result = await ps_session.execute(q)
            harness = result.scalar_one_or_none()
            if harness:
                state = harness.pipeline_state or {}
                state[key] = value
                harness.pipeline_state = state
                await ps_session.commit()

    async def _get_votes_for_harness(
        self, harness_id: str, session: AsyncSession
    ) -> List[Dict[str, Any]]:
        """从 DB 加载已有投票记录"""
        async with db_manager.get_postgres_session() as vote_session:
            q = select(ArenaVote).where(ArenaVote.harness_id == harness_id)
            result = await vote_session.execute(q)
            return [v.to_dict() for v in result.scalars().all()]

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
    def _serialize_harness(cls, harness: DecisionHarness) -> str:
        """序列化 Harness 为 prompt 文本"""
        snapshot = harness.market_snapshot or {}

        quotes = snapshot.get("quotes", snapshot if "quotes" not in snapshot else {})
        valuations = snapshot.get("valuations", {})
        macro = snapshot.get("macro", {})
        sentiment = snapshot.get("sentiment", {})

        lines = [
            f"日期: {harness.created_at.isoformat() if harness.created_at else 'unknown'}",
            f"决策类型: {harness.harness_type}",
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
        account = harness.account_state or {}
        lines.append(f"现金: ${account.get('cash', 0)}")
        lines.append(f"总资产: ${account.get('total', 0)}")
        for pos in account.get("positions", []):
            lines.append(f"持仓: {pos.get('symbol', '?')} {pos.get('quantity', 0)}股")

        lines.append("")
        lines.append("=== 记忆摘要 ===")
        memory = harness.memory_summary or {}
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
        task = harness.task or {}
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
        }
        rate = rates.get(provider, {"input": 1.0, "output": 5.0})
        return round(
            (input_tokens * rate["input"] + output_tokens * rate["output"]) / 1_000_000,
            4,
        )

    # ================================================================
    # Query Methods
    # ================================================================

    async def get_arena_timeline(
        self, session: AsyncSession, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """获取 Arena 时间线图表数据（按时间正序）"""
        model_count_subq = (
            select(
                ModelIO.harness_id,
                func.count(ModelIO.id).label("model_count"),
            )
            .group_by(ModelIO.harness_id)
            .subquery()
        )

        adopted_subq = (
            select(
                DecisionLog.harness_id,
                ModelIO.output_structured.label("adopted_structured"),
            )
            .join(ModelIO, DecisionLog.adopted_model_io_id == ModelIO.id)
            .where(DecisionLog.adopted_model_io_id.is_not(None))
            .subquery()
        )

        query = (
            select(
                DecisionHarness.id,
                DecisionHarness.harness_type,
                DecisionHarness.created_at,
                DecisionHarness.account_state,
                DecisionHarness.task,
                model_count_subq.c.model_count,
                PromptVersion.version.label("prompt_version"),
                adopted_subq.c.adopted_structured,
            )
            .outerjoin(model_count_subq, DecisionHarness.id == model_count_subq.c.harness_id)
            .outerjoin(PromptVersion, DecisionHarness.prompt_version_id == PromptVersion.id)
            .outerjoin(adopted_subq, DecisionHarness.id == adopted_subq.c.harness_id)
            .where(model_count_subq.c.model_count > 0)
            .order_by(asc(DecisionHarness.created_at))
            .limit(limit)
        )

        result = await session.execute(query)
        rows = result.all()

        timeline = []
        for row in rows:
            account = row.account_state or {}
            account_total = account.get("total")

            action = None
            if row.adopted_structured and isinstance(row.adopted_structured, dict):
                action = row.adopted_structured.get("action")

            timeline.append({
                "harness_id": row.id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "account_total": account_total,
                "action": action,
                "harness_type": row.harness_type,
                "model_count": row.model_count or 0,
                "prompt_version": row.prompt_version,
                "budget": (row.task or {}).get("budget"),
            })

        return timeline

    async def get_arena_history(
        self, session: AsyncSession, limit: int = 20, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """获取 Arena 运行历史列表"""
        model_count_subq = (
            select(
                ModelIO.harness_id,
                func.count(ModelIO.id).label("model_count"),
            )
            .group_by(ModelIO.harness_id)
            .subquery()
        )

        # 获取投票 winner 信息
        winner_subq = (
            select(
                DecisionLog.harness_id,
                ModelIO.model_provider.label("vote_winner_provider"),
                ModelIO.model_name.label("vote_winner_model_name"),
                ModelIO.output_structured.label("vote_winner_structured"),
            )
            .join(ModelIO, DecisionLog.adopted_model_io_id == ModelIO.id)
            .where(DecisionLog.user_action == "auto_voted")
            .subquery()
        )

        query = (
            select(
                DecisionHarness.id,
                DecisionHarness.harness_type,
                DecisionHarness.created_at,
                DecisionHarness.task,
                model_count_subq.c.model_count,
                PromptVersion.version.label("prompt_version"),
                winner_subq.c.vote_winner_provider,
                winner_subq.c.vote_winner_model_name,
                winner_subq.c.vote_winner_structured,
            )
            .outerjoin(model_count_subq, DecisionHarness.id == model_count_subq.c.harness_id)
            .outerjoin(PromptVersion, DecisionHarness.prompt_version_id == PromptVersion.id)
            .outerjoin(winner_subq, DecisionHarness.id == winner_subq.c.harness_id)
            .where(model_count_subq.c.model_count > 0)
            .order_by(desc(DecisionHarness.created_at))
            .limit(limit)
            .offset(offset)
        )

        result = await session.execute(query)
        rows = result.all()

        return [
            {
                "harness_id": row.id,
                "harness_type": row.harness_type,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "budget": (row.task or {}).get("budget"),
                "model_count": row.model_count or 0,
                "prompt_version": row.prompt_version,
                "vote_winner_model": (
                    f"{row.vote_winner_provider}/{row.vote_winner_model_name}"
                    if row.vote_winner_provider else None
                ),
                "vote_winner_action": (
                    row.vote_winner_structured.get("action")
                    if row.vote_winner_structured and isinstance(row.vote_winner_structured, dict)
                    else None
                ),
            }
            for row in rows
        ]

    async def get_arena_results(
        self, harness_id: str, session: AsyncSession
    ) -> List[Dict[str, Any]]:
        """获取某次 Arena 的所有模型结果"""
        query = select(ModelIO).where(ModelIO.harness_id == harness_id)
        result = await session.execute(query)
        return [m.to_dict() for m in result.scalars().all()]

    async def get_model_io_detail(
        self, model_io_id: str, session: AsyncSession
    ) -> Optional[Dict[str, Any]]:
        """获取单个模型的完整 I/O"""
        query = select(ModelIO).where(ModelIO.id == model_io_id)
        result = await session.execute(query)
        mio = result.scalar_one_or_none()
        return mio.to_full_dict() if mio else None

    async def get_votes_for_harness(
        self, harness_id: str, session: AsyncSession
    ) -> List[Dict[str, Any]]:
        """获取某次 Arena 的投票详情（公开 API）"""
        return await self._get_votes_for_harness(harness_id, session)


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

请输出 JSON 格式：
```json
{
  "approve_1": "Plan_X",
  "approve_2": "Plan_Y",
  "reject": "Plan_Z" 或 null,
  "reasoning": "简要说明投票理由"
}
```"""

_arena_service: Optional[ArenaService] = None


def get_arena_service() -> ArenaService:
    global _arena_service
    if _arena_service is None:
        _arena_service = ArenaService()
    return _arena_service
