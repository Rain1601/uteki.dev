import { useMemo, useState } from 'react';
import { Box, Collapse, Typography } from '@mui/material';
import { ChevronDown, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import type { ToolCallRecord } from '../../api/company';

interface ParsedHit {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
}

/**
 * Extracts URL hits from a tool_result text string. The backend formats web_search
 * results as `- {title} [发布: YYYY-MM-DD]: {snippet} ({url})` per line. We parse
 * out URL, title, snippet, and the optional published_at tag.
 *
 * Falls back to "raw text only" when no URL pattern matches (e.g. compare_peers).
 */
function parseHits(text: string): ParsedHit[] {
  if (!text) return [];
  const hits: ParsedHit[] = [];
  // Greedy match for URLs at end of each line in parens
  const lineRe = /^- (.+?)(\s*\[发布:\s*([^\]]+)\])?: (.+?)\s*\((https?:\/\/[^\s)]+)\)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text)) !== null) {
    hits.push({
      title: m[1].trim(),
      publishedAt: m[3] ? m[3].trim() : null,
      snippet: m[4].trim(),
      url: m[5].trim(),
    });
  }
  return hits;
}

interface Props {
  toolCalls: ToolCallRecord[];
  /** When true, the panel auto-expands. Default: false. */
  defaultOpen?: boolean;
}

export default function SourcesPanel({ toolCalls, defaultOpen = false }: Props) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  const calls = useMemo(() => toolCalls || [], [toolCalls]);
  const totalHits = useMemo(
    () => calls.reduce((acc, c) => acc + parseHits(c.tool_result_full || c.tool_result || '').length, 0),
    [calls],
  );

  if (calls.length === 0) return null;

  return (
    <Box
      data-ui="true"
      sx={{
        mt: 1.5,
        borderTop: `1px dashed ${theme.border.subtle}`,
        pt: 1,
      }}
    >
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.6,
          cursor: 'pointer',
          color: theme.text.disabled,
          fontSize: 10.5,
          fontFamily: "Inter, -apple-system, sans-serif",
          letterSpacing: '0.03em',
          '&:hover': { color: theme.text.muted },
        }}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>
          Sources Used
        </span>
        <Typography
          component="span"
          sx={{ fontSize: 10, color: theme.text.disabled, fontFeatureSettings: '"tnum"' }}
        >
          {calls.length} call{calls.length === 1 ? '' : 's'}
          {totalHits > 0 ? ` · ${totalHits} hits` : ''}
        </Typography>
      </Box>

      <Collapse in={open} timeout={180}>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {calls.map((call, i) => {
            const hits = parseHits(call.tool_result_full || call.tool_result || '');
            const queryStr =
              call.tool_args?.query
              || (Array.isArray(call.tool_args?.metrics) ? call.tool_args.metrics.join(', ') : '')
              || '';
            return (
              <Box
                key={`${call.tool_name}-${i}`}
                sx={{
                  fontFamily: "Inter, -apple-system, sans-serif",
                  bgcolor: theme.background.secondary,
                  border: `1px solid ${theme.border.subtle}`,
                  borderRadius: '6px',
                  px: 1.25,
                  py: 0.75,
                }}
              >
                {/* Tool call header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Search size={10} color={theme.text.muted} />
                  <Typography
                    sx={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: theme.text.secondary,
                      fontFamily: 'inherit',
                    }}
                  >
                    {call.tool_name}
                  </Typography>
                  {queryStr && (
                    <Typography
                      sx={{
                        fontSize: 10.5,
                        color: theme.text.muted,
                        fontFamily: 'inherit',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      "{queryStr}"
                    </Typography>
                  )}
                  <Typography
                    sx={{
                      fontSize: 9.5,
                      color: theme.text.disabled,
                      fontFeatureSettings: '"tnum"',
                      flexShrink: 0,
                    }}
                  >
                    R{call.round}
                  </Typography>
                </Box>

                {/* Hits */}
                {hits.length > 0 ? (
                  <Box sx={{ mt: 0.5, ml: 1.75, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                    {hits.map((h, hi) => (
                      <Box
                        key={hi}
                        sx={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 0.5,
                          fontSize: 10.5,
                          lineHeight: 1.4,
                        }}
                      >
                        <a
                          href={h.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: theme.brand.primary,
                            textDecoration: 'none',
                            fontWeight: 500,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 2,
                            flexShrink: 0,
                            maxWidth: '40%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={h.url}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {h.title || new URL(h.url).hostname}
                          </span>
                          <ExternalLink size={9} style={{ flexShrink: 0 }} />
                        </a>
                        {h.publishedAt && (
                          <Typography
                            component="span"
                            sx={{
                              fontSize: 9.5,
                              color: theme.text.disabled,
                              fontFeatureSettings: '"tnum"',
                              flexShrink: 0,
                            }}
                          >
                            {h.publishedAt.slice(0, 10)}
                          </Typography>
                        )}
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 10.5,
                            color: theme.text.muted,
                            fontFamily: 'inherit',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          — {h.snippet}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Typography
                    sx={{
                      mt: 0.4,
                      ml: 1.75,
                      fontSize: 10,
                      color: theme.text.disabled,
                      fontStyle: 'italic',
                      fontFamily: 'inherit',
                    }}
                  >
                    (无可解析的 URL — 可能是 compare_peers 或纯文本响应)
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}
