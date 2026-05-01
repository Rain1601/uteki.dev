/**
 * Company Agent Run Store — survives route changes.
 *
 * Each run is one analyzeCompanyStream SSE invocation. The store holds
 * everything Studio + Composing + Dossier need to render live progress:
 *   - currentGate, gateStatuses, gateResults
 *   - streamingTexts (per skill)
 *   - toolCalls (chronological list)
 *   - error / done flags
 *
 * Studio reads `runs.values()` and shows cards. Dossier (when an analysis
 * is running) reads `getByAnalysisId()` and renders the Composing view.
 *
 * The store does NOT persist to localStorage — refreshing the page kills
 * in-flight streams. That's fine; the backend records the analysis even
 * if the client disconnects, and the Studio's Filed view will show it
 * once it completes.
 */
import { create } from 'zustand';
import {
  analyzeCompanyStream,
  type CompanyProgressEvent,
  type GateResult,
} from '../api/company';

export interface ToolCallRecord {
  gate: number;
  skill: string;
  tool_name: string;
  tool_args?: Record<string, any>;
  ts: number;
}

export type GateStatus = 'pending' | 'running' | 'complete' | 'error' | 'timeout';

export interface RunningRun {
  id: string;
  analysisId: string | null;
  symbol: string;
  name: string;
  provider: string;
  asOf: string | null;
  startTime: number;
  currentGate: number; // 0..7 (0 = data loading)
  gateStatuses: Record<number, GateStatus>;
  gateResults: Record<string, GateResult>;
  streamingTexts: Record<string, string>;
  toolCalls: ToolCallRecord[];
  error: string | null;
  done: boolean;
  cancel: () => void;
}

interface State {
  runs: Map<string, RunningRun>;
  start: (params: { symbol: string; name?: string; provider: string; asOf?: string }) => string;
  abort: (runId: string) => void;
  removeRun: (runId: string) => void;
  getByAnalysisId: (analysisId: string) => RunningRun | null;
}

export const useCompanyAgentRunStore = create<State>((set, get) => ({
  runs: new Map(),

  start: ({ symbol, name, provider, asOf }) => {
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const initial: RunningRun = {
      id: runId,
      analysisId: null,
      symbol,
      name: name ?? symbol,
      provider,
      asOf: asOf ?? null,
      startTime: Date.now(),
      currentGate: 0,
      gateStatuses: {},
      gateResults: {},
      streamingTexts: {},
      toolCalls: [],
      error: null,
      done: false,
      cancel: () => {},
    };
    set((s) => {
      const next = new Map(s.runs);
      next.set(runId, initial);
      return { runs: next };
    });

    const updateRun = (updater: (r: RunningRun) => RunningRun) => {
      set((s) => {
        const r = s.runs.get(runId);
        if (!r) return s;
        const next = new Map(s.runs);
        next.set(runId, updater(r));
        return { runs: next };
      });
    };

    const stream = analyzeCompanyStream(
      { symbol, provider, ...(asOf ? { as_of: asOf } : {}) },
      (event: CompanyProgressEvent) => {
        switch (event.type) {
          case 'data_loaded':
            updateRun((r) => ({
              ...r,
              analysisId: event.analysis_id ?? null,
              name: event.company_name ?? r.name,
            }));
            break;

          case 'gate_start':
            if (event.gate) {
              updateRun((r) => ({
                ...r,
                currentGate: event.gate!,
                gateStatuses: { ...r.gateStatuses, [event.gate!]: 'running' as GateStatus },
              }));
            }
            break;

          case 'gate_text':
            if (event.skill && event.text) {
              updateRun((r) => ({
                ...r,
                streamingTexts: {
                  ...r.streamingTexts,
                  [event.skill!]: (r.streamingTexts[event.skill!] || '') + event.text!,
                },
              }));
            }
            break;

          case 'tool_call':
            if (event.tool_name && event.skill && event.gate) {
              const tc: ToolCallRecord = {
                gate: event.gate,
                skill: event.skill,
                tool_name: event.tool_name,
                tool_args: event.tool_args,
                ts: Date.now(),
              };
              updateRun((r) => ({ ...r, toolCalls: [...r.toolCalls, tc] }));
            }
            break;

          case 'gate_complete':
            if (event.gate && event.skill) {
              const status: GateStatus =
                event.parse_status === 'timeout' ? 'timeout' :
                event.parse_status === 'error' ? 'error' : 'complete';
              updateRun((r) => {
                const newResults = { ...r.gateResults };
                newResults[event.skill!] = {
                  gate: event.gate!,
                  display_name: event.display_name ?? '',
                  parsed: event.parsed ?? {},
                  parse_status: (event.parse_status as any) ?? 'text',
                  latency_ms: event.latency_ms ?? 0,
                  error: event.error,
                  raw: event.raw ?? '',
                };
                // Cascade final_verdict's nested gates back to their slots
                if (event.skill === 'final_verdict' && event.parsed) {
                  for (const sn of [
                    'business_analysis', 'fisher_qa', 'moat_assessment',
                    'management_assessment', 'reverse_test', 'valuation',
                  ]) {
                    const gateData = (event.parsed as any)[sn];
                    if (gateData && typeof gateData === 'object' && newResults[sn]) {
                      newResults[sn] = { ...newResults[sn], parsed: gateData, parse_status: 'structured' };
                    }
                  }
                }
                const newStreamingTexts = { ...r.streamingTexts };
                delete newStreamingTexts[event.skill!];
                return {
                  ...r,
                  gateStatuses: { ...r.gateStatuses, [event.gate!]: status },
                  gateResults: newResults,
                  streamingTexts: newStreamingTexts,
                };
              });
            }
            break;

          case 'result':
            updateRun((r) => ({ ...r, done: true }));
            break;

          case 'error':
            updateRun((r) => ({ ...r, error: event.message ?? 'Stream failed' }));
            break;
        }
      },
    );

    updateRun((r) => ({ ...r, cancel: stream.cancel }));
    return runId;
  },

  abort: (runId) => {
    const r = get().runs.get(runId);
    if (r) r.cancel();
    set((s) => {
      const next = new Map(s.runs);
      next.delete(runId);
      return { runs: next };
    });
  },

  removeRun: (runId) => {
    set((s) => {
      const next = new Map(s.runs);
      next.delete(runId);
      return { runs: next };
    });
  },

  getByAnalysisId: (analysisId) => {
    for (const r of get().runs.values()) {
      if (r.analysisId === analysisId) return r;
    }
    return null;
  },
}));
