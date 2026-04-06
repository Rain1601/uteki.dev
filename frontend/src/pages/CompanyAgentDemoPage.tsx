import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'config' | 'running' | 'result';
type GateState = 'pending' | 'running' | 'complete';

interface GateData {
  id: number;
  name: string;
  duration: number; // ms
  summary: string;
  detail: string;
  metrics?: { label: string; value: string }[];
  scores?: { label: string; value: number; max: number }[];
  toolCalls?: string[];
  reflectionAfter?: string;
}

interface ModelOption {
  id: string;
  provider: string;
  name: string;
  speed: string;
  cost: string;
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const T = {
  bg: '#FAF8F4',
  card: '#FFFFFF',
  borderLight: '#F0EDE9',
  borderMed: '#E8E5E1',
  accent: '#D97149',
  accentHover: '#C45A33',
  accentBg: '#FFF4F0',
  textHeading: '#000000',
  textBody: '#333333',
  textMuted: '#777777',
  fontUI: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  fontReading: "'Times New Roman', 'SimSun', serif",
  fontCode: "'SF Mono', Monaco, monospace",
  btnPrimaryBg: '#000000',
  btnPrimaryText: '#FAF8F4',
  green: '#2E7D32',
  greenBg: '#F0FAF0',
  greenBorder: '#C8E6C9',
};

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MODELS: ModelOption[] = [
  { id: 'deepseek-chat', provider: 'DeepSeek', name: 'deepseek-chat', speed: 'Fast', cost: '$0.14/M' },
  { id: 'claude-sonnet-4', provider: 'Anthropic', name: 'claude-sonnet-4', speed: 'Medium', cost: '$3/M' },
  { id: 'gpt-4.1', provider: 'OpenAI', name: 'gpt-4.1', speed: 'Medium', cost: '$2/M' },
  { id: 'gemini-2.5-flash', provider: 'Google', name: 'gemini-2.5-flash', speed: 'Fast', cost: '$0.15/M' },
  { id: 'qwen-plus', provider: 'Alibaba', name: 'qwen-plus', speed: 'Fast', cost: '$0.80/M' },
];

const GATES: GateData[] = [
  {
    id: 1,
    name: 'Business Analysis',
    duration: 3000,
    summary: 'Apple demonstrates exceptional business quality with diversified revenue across hardware, services, and ecosystem.',
    detail: 'Apple Inc. operates one of the most valuable business franchises in history. The company generates revenue across five major segments: iPhone (52%), Services (22%), Mac (10%), iPad (8%), and Wearables (8%). The Services segment has become the key growth driver, delivering 16% YoY growth and reaching an annual run-rate of $85B. Gross margins for services exceed 70%, significantly higher than the hardware average of 36%. The installed base has crossed 2.2 billion active devices, providing a durable foundation for services monetization. Revenue for the trailing twelve months stands at $383B with net income of $97B, producing a return on equity above 150%.',
    metrics: [
      { label: 'Revenue (TTM)', value: '$383B' },
      { label: 'Services Growth', value: '16% YoY' },
      { label: 'Gross Margin', value: '45.9%' },
      { label: 'Active Devices', value: '2.2B' },
    ],
    toolCalls: ['web_search: AAPL 10-K 2024', 'calculate: segment revenue mix'],
  },
  {
    id: 2,
    name: 'Fisher 15-Point Quality',
    duration: 3000,
    summary: 'Scores 13/15 on Fisher criteria. Strong on R&D, sales organization, and management depth.',
    detail: 'Applying Philip Fisher\'s 15-point quality framework, Apple scores exceptionally well across most dimensions. The company\'s R&D spending of $29.9B funds both incremental product improvements and breakthrough initiatives in spatial computing (Vision Pro) and AI/ML. Apple\'s sales organization spans 525 retail stores globally with an industry-leading Net Promoter Score. Management depth is excellent with a clear succession pipeline. The two areas scoring below 8 are labor relations transparency (limited disclosure) and short-term profit emphasis vs. long-term investment balance.',
    scores: [
      { label: 'R&D Effectiveness', value: 9, max: 10 },
      { label: 'Sales Organization', value: 9, max: 10 },
      { label: 'Management Depth', value: 8, max: 10 },
      { label: 'Profit Margins', value: 9, max: 10 },
      { label: 'Long-term Outlook', value: 8, max: 10 },
    ],
    toolCalls: ['web_search: AAPL R&D spending trends', 'recall_memory: fisher_criteria'],
  },
  {
    id: 3,
    name: 'Moat Assessment',
    duration: 4000,
    summary: 'Wide moat driven by ecosystem lock-in, brand premium, and services network effects.',
    detail: 'Apple possesses one of the widest economic moats in the technology sector. The ecosystem moat is the strongest: once a user owns an iPhone, Mac, AirPods, and Apple Watch, switching costs become extremely high due to iCloud, iMessage, AirDrop, and Continuity features. The brand commands a consistent 20-40% price premium over competitors while maintaining or growing market share. Services network effects are accelerating as the App Store, Apple Pay, and Apple TV+ create self-reinforcing loops. The moat has been widening over the past 5 years as Services revenue grew from $46B to $85B.',
    scores: [
      { label: 'Brand Premium', value: 9, max: 10 },
      { label: 'Ecosystem Lock-in', value: 9, max: 10 },
      { label: 'Network Effects', value: 7, max: 10 },
      { label: 'Switching Costs', value: 8, max: 10 },
    ],
    toolCalls: ['web_search: Apple ecosystem switching costs', 'calculate: brand premium vs peers'],
    reflectionAfter: 'Reflection checkpoint: No contradictions found. Gates 1-3 are consistent in portraying a high-quality business with durable competitive advantages.',
  },
  {
    id: 4,
    name: 'Management Quality',
    duration: 3000,
    summary: 'Tim Cook era marked by operational excellence and successful services pivot.',
    detail: 'Tim Cook has led Apple since 2011, overseeing the company\'s transformation from a hardware-centric business to a services powerhouse. Under his leadership, Apple\'s market cap grew from $350B to over $3T. Capital allocation has been exceptional: the company has returned over $800B to shareholders through buybacks and dividends while maintaining a fortress balance sheet. The management team shows strong integrity with conservative guidance and consistent execution. Succession planning is the weakest area, with limited visibility into the next CEO candidate, though the deep bench of SVPs (Craig Federighi, Jeff Williams) provides some reassurance.',
    scores: [
      { label: 'Integrity', value: 8, max: 10 },
      { label: 'Capital Allocation', value: 9, max: 10 },
      { label: 'Succession Planning', value: 7, max: 10 },
    ],
    toolCalls: ['web_search: Apple capital allocation history', 'web_search: Tim Cook leadership'],
  },
  {
    id: 5,
    name: 'Reverse DCF Test',
    duration: 4000,
    summary: 'Current price implies 8.2% revenue growth -- below analyst consensus of 10.5%.',
    detail: 'Running a reverse DCF analysis with a 10% discount rate and 3% terminal growth rate, the current share price of $198.45 implies the market expects 8.2% annual revenue growth over the next 10 years. This is notably below the analyst consensus estimate of 10.5% and Apple\'s own 5-year historical CAGR of 8.9%. The implied growth rate suggests the market is pricing in some headwinds (regulatory risk, China weakness) but is not fully accounting for the services growth trajectory. Bear case probability is estimated at 20%, where iPhone volumes decline and services growth decelerates to single digits.',
    metrics: [
      { label: 'Implied Growth', value: '8.2%' },
      { label: 'Consensus Growth', value: '10.5%' },
      { label: 'Bear Case Probability', value: '20%' },
      { label: 'Discount Rate Used', value: '10%' },
    ],
    toolCalls: ['calculate: reverse DCF model', 'web_search: AAPL analyst estimates'],
    reflectionAfter: 'Reflection checkpoint: All 5 gates consistent. High confidence proceeding to final valuation and verdict. No major red flags identified.',
  },
  {
    id: 6,
    name: 'Valuation',
    duration: 3000,
    summary: 'Fair value estimate $215-230 based on DCF and comparable analysis.',
    detail: 'Using a multi-method valuation approach: (1) DCF with 10.5% growth assumption yields $225 fair value, (2) Sum-of-parts valuation (hardware at 15x earnings + services at 30x earnings) yields $218, (3) Comparable analysis using peer group median multiples yields $230. The composite fair value range is $215-230, implying a 12-18% margin of safety at the current price of $198.45. Apple trades at 30x forward P/E versus the peer group median of 25x, but the premium is justified by superior profitability and growth visibility.',
    metrics: [
      { label: 'Fair Value Range', value: '$215 - $230' },
      { label: 'Safety Margin', value: '12 - 18%' },
      { label: 'Forward P/E', value: '30x' },
      { label: 'Peer Median P/E', value: '25x' },
    ],
    toolCalls: ['calculate: DCF model', 'calculate: sum-of-parts', 'web_search: tech sector P/E'],
  },
  {
    id: 7,
    name: 'Final Verdict',
    duration: 4000,
    summary: 'BUY with 78% conviction. Ecosystem moat and services growth justify current entry.',
    detail: '{"action": "BUY", "conviction": 78, "quality": "GOOD", "fair_value_low": 215, "fair_value_high": 230, "position_size": "4-6%", "thesis": "Apple\'s ecosystem moat and services growth justify a buy at current levels with a 12-18% margin of safety.", "risks": ["China regulatory headwinds", "iPhone cycle dependency", "Antitrust App Store risk"], "catalysts": ["AI integration across product line", "Services margin expansion", "India market penetration"]}',
    toolCalls: ['synthesize: final verdict JSON'],
  },
];

const PHILOSOPHERS = [
  {
    name: 'Buffett',
    quote: 'Wonderful company at a fair price. The services revenue stream provides the recurring economics I look for.',
  },
  {
    name: 'Fisher',
    quote: 'Strong on 12 of 15 quality points. R&D effectiveness and management depth are standout factors.',
  },
  {
    name: 'Munger',
    quote: 'The ecosystem creates the kind of competitive advantage that gets stronger over time. Avoid the temptation to trade it.',
  },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: '100vh',
    background: T.bg,
    fontFamily: T.fontUI,
    color: T.textBody,
    paddingBottom: 80,
  } as React.CSSProperties,
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '40px 24px',
  } as React.CSSProperties,
  card: {
    background: T.card,
    border: `1px solid ${T.borderLight}`,
    borderRadius: 4,
    padding: 24,
    marginBottom: 16,
  } as React.CSSProperties,
  sectionLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: T.textMuted,
    marginBottom: 12,
  } as React.CSSProperties,
  h1: {
    fontSize: 28,
    fontWeight: 600,
    color: T.textHeading,
    margin: 0,
    lineHeight: 1.3,
  } as React.CSSProperties,
  subtitle: {
    fontSize: 15,
    color: T.textMuted,
    marginTop: 6,
    marginBottom: 0,
  } as React.CSSProperties,
  input: {
    fontFamily: T.fontUI,
    fontSize: 15,
    padding: '10px 14px',
    border: `1px solid ${T.borderMed}`,
    borderRadius: 4,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    background: T.card,
    color: T.textBody,
    transition: 'border-color 0.2s ease',
  } as React.CSSProperties,
  btnPrimary: {
    fontFamily: T.fontUI,
    fontSize: 14,
    fontWeight: 600,
    padding: '12px 28px',
    background: T.btnPrimaryBg,
    color: T.btnPrimaryText,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
    letterSpacing: '0.01em',
  } as React.CSSProperties,
  btnSecondary: {
    fontFamily: T.fontUI,
    fontSize: 14,
    fontWeight: 500,
    padding: '10px 20px',
    background: 'transparent',
    color: T.textBody,
    border: `1px solid ${T.borderMed}`,
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'border-color 0.2s ease',
  } as React.CSSProperties,
  btnGhost: {
    fontFamily: T.fontUI,
    fontSize: 14,
    fontWeight: 500,
    padding: '10px 20px',
    background: 'transparent',
    color: T.textMuted,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  } as React.CSSProperties,
  chip: {
    display: 'inline-block',
    background: T.accentBg,
    color: T.accentHover,
    borderRadius: 16,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 500,
  } as React.CSSProperties,
  chipNeutral: {
    display: 'inline-block',
    background: '#F5F3F0',
    color: T.textMuted,
    borderRadius: 16,
    padding: '2px 10px',
    fontSize: 12,
    fontWeight: 500,
  } as React.CSSProperties,
  reading: {
    fontFamily: T.fontReading,
    fontSize: 16,
    lineHeight: 1.7,
    color: T.textBody,
  } as React.CSSProperties,
  code: {
    fontFamily: T.fontCode,
    fontSize: 12,
    background: '#F5F3F0',
    padding: '2px 6px',
    borderRadius: 3,
  } as React.CSSProperties,
};

// ─── Utility: streaming text hook ─────────────────────────────────────────────

function useStreamingText(text: string, active: boolean, speed = 30): string {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    if (!active) {
      indexRef.current = 0;
      setDisplayed('');
      return;
    }
    indexRef.current = 0;
    setDisplayed('');
    const interval = setInterval(() => {
      indexRef.current += 1;
      if (indexRef.current >= text.length) {
        setDisplayed(text);
        clearInterval(interval);
      } else {
        setDisplayed(text.slice(0, indexRef.current));
      }
    }, 1000 / speed);
    return () => clearInterval(interval);
  }, [text, active, speed]);

  return active ? displayed : '';
}

// ─── Pulse animation keyframes (injected once) ──────────────────────────────

const PULSE_CSS = `
@keyframes gatePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(217, 113, 73, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(217, 113, 73, 0); }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes cursorBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
`;

function injectCSS() {
  if (document.getElementById('company-demo-css')) return;
  const style = document.createElement('style');
  style.id = 'company-demo-css';
  style.textContent = PULSE_CSS;
  document.head.appendChild(style);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CompanyAgentDemoPage() {
  // Phase state machine
  const [phase, setPhase] = useState<Phase>('config');

  // Config state
  const [symbol, setSymbol] = useState('AAPL');
  const [selectedModel, setSelectedModel] = useState('deepseek-chat');

  // Running state
  const [gateStates, setGateStates] = useState<GateState[]>(
    GATES.map(() => 'pending')
  );
  const [currentGate, setCurrentGate] = useState(-1);
  const [showCompanyCard, setShowCompanyCard] = useState(false);
  const [expandedGates, setExpandedGates] = useState<Set<number>>(new Set());
  const [reflectionMessages, setReflectionMessages] = useState<string[]>([]);

  // Result state
  const [startTime] = useState(() => Date.now());
  const [totalLatency, setTotalLatency] = useState(0);

  // Refs
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gateCardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    injectCSS();
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  // ── Pipeline execution ──────────────────────────────────────────────────

  const runPipeline = useCallback(() => {
    setPhase('running');
    setGateStates(GATES.map(() => 'pending'));
    setCurrentGate(-1);
    setShowCompanyCard(false);
    setExpandedGates(new Set());
    setReflectionMessages([]);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    // Show company card after 1s
    const t0 = setTimeout(() => setShowCompanyCard(true), 1000);
    timersRef.current.push(t0);

    // Execute gates sequentially
    let cumulativeDelay = 1500; // start after company card
    GATES.forEach((gate, i) => {
      // Start gate
      const tStart = setTimeout(() => {
        setCurrentGate(i);
        setGateStates((prev) => {
          const next = [...prev];
          next[i] = 'running';
          return next;
        });
        // Scroll into view
        setTimeout(() => {
          gateCardsRef.current[i]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }, 100);
      }, cumulativeDelay);
      timersRef.current.push(tStart);

      // Complete gate
      const tEnd = setTimeout(() => {
        setGateStates((prev) => {
          const next = [...prev];
          next[i] = 'complete';
          return next;
        });
        // Show reflection if present
        if (gate.reflectionAfter) {
          setReflectionMessages((prev) => [...prev, gate.reflectionAfter!]);
        }
      }, cumulativeDelay + gate.duration);
      timersRef.current.push(tEnd);

      cumulativeDelay += gate.duration + 400; // 400ms gap between gates
    });

    // Transition to result
    const tResult = setTimeout(() => {
      setTotalLatency(
        GATES.reduce((s, g) => s + g.duration, 0) / 1000 + 1.5 + GATES.length * 0.4
      );
      setPhase('result');
    }, cumulativeDelay + 500);
    timersRef.current.push(tResult);
  }, []);

  const toggleGate = (idx: number) => {
    setExpandedGates((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const resetToConfig = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPhase('config');
    setGateStates(GATES.map(() => 'pending'));
    setCurrentGate(-1);
    setShowCompanyCard(false);
    setExpandedGates(new Set());
    setReflectionMessages([]);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      <div style={S.container}>
        {phase === 'config' && (
          <ConfigPhase
            symbol={symbol}
            setSymbol={setSymbol}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            onStart={runPipeline}
          />
        )}
        {phase === 'running' && (
          <RunningPhase
            symbol={symbol}
            gateStates={gateStates}
            currentGate={currentGate}
            showCompanyCard={showCompanyCard}
            expandedGates={expandedGates}
            toggleGate={toggleGate}
            reflectionMessages={reflectionMessages}
            gateCardsRef={gateCardsRef}
          />
        )}
        {phase === 'result' && (
          <ResultPhase
            symbol={symbol}
            selectedModel={selectedModel}
            totalLatency={totalLatency}
            expandedGates={expandedGates}
            toggleGate={toggleGate}
            onReset={resetToConfig}
          />
        )}
      </div>
    </div>
  );
}

// ─── Phase 1: Configuration ───────────────────────────────────────────────────

function ConfigPhase({
  symbol,
  setSymbol,
  selectedModel,
  setSelectedModel,
  onStart,
}: {
  symbol: string;
  setSymbol: (s: string) => void;
  selectedModel: string;
  setSelectedModel: (s: string) => void;
  onStart: () => void;
}) {
  return (
    <div style={{ animation: 'fadeInUp 0.3s ease' }}>
      <h1 style={S.h1}>Company Agent</h1>
      <p style={S.subtitle}>
        7-gate deep analysis pipeline for investment research
      </p>

      <div style={{ marginTop: 40 }}>
        <div style={S.sectionLabel}>Symbol</div>
        <div style={{ maxWidth: 280 }}>
          <input
            style={S.input}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            spellCheck={false}
          />
        </div>
      </div>

      <div style={{ marginTop: 32 }}>
        <div style={S.sectionLabel}>Model</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MODELS.map((m) => (
            <label
              key={m.id}
              style={{
                ...S.card,
                marginBottom: 0,
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                cursor: 'pointer',
                borderColor:
                  selectedModel === m.id ? T.accent : T.borderLight,
                transition: 'border-color 0.2s ease',
              }}
            >
              <input
                type="radio"
                name="model"
                checked={selectedModel === m.id}
                onChange={() => setSelectedModel(m.id)}
                style={{ accentColor: T.accent, width: 16, height: 16 }}
              />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 500, color: T.textHeading }}>
                  {m.name}
                </span>
                <span style={{ color: T.textMuted, marginLeft: 8, fontSize: 13 }}>
                  {m.provider}
                </span>
              </div>
              <span style={S.chip}>{m.speed}</span>
              <span style={S.chipNeutral}>{m.cost}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 36 }}>
        <button
          style={{
            ...S.btnPrimary,
            opacity: symbol.trim() ? 1 : 0.4,
            cursor: symbol.trim() ? 'pointer' : 'not-allowed',
          }}
          disabled={!symbol.trim()}
          onClick={onStart}
        >
          Start Analysis
        </button>
      </div>
    </div>
  );
}

// ─── Phase 2: Running ─────────────────────────────────────────────────────────

function RunningPhase({
  symbol,
  gateStates,
  currentGate,
  showCompanyCard,
  expandedGates,
  toggleGate,
  reflectionMessages,
  gateCardsRef,
}: {
  symbol: string;
  gateStates: GateState[];
  currentGate: number;
  showCompanyCard: boolean;
  expandedGates: Set<number>;
  toggleGate: (i: number) => void;
  reflectionMessages: string[];
  gateCardsRef: React.MutableRefObject<(HTMLDivElement | null)[]>;
}) {
  return (
    <div>
      {/* Stepper (sticky) */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: T.bg,
          paddingTop: 16,
          paddingBottom: 16,
          borderBottom: `1px solid ${T.borderLight}`,
          marginBottom: 24,
        }}
      >
        <GateStepper gateStates={gateStates} />
      </div>

      {/* Company info card */}
      {showCompanyCard && (
        <div style={{ ...S.card, animation: 'fadeInUp 0.3s ease' }}>
          <div style={S.sectionLabel}>Company</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px 32px',
            }}
          >
            <InfoRow label="Symbol" value={symbol} />
            <InfoRow label="Company" value="Apple Inc." />
            <InfoRow label="Sector" value="Technology" />
            <InfoRow label="Industry" value="Consumer Electronics" />
            <InfoRow label="Current Price" value="$198.45" />
            <InfoRow label="Data Freshness" value="Live data" />
          </div>
        </div>
      )}

      {/* Gate execution cards */}
      {GATES.map((gate, i) => {
        const state = gateStates[i];
        if (state === 'pending' && currentGate < i) return null;
        return (
          <div key={gate.id}>
            <div
              ref={(el) => { gateCardsRef.current[i] = el; }}
              style={{
                ...S.card,
                animation: 'fadeInUp 0.3s ease',
                borderColor:
                  state === 'running' ? T.accent : T.borderLight,
                transition: 'border-color 0.2s ease',
              }}
            >
              <GateCard
                gate={gate}
                state={state}
                expanded={expandedGates.has(i)}
                onToggle={() => toggleGate(i)}
              />
            </div>

            {/* Reflection checkpoint */}
            {gate.reflectionAfter && state === 'complete' && (
              <ReflectionCard message={gate.reflectionAfter} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Gate Stepper ─────────────────────────────────────────────────────────────

function GateStepper({ gateStates }: { gateStates: GateState[] }) {
  const reflectionAfterGates = new Set([2, 4]); // After gate 3 (index 2) and gate 5 (index 4)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {gateStates.map((state, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
          {/* Gate circle */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              transition: 'all 0.2s ease',
              ...(state === 'pending'
                ? {
                    background: '#F5F3F0',
                    color: T.textMuted,
                    border: `1px solid ${T.borderMed}`,
                  }
                : state === 'running'
                ? {
                    background: T.accent,
                    color: '#fff',
                    border: `1px solid ${T.accent}`,
                    animation: 'gatePulse 1.5s ease-in-out infinite',
                  }
                : {
                    background: T.textHeading,
                    color: T.btnPrimaryText,
                    border: `1px solid ${T.textHeading}`,
                  }),
            }}
          >
            {state === 'complete' ? (
              <span style={{ fontSize: 14 }}>&#10003;</span>
            ) : (
              i + 1
            )}
          </div>

          {/* Connector line */}
          {i < gateStates.length - 1 && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  width: reflectionAfterGates.has(i) ? 20 : 40,
                  height: 2,
                  background:
                    gateStates[i] === 'complete'
                      ? T.textHeading
                      : T.borderMed,
                  transition: 'background 0.2s ease',
                }}
              />
              {/* Reflection diamond */}
              {reflectionAfterGates.has(i) && (
                <>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      background:
                        gateStates[i] === 'complete'
                          ? T.accent
                          : T.borderMed,
                      transform: 'rotate(45deg)',
                      transition: 'background 0.2s ease',
                    }}
                  />
                  <div
                    style={{
                      width: 20,
                      height: 2,
                      background:
                        gateStates[i] === 'complete'
                          ? T.textHeading
                          : T.borderMed,
                      transition: 'background 0.2s ease',
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Gate Card (running / complete) ───────────────────────────────────────────

function GateCard({
  gate,
  state,
  expanded,
  onToggle,
}: {
  gate: GateData;
  state: GateState;
  expanded: boolean;
  onToggle: () => void;
}) {
  const streamedText = useStreamingText(gate.summary, state === 'running', 30);

  if (state === 'running') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: T.accent,
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {gate.id}
          </span>
          <span style={{ fontWeight: 600, color: T.textHeading }}>
            {gate.name}
          </span>
        </div>

        {/* Tool calls */}
        {gate.toolCalls && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginTop: 12,
              flexWrap: 'wrap',
            }}
          >
            {gate.toolCalls.map((tc, j) => (
              <span key={j} style={S.code}>
                {tc}
              </span>
            ))}
          </div>
        )}

        {/* Streaming text */}
        <p
          style={{
            ...S.reading,
            marginTop: 14,
            minHeight: 28,
          }}
        >
          {streamedText}
          <span
            style={{
              display: 'inline-block',
              width: 2,
              height: 16,
              background: T.accent,
              marginLeft: 2,
              verticalAlign: 'text-bottom',
              animation: 'cursorBlink 0.8s step-end infinite',
            }}
          />
        </p>
      </div>
    );
  }

  // Complete state
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
        }}
        onClick={onToggle}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: T.textHeading,
            color: T.btnPrimaryText,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          &#10003;
        </span>
        <span style={{ fontWeight: 600, color: T.textHeading, flex: 1 }}>
          {gate.name}
        </span>
        <span
          style={{
            color: T.textMuted,
            fontSize: 13,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            display: 'inline-block',
          }}
        >
          &#9660;
        </span>
      </div>

      {/* Summary line always visible */}
      <p
        style={{
          fontSize: 14,
          color: T.textMuted,
          margin: '8px 0 0 32px',
          lineHeight: 1.5,
        }}
      >
        {gate.summary}
      </p>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            marginTop: 16,
            marginLeft: 32,
            animation: 'fadeInUp 0.2s ease',
          }}
        >
          {gate.id !== 7 && (
            <p style={{ ...S.reading, margin: '0 0 16px 0' }}>{gate.detail}</p>
          )}

          {gate.id === 7 && (
            <pre
              style={{
                fontFamily: T.fontCode,
                fontSize: 13,
                background: '#F5F3F0',
                padding: 16,
                borderRadius: 4,
                overflowX: 'auto',
                lineHeight: 1.6,
                margin: '0 0 16px 0',
              }}
            >
              {gate.detail}
            </pre>
          )}

          {/* Metrics */}
          {gate.metrics && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 8,
                marginBottom: 12,
              }}
            >
              {gate.metrics.map((m, j) => (
                <div
                  key={j}
                  style={{
                    background: '#FAFAF8',
                    border: `1px solid ${T.borderLight}`,
                    borderRadius: 4,
                    padding: '8px 12px',
                  }}
                >
                  <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 2 }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: T.textHeading }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Scores */}
          {gate.scores && (
            <div style={{ marginBottom: 12 }}>
              {gate.scores.map((s, j) => (
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 13, color: T.textBody, width: 160 }}>
                    {s.label}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: '#F0EDE9',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${(s.value / s.max) * 100}%`,
                        background: T.accent,
                        borderRadius: 3,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.textHeading, width: 40, textAlign: 'right' }}>
                    {s.value}/{s.max}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Tool calls */}
          {gate.toolCalls && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {gate.toolCalls.map((tc, j) => (
                <span key={j} style={S.code}>
                  {tc}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Reflection Card ──────────────────────────────────────────────────────────

function ReflectionCard({ message }: { message: string }) {
  return (
    <div
      style={{
        ...S.card,
        borderLeft: `3px solid ${T.accent}`,
        background: T.accentBg,
        animation: 'fadeInUp 0.3s ease',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          background: T.accent,
          color: '#fff',
          borderRadius: 2,
          fontSize: 11,
          fontWeight: 700,
          transform: 'rotate(45deg)',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <span style={{ transform: 'rotate(-45deg)' }}>R</span>
      </span>
      <p style={{ margin: 0, fontSize: 14, color: T.accentHover, lineHeight: 1.5 }}>
        {message}
      </p>
    </div>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '4px 0' }}>
      <span style={{ fontSize: 13, color: T.textMuted, width: 100, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 500, color: T.textHeading }}>
        {value}
      </span>
    </div>
  );
}

// ─── Phase 3: Results ─────────────────────────────────────────────────────────

function ResultPhase({
  symbol,
  selectedModel,
  totalLatency,
  expandedGates,
  toggleGate,
  onReset,
}: {
  symbol: string;
  selectedModel: string;
  totalLatency: number;
  expandedGates: Set<number>;
  toggleGate: (i: number) => void;
  onReset: () => void;
}) {
  return (
    <div style={{ animation: 'fadeInUp 0.3s ease' }}>
      {/* Verdict Banner */}
      <div
        style={{
          ...S.card,
          padding: 32,
          borderColor: T.greenBorder,
          background: T.greenBg,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              background: T.green,
              color: '#fff',
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '0.05em',
              padding: '6px 20px',
              borderRadius: 4,
            }}
          >
            BUY
          </span>
          <div>
            <div style={{ fontSize: 13, color: T.textMuted }}>Conviction</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: T.textHeading }}>
              78%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: T.textMuted }}>Quality</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: T.textHeading }}>
              GOOD
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: T.textMuted }}>Position Size</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: T.textHeading }}>
              4-6%
            </div>
          </div>
        </div>
        <p
          style={{
            ...S.reading,
            marginTop: 16,
            marginBottom: 0,
            fontSize: 17,
          }}
        >
          Apple's ecosystem moat and services growth justify a buy at current
          levels with a 12-18% margin of safety.
        </p>
      </div>

      {/* Philosopher Comments */}
      <div style={{ marginTop: 24 }}>
        <div style={S.sectionLabel}>Philosopher Comments</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {PHILOSOPHERS.map((p) => (
            <div key={p.name} style={S.card}>
              <div
                style={{
                  fontWeight: 600,
                  color: T.textHeading,
                  marginBottom: 8,
                  fontSize: 14,
                }}
              >
                {p.name}
              </div>
              <p
                style={{
                  ...S.reading,
                  fontSize: 14,
                  margin: 0,
                  color: T.textBody,
                  fontStyle: 'italic',
                }}
              >
                "{p.quote}"
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Gate Summary Cards */}
      <div style={{ marginTop: 24 }}>
        <div style={S.sectionLabel}>Gate Analysis</div>
        {GATES.map((gate, i) => (
          <div key={gate.id} style={S.card}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
              onClick={() => toggleGate(i)}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: T.textHeading,
                  color: T.btnPrimaryText,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {gate.id}
              </span>
              <span style={{ fontWeight: 600, color: T.textHeading, flex: 1 }}>
                {gate.name}
              </span>

              {/* Score/rating chip */}
              {gate.scores && (
                <span style={S.chip}>
                  {gate.scores.reduce((s, v) => s + v.value, 0)}/
                  {gate.scores.reduce((s, v) => s + v.max, 0)}
                </span>
              )}

              <span
                style={{
                  color: T.textMuted,
                  fontSize: 13,
                  transform: expandedGates.has(i)
                    ? 'rotate(180deg)'
                    : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                  display: 'inline-block',
                }}
              >
                &#9660;
              </span>
            </div>

            <p
              style={{
                fontSize: 14,
                color: T.textMuted,
                margin: '8px 0 0 32px',
                lineHeight: 1.5,
              }}
            >
              {gate.summary}
            </p>

            {expandedGates.has(i) && (
              <div style={{ marginTop: 16, marginLeft: 32, animation: 'fadeInUp 0.2s ease' }}>
                {gate.id !== 7 ? (
                  <p style={{ ...S.reading, margin: '0 0 16px 0' }}>{gate.detail}</p>
                ) : (
                  <pre
                    style={{
                      fontFamily: T.fontCode,
                      fontSize: 13,
                      background: '#F5F3F0',
                      padding: 16,
                      borderRadius: 4,
                      overflowX: 'auto',
                      lineHeight: 1.6,
                      margin: '0 0 16px 0',
                    }}
                  >
                    {gate.detail}
                  </pre>
                )}

                {gate.metrics && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    {gate.metrics.map((m, j) => (
                      <div
                        key={j}
                        style={{
                          background: '#FAFAF8',
                          border: `1px solid ${T.borderLight}`,
                          borderRadius: 4,
                          padding: '8px 12px',
                        }}
                      >
                        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 2 }}>
                          {m.label}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: T.textHeading }}>
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {gate.scores && (
                  <div style={{ marginBottom: 12 }}>
                    {gate.scores.map((s, j) => (
                      <div
                        key={j}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          marginBottom: 6,
                        }}
                      >
                        <span style={{ fontSize: 13, color: T.textBody, width: 160 }}>
                          {s.label}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: 6,
                            background: '#F0EDE9',
                            borderRadius: 3,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${(s.value / s.max) * 100}%`,
                              background: T.accent,
                              borderRadius: 3,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.textHeading, width: 40, textAlign: 'right' }}>
                          {s.value}/{s.max}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <div
        style={{
          marginTop: 32,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <button style={S.btnPrimary}>Approve & Add to Watchlist</button>
        <button style={S.btnSecondary} onClick={onReset}>
          Run with Different Model
        </button>
        <button style={S.btnGhost}>Export PDF</button>
      </div>

      {/* Meta info */}
      <div
        style={{
          marginTop: 40,
          paddingTop: 20,
          borderTop: `1px solid ${T.borderLight}`,
          display: 'flex',
          gap: 32,
          flexWrap: 'wrap',
        }}
      >
        <MetaItem label="Model" value={selectedModel} />
        <MetaItem label="Total Latency" value={`${totalLatency.toFixed(1)}s`} />
        <MetaItem label="Token Usage" value="~12,400 tokens" />
        <MetaItem label="Data Freshness" value="Live" />
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: T.textHeading, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
