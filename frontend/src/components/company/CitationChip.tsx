import { useState, useRef } from 'react';
import { Box, Popper, Paper, Typography, ClickAwayListener, Fade } from '@mui/material';
import { ExternalLink } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import type { DataPoint } from '../../api/company';

interface Props {
  ids: number[];
  catalog: Record<string, DataPoint>;
}

/**
 * Renders a group of citation IDs as a compact chip cluster like
 * `⁽¹·³·⁷⁾`. Click reveals a popover showing each cited source with publisher,
 * published_at, excerpt, and an outbound link.
 */
export default function CitationChip({ ids, catalog }: Props) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  if (!ids || ids.length === 0) return null;

  // Resolve catalog entries; drop missing ids
  const points: DataPoint[] = ids
    .map((id) => catalog[String(id)] ?? catalog[id as unknown as string])
    .filter((p): p is DataPoint => !!p);

  // If no resolved sources, render as a "broken" indicator (orphan citation)
  const allMissing = points.length === 0;

  // Confidence color
  const colorOf = (c: DataPoint['confidence']) =>
    c === 'high' ? '#22c55e' : c === 'medium' ? '#f59e0b' : '#ef4444';

  return (
    <>
      <Box
        component="sup"
        ref={anchorRef as any}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        data-ui="true"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          ml: 0.25,
          px: 0.5,
          py: 0.05,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.65em',
          fontFamily: "Inter, -apple-system, sans-serif",
          fontWeight: 600,
          letterSpacing: 0,
          color: allMissing ? '#ef4444' : theme.brand.primary,
          bgcolor: allMissing ? 'rgba(239,68,68,0.08)' : `${theme.brand.primary}10`,
          border: `1px solid ${allMissing ? 'rgba(239,68,68,0.3)' : theme.brand.primary + '30'}`,
          transition: 'all 0.12s',
          verticalAlign: 'super',
          lineHeight: 1.2,
          '&:hover': {
            bgcolor: allMissing ? 'rgba(239,68,68,0.15)' : `${theme.brand.primary}20`,
          },
        }}
      >
        {ids.join(',')}
      </Box>

      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="top-start"
        transition
        modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
        sx={{ zIndex: 1500, maxWidth: 460 }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={150}>
            <Paper
              sx={{
                bgcolor: theme.background.tertiary || theme.background.secondary,
                border: `1px solid ${theme.border.default}`,
                borderRadius: '8px',
                boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
                p: 1.5,
                minWidth: 320,
              }}
            >
              <ClickAwayListener onClickAway={() => setOpen(false)}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {allMissing && (
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: '#ef4444',
                        fontFamily: "Inter, -apple-system, sans-serif",
                        fontStyle: 'italic',
                      }}
                    >
                      Orphan citation: 模型引用了不存在的来源 ID {ids.join(', ')}（疑似幻觉）
                    </Typography>
                  )}
                  {points.map((dp) => (
                    <Box
                      key={dp.id}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.25,
                        pb: 1,
                        '&:not(:last-child)': {
                          borderBottom: `1px dashed ${theme.border.subtle}`,
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <Box
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 22,
                            height: 18,
                            px: 0.5,
                            borderRadius: '4px',
                            bgcolor: `${theme.brand.primary}15`,
                            color: theme.brand.primary,
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: "Inter, -apple-system, sans-serif",
                            fontFeatureSettings: '"tnum"',
                          }}
                        >
                          {dp.id}
                        </Box>
                        <Typography
                          sx={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: theme.text.primary,
                            fontFamily: "Inter, -apple-system, sans-serif",
                          }}
                        >
                          {dp.publisher || dp.source_type}
                        </Typography>
                        {dp.published_at && (
                          <Typography
                            sx={{
                              fontSize: 10,
                              color: theme.text.muted,
                              fontFeatureSettings: '"tnum"',
                              fontFamily: "Inter, -apple-system, sans-serif",
                            }}
                          >
                            {dp.published_at.slice(0, 10)}
                          </Typography>
                        )}
                        <Box
                          sx={{
                            ml: 'auto',
                            px: 0.5,
                            borderRadius: '3px',
                            bgcolor: `${colorOf(dp.confidence)}18`,
                            color: colorOf(dp.confidence),
                            fontSize: 9,
                            fontWeight: 700,
                            fontFamily: "Inter, -apple-system, sans-serif",
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            lineHeight: 1.6,
                          }}
                        >
                          {dp.confidence}
                        </Box>
                      </Box>

                      <Typography
                        sx={{
                          fontSize: 10.5,
                          color: theme.text.disabled,
                          fontFamily: "Inter, -apple-system, sans-serif",
                          letterSpacing: '0.02em',
                        }}
                      >
                        {dp.key}
                      </Typography>

                      {dp.excerpt && (
                        <Typography
                          sx={{
                            fontSize: 11.5,
                            color: theme.text.secondary,
                            fontFamily: "'Times New Roman', 'SimSun', '宋体', Georgia, serif",
                            lineHeight: 1.5,
                            mt: 0.25,
                          }}
                        >
                          "{dp.excerpt}"
                        </Typography>
                      )}

                      {dp.source_url && (
                        <a
                          href={dp.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: theme.brand.primary,
                            textDecoration: 'none',
                            fontSize: 10.5,
                            fontFamily: "Inter, -apple-system, sans-serif",
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            marginTop: 2,
                            wordBreak: 'break-all',
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
                            {dp.source_url}
                          </span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </Box>
                  ))}
                </Box>
              </ClickAwayListener>
            </Paper>
          </Fade>
        )}
      </Popper>
    </>
  );
}

/**
 * Render a "[src:none]" marker — used by the model when it explicitly admits
 * a claim is inferential and not source-backed.
 */
export function NoSourceChip() {
  const { theme } = useTheme();
  return (
    <Box
      component="sup"
      data-ui="true"
      title="模型标注：此判断是推理性的，无具体数据支持"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        ml: 0.25,
        px: 0.5,
        py: 0.05,
        borderRadius: '4px',
        fontSize: '0.65em',
        fontFamily: "Inter, -apple-system, sans-serif",
        fontWeight: 600,
        color: theme.text.disabled,
        bgcolor: `${theme.text.disabled}10`,
        border: `1px dashed ${theme.text.disabled}40`,
        verticalAlign: 'super',
        lineHeight: 1.2,
      }}
    >
      推理
    </Box>
  );
}
