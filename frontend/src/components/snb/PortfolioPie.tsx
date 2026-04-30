import { useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';

interface Slice {
  symbol: string;
  value: number;
  pct: number;
  pnlPct?: number; // optional gain/loss for tone
}

interface Props {
  slices: Slice[];
  size?: number;
  totalLabel?: string;
  totalValue?: string;
}

/**
 * Editorial-style portfolio pie chart — SVG, no deps.
 *
 * Aesthetic decisions:
 * - Donut, not solid pie: leaves a center hole for the total figure
 * - Hairline 1px white separator between slices (newspaper info-graphic feel)
 * - Hover: that slice pops outward 4px radial — subtle, not bouncy
 * - Color palette: muted, magazine-grade — no rainbow saturation
 * - Total label uses Fraunces serif, value uses tabular mono
 * - Legend on the right: small caps eyebrow + name + tabular pct, ranked
 */
export default function PortfolioPie({
  slices,
  size = 220,
  totalLabel = 'Total Market Value',
  totalValue = '',
}: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // Editorial palette — no neon. Drawn from FT/Bloomberg print sections.
  const PALETTE = useMemo(
    () => [
      '#A8896E', // aged brass
      '#5B7B6A', // sage
      '#8B6F7E', // dried rose
      '#6F7B8C', // slate blue
      '#B89569', // ochre
      '#7E6F8B', // dusk plum
      '#9B7853', // umber
      '#5F7178', // graphite teal
    ],
    [],
  );

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 8;
  const innerRadius = radius * 0.62;
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);

  if (total === 0) {
    return (
      <Typography sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>
        no positions to display
      </Typography>
    );
  }

  // Sort largest → smallest so legend is ranked
  const ranked = [...slices].sort((a, b) => b.value - a.value);

  // Pre-compute arcs
  let cumAngle = -Math.PI / 2; // start at 12 o'clock
  const arcs = ranked.map((slice, i) => {
    const angle = (Math.max(0, slice.value) / total) * Math.PI * 2;
    const startAngle = cumAngle;
    const endAngle = cumAngle + angle;
    cumAngle = endAngle;

    const sx0 = cx + radius * Math.cos(startAngle);
    const sy0 = cy + radius * Math.sin(startAngle);
    const sx1 = cx + radius * Math.cos(endAngle);
    const sy1 = cy + radius * Math.sin(endAngle);
    const ix0 = cx + innerRadius * Math.cos(startAngle);
    const iy0 = cy + innerRadius * Math.sin(startAngle);
    const ix1 = cx + innerRadius * Math.cos(endAngle);
    const iy1 = cy + innerRadius * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    // Hover offset: shift the slice's outer arc out by 4px along its bisector
    const midAngle = (startAngle + endAngle) / 2;
    const off = activeIdx === i ? 4 : 0;
    const dx = Math.cos(midAngle) * off;
    const dy = Math.sin(midAngle) * off;

    const path = [
      `M ${ix0} ${iy0}`,
      `L ${sx0 + dx} ${sy0 + dy}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${sx1 + dx} ${sy1 + dy}`,
      `L ${ix1} ${iy1}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix0} ${iy0}`,
      'Z',
    ].join(' ');

    return {
      path,
      color: PALETTE[i % PALETTE.length],
      slice,
      pct: (slice.value / total) * 100,
    };
  });

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        flexWrap: 'wrap',
      }}
    >
      <Box sx={{ position: 'relative', flexShrink: 0 }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ display: 'block', overflow: 'visible' }}
        >
          {arcs.map((a, i) => (
            <path
              key={a.slice.symbol}
              d={a.path}
              fill={a.color}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={1}
              style={{
                transition: 'opacity 200ms cubic-bezier(0.2,0,0.2,1), filter 200ms',
                opacity: activeIdx === null || activeIdx === i ? 1 : 0.45,
                filter: activeIdx === i ? 'brightness(1.15)' : 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
            >
              <title>{`${a.slice.symbol}: $${a.slice.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${a.pct.toFixed(1)}%)`}</title>
            </path>
          ))}
        </svg>

        {/* Center label — editorial typography */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          {activeIdx !== null && arcs[activeIdx] ? (
            <>
              <Typography
                sx={{
                  fontFamily: "'Fraunces', 'Newsreader', Georgia, serif",
                  fontSize: 22,
                  fontWeight: 600,
                  fontStyle: 'italic',
                  letterSpacing: '-0.01em',
                  color: arcs[activeIdx].color,
                  lineHeight: 1.1,
                  fontVariationSettings: '"opsz" 144, "SOFT" 50',
                }}
              >
                {arcs[activeIdx].slice.symbol}
              </Typography>
              <Typography
                sx={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 13,
                  letterSpacing: 0,
                  color: 'rgba(244,236,223,0.75)',
                  fontFeatureSettings: '"tnum"',
                  mt: 0.25,
                }}
              >
                {arcs[activeIdx].pct.toFixed(1)}%
              </Typography>
            </>
          ) : (
            <>
              <Typography
                sx={{
                  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'rgba(244,236,223,0.45)',
                  mb: 0.4,
                }}
              >
                {totalLabel}
              </Typography>
              <Typography
                sx={{
                  fontFamily: "'Fraunces', 'Newsreader', Georgia, serif",
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'rgba(244,236,223,0.92)',
                  fontFeatureSettings: '"tnum"',
                  fontVariationSettings: '"opsz" 144, "SOFT" 30',
                  lineHeight: 1.1,
                }}
              >
                {totalValue}
              </Typography>
            </>
          )}
        </Box>
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6, minWidth: 140, flex: 1 }}>
        {arcs.map((a, i) => (
          <Box
            key={a.slice.symbol}
            onMouseEnter={() => setActiveIdx(i)}
            onMouseLeave={() => setActiveIdx(null)}
            sx={{
              display: 'grid',
              gridTemplateColumns: '8px 1fr auto',
              alignItems: 'baseline',
              columnGap: 1.25,
              py: 0.4,
              cursor: 'default',
              opacity: activeIdx === null || activeIdx === i ? 1 : 0.45,
              transition: 'opacity 200ms',
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '1px',
                bgcolor: a.color,
                alignSelf: 'center',
              }}
            />
            <Typography
              sx={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontStyle: 'italic',
                fontSize: 13,
                fontWeight: 500,
                color: 'rgba(244,236,223,0.92)',
                letterSpacing: '-0.005em',
                fontVariationSettings: '"opsz" 36',
              }}
            >
              {a.slice.symbol}
            </Typography>
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 11,
                fontWeight: 500,
                color: 'rgba(244,236,223,0.7)',
                fontFeatureSettings: '"tnum"',
              }}
            >
              {a.pct.toFixed(1)}%
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
