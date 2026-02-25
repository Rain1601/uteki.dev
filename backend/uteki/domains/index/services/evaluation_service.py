"""Evaluation 聚合分析服务 — Supabase REST API + Python aggregation 版"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from uteki.common.database import SupabaseRepository

logger = logging.getLogger(__name__)


class EvaluationService:
    """聚合查询 — Overview / Voting / Trend / Cost / Counterfactual"""

    async def get_overview(self) -> Dict[str, Any]:
        """聚合 KPI：总运行次数、决策分布、最佳模型、平均胜率"""
        since_iso = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()

        harness_repo = SupabaseRepository("decision_harness")
        log_repo = SupabaseRepository("decision_log")
        io_repo = SupabaseRepository("model_io")
        score_repo = SupabaseRepository("model_score")

        harness_rows = harness_repo.select_data(gte={"created_at": since_iso})
        log_rows = log_repo.select_data(gte={"created_at": since_iso})
        io_rows = io_repo.select_data(gte={"created_at": since_iso})
        score_rows = score_repo.select_data()

        # Harness breakdown by type
        harness_breakdown = defaultdict(int)
        for h in harness_rows:
            ht = h.get("harness_type", "unknown")
            harness_breakdown[ht] += 1

        # Decision breakdown by user_action
        decision_breakdown = defaultdict(int)
        for d in log_rows:
            ua = d.get("user_action", "unknown")
            decision_breakdown[ua] += 1

        # IO stats
        latencies = [r["latency_ms"] for r in io_rows if r.get("latency_ms") is not None]
        costs = [r["cost_usd"] for r in io_rows if r.get("cost_usd") is not None]
        avg_latency = round(sum(latencies) / len(latencies)) if latencies else 0
        avg_cost = round(sum(costs) / len(costs), 4) if costs else 0
        total_cost = round(sum(costs), 2) if costs else 0

        # Best model + avg win rate from scores
        best_model = None
        best_score = float("-inf")
        win_rates = []
        for s in score_rows:
            approve = s.get("approve_vote_count", 0) or 0
            reject = s.get("rejection_count", 0) or 0
            net = approve - reject
            if net > best_score:
                best_score = net
                best_model = f"{s.get('model_provider')}:{s.get('model_name')}"

            w = s.get("win_count", 0) or 0
            l = s.get("loss_count", 0) or 0
            if (w + l) > 0:
                win_rates.append(w / (w + l) * 100)
            else:
                win_rates.append(0)

        avg_win_rate = round(sum(win_rates) / len(win_rates), 1) if win_rates else 0

        return {
            "total_arena_runs": len(harness_rows),
            "harness_breakdown": dict(harness_breakdown),
            "total_decisions": len(log_rows),
            "decision_breakdown": dict(decision_breakdown),
            "best_model": best_model,
            "avg_win_rate": avg_win_rate,
            "avg_latency_ms": avg_latency,
            "avg_cost_usd": avg_cost,
            "total_cost_usd": total_cost,
        }

    async def get_voting_matrix(self, limit: int = 20) -> Dict[str, Any]:
        """投票热力图：最近 N 次 arena 的 voter->target approve/reject 矩阵"""
        harness_repo = SupabaseRepository("decision_harness")
        vote_repo = SupabaseRepository("arena_vote")
        io_repo = SupabaseRepository("model_io")

        # Get recent harness IDs
        recent = harness_repo.select_data(order="created_at.desc", limit=limit)
        if not recent:
            return {"models": [], "matrix": []}
        harness_ids = [h["id"] for h in recent]

        # Get all votes for these harnesses
        votes = vote_repo.select_data(in_={"harness_id": harness_ids})
        if not votes:
            return {"models": [], "matrix": []}

        # Collect all model_io IDs needed
        io_ids = set()
        for v in votes:
            io_ids.add(v["voter_model_io_id"])
            io_ids.add(v["target_model_io_id"])

        # Fetch model_io rows in batch
        io_rows = io_repo.select_data(in_={"id": list(io_ids)})
        io_map = {r["id"]: f"{r['model_provider']}:{r['model_name']}" for r in io_rows}

        # Build matrix
        matrix_agg = defaultdict(lambda: {"approve": 0, "reject": 0})
        all_models = set()
        for v in votes:
            voter = io_map.get(v["voter_model_io_id"], "unknown")
            target = io_map.get(v["target_model_io_id"], "unknown")
            all_models.add(voter)
            all_models.add(target)
            vtype = v.get("vote_type", "")
            if vtype == "approve":
                matrix_agg[(voter, target)]["approve"] += 1
            elif vtype == "reject":
                matrix_agg[(voter, target)]["reject"] += 1

        matrix = [
            {"voter": k[0], "target": k[1], "approve": v["approve"], "reject": v["reject"]}
            for k, v in matrix_agg.items()
        ]

        return {
            "models": sorted(all_models),
            "matrix": matrix,
        }

    async def get_performance_trend(self, days: int = 30) -> Dict[str, Any]:
        """按日期x模型聚合延迟/成本/成功率趋势"""
        since_iso = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        harness_repo = SupabaseRepository("decision_harness")
        io_repo = SupabaseRepository("model_io")

        harnesses = harness_repo.select_data(gte={"created_at": since_iso})
        if not harnesses:
            return {"dates": [], "models": []}
        harness_map = {h["id"]: h["created_at"][:10] for h in harnesses}
        harness_ids = list(harness_map.keys())

        io_rows = io_repo.select_data(in_={"harness_id": harness_ids})
        if not io_rows:
            return {"dates": [], "models": []}

        # Group by (date, model)
        groups = defaultdict(list)
        for r in io_rows:
            d = harness_map.get(r.get("harness_id"), "unknown")
            model = f"{r.get('model_provider')}:{r.get('model_name')}"
            groups[(d, model)].append(r)

        all_dates = sorted(set(k[0] for k in groups))
        model_data = defaultdict(list)
        for (d, model), rows in sorted(groups.items()):
            latencies = [r["latency_ms"] for r in rows if r.get("latency_ms") is not None]
            costs = [r["cost_usd"] for r in rows if r.get("cost_usd") is not None]
            success = sum(1 for r in rows if r.get("status") == "success")
            total = len(rows)
            model_data[model].append({
                "date": d,
                "latency": round(sum(latencies) / len(latencies)) if latencies else 0,
                "cost": round(sum(costs) / len(costs), 4) if costs else 0,
                "success_rate": round(success / total * 100, 1) if total > 0 else 0,
                "runs": total,
            })

        models = [{"name": name, "data": data} for name, data in model_data.items()]

        return {
            "dates": all_dates,
            "models": models,
        }

    async def get_cost_analysis(self) -> Dict[str, Any]:
        """每模型运营指标：延迟 / 成本 / token / error rate"""
        io_repo = SupabaseRepository("model_io")
        io_rows = io_repo.select_data()

        if not io_rows:
            return {"models": []}

        # Group by model
        groups = defaultdict(list)
        for r in io_rows:
            model = f"{r.get('model_provider')}:{r.get('model_name')}"
            groups[model].append(r)

        models = []
        for name, rows in groups.items():
            latencies = [r["latency_ms"] for r in rows if r.get("latency_ms") is not None]
            costs = [r["cost_usd"] for r in rows if r.get("cost_usd") is not None]
            input_tokens = [r["input_token_count"] for r in rows if r.get("input_token_count") is not None]
            output_tokens = [r["output_token_count"] for r in rows if r.get("output_token_count") is not None]
            total_runs = len(rows)
            error_count = sum(1 for r in rows if r.get("status") != "success")

            avg_latency = round(sum(latencies) / len(latencies)) if latencies else 0
            max_latency = max(latencies) if latencies else 0
            # Approximate p95 as avg + 0.5 * (max - avg)
            p95_latency = round(avg_latency + (max_latency - avg_latency) * 0.5) if latencies else 0

            models.append({
                "name": name,
                "avg_latency": avg_latency,
                "p95_latency": p95_latency,
                "avg_cost": round(sum(costs) / len(costs), 4) if costs else 0,
                "total_cost": round(sum(costs), 2) if costs else 0,
                "avg_input_tokens": round(sum(input_tokens) / len(input_tokens)) if input_tokens else 0,
                "avg_output_tokens": round(sum(output_tokens) / len(output_tokens)) if output_tokens else 0,
                "total_runs": total_runs,
                "error_rate": round(error_count / total_runs * 100, 1) if total_runs > 0 else 0,
            })

        return {"models": models}

    async def get_counterfactual_summary(self) -> Dict[str, Any]:
        """反事实对比：adopted vs missed 平均收益"""
        cf_repo = SupabaseRepository("counterfactual")
        io_repo = SupabaseRepository("model_io")

        cf_rows = cf_repo.select_data()
        if not cf_rows:
            return {"models": []}

        # Get all model_io IDs
        io_ids = list(set(r["model_io_id"] for r in cf_rows if r.get("model_io_id")))
        io_rows = io_repo.select_data(in_={"id": io_ids})
        io_map = {r["id"]: f"{r['model_provider']}:{r['model_name']}" for r in io_rows}

        # Group by (model, was_adopted)
        groups = defaultdict(lambda: {"returns": [], "count": 0})
        for r in cf_rows:
            model = io_map.get(r.get("model_io_id"), "unknown")
            adopted = r.get("was_adopted", False)
            key = (model, adopted)
            groups[key]["returns"].append(r.get("hypothetical_return_pct", 0) or 0)
            groups[key]["count"] += 1

        # Aggregate per model
        model_agg = defaultdict(lambda: {
            "adopted_avg_return": 0, "adopted_count": 0,
            "missed_avg_return": 0, "missed_count": 0,
        })
        for (model, adopted), data in groups.items():
            avg_ret = round(sum(data["returns"]) / len(data["returns"]), 2) if data["returns"] else 0
            if adopted:
                model_agg[model]["adopted_avg_return"] = avg_ret
                model_agg[model]["adopted_count"] = data["count"]
            else:
                model_agg[model]["missed_avg_return"] = avg_ret
                model_agg[model]["missed_count"] = data["count"]

        models = []
        for name, agg in model_agg.items():
            models.append({
                "name": name,
                "adopted_avg_return": agg["adopted_avg_return"],
                "adopted_count": agg["adopted_count"],
                "missed_avg_return": agg["missed_avg_return"],
                "missed_count": agg["missed_count"],
                "opportunity_cost": round(agg["missed_avg_return"] - agg["adopted_avg_return"], 2),
            })

        return {"models": models}


_evaluation_service: Optional[EvaluationService] = None


def get_evaluation_service() -> EvaluationService:
    global _evaluation_service
    if _evaluation_service is None:
        _evaluation_service = EvaluationService()
    return _evaluation_service
