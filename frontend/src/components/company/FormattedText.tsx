import React from 'react';
import { Box, Typography } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import CitationChip, { NoSourceChip } from './CitationChip';
import type { DataPoint } from '../../api/company';

interface Props {
  text: string;
  theme: any;
  streaming?: boolean;
  /** When provided, [src:N] markers in the text are rendered as interactive chips. */
  catalog?: Record<string, DataPoint>;
}

/** Strip <thinking>...</thinking> blocks that DeepSeek/Qwen models emit. */
function stripThinking(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

/**
 * Walk ReactMarkdown children, replacing string nodes that contain [src:N]
 * markers with a mix of text spans and CitationChip / NoSourceChip components.
 */
function transformChildren(children: React.ReactNode, catalog: Record<string, DataPoint>): React.ReactNode {
  if (children == null) return children;
  if (typeof children === 'string') {
    const segs = splitOnCitations(children);
    if (segs.length === 1 && segs[0].kind === 'text') return children;
    return segs.map((seg, i) => {
      if (seg.kind === 'text') return <span key={i}>{seg.value}</span>;
      if (seg.kind === 'none') return <NoSourceChip key={i} />;
      return <CitationChip key={i} ids={seg.ids} catalog={catalog} />;
    });
  }
  if (Array.isArray(children)) {
    return children.map((c, i) => (
      <span key={i}>{transformChildren(c, catalog)}</span>
    ));
  }
  // For React elements (e.g. <strong>), pass through — their own children
  // will be transformed by ReactMarkdown's component override.
  return children;
}

const CITATION_RE = /\[src:\s*([0-9, ]+|none)\s*\]/gi;

/** Split a string on [src:N] markers; returns alternating text/citation segments. */
type Segment = { kind: 'text'; value: string } | { kind: 'cite'; ids: number[] } | { kind: 'none' };
function splitOnCitations(s: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(s)) !== null) {
    if (m.index > last) out.push({ kind: 'text', value: s.slice(last, m.index) });
    const body = m[1].trim().toLowerCase();
    if (body === 'none') {
      out.push({ kind: 'none' });
    } else {
      const ids = body
        .split(',')
        .map((p) => parseInt(p.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      if (ids.length) out.push({ kind: 'cite', ids });
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', value: s.slice(last) });
  return out;
}

/** Renders raw LLM text — full markdown in static mode, plain text in streaming mode */
export default function FormattedText({ text, theme, streaming, catalog }: Props) {
  const cleaned = streaming ? text : stripThinking(text);
  if (streaming) {
    // Streaming: plain text to avoid half-parsed markdown flicker
    return (
      <>
        {cleaned.split('\n').map((line, i) => {
          const trimmed = line.trim();
          if (!trimmed) return <Box key={`br-${i}`} sx={{ height: 6 }} />;
          return (
            <Typography
              key={`s-${i}`}
              sx={{ fontSize: 13, color: theme.text.secondary, lineHeight: 1.7, wordBreak: 'break-word' }}
            >
              {trimmed}
            </Typography>
          );
        })}
      </>
    );
  }

  // Static: full markdown rendering
  return (
    <Box
      sx={{
        fontSize: '1rem',
        color: theme.text.secondary,
        lineHeight: 1.8,
        wordBreak: 'break-word',
        fontFamily: "'Times New Roman', 'SimSun', '宋体', Georgia, serif",
        '& p': { m: 0, mb: 1, '&:last-child': { mb: 0 } },
        '& h1': { fontSize: 16, fontWeight: 700, color: theme.text.primary, mt: 2, mb: 1 },
        '& h2': { fontSize: 15, fontWeight: 700, color: theme.text.primary, mt: 1.5, mb: 0.75 },
        '& h3': { fontSize: 14, fontWeight: 600, color: theme.text.primary, mt: 1, mb: 0.5 },
        '& h4': { fontSize: 13, fontWeight: 600, color: theme.text.primary, mt: 0.75, mb: 0.25 },
        '& ul, & ol': { m: 0, pl: 2.5, py: 0.3 },
        '& li': { lineHeight: 1.8, py: 0.1 },
        '& strong': { fontWeight: 700, color: theme.text.primary },
        '& em': { fontStyle: 'italic' },
        '& code': {
          bgcolor: `${theme.text.muted}10`,
          color: theme.brand.secondary || theme.brand.primary,
          px: 0.75, py: 0.15, borderRadius: '4px',
          fontSize: '0.9em', fontFamily: 'Monaco, Consolas, monospace',
        },
        '& pre': {
          m: '0.75em 0', p: 1.5, borderRadius: '8px',
          bgcolor: `${theme.text.muted}08`, overflow: 'auto',
          '& code': { bgcolor: 'transparent', p: 0, borderRadius: 0, fontSize: '0.85em' },
        },
        '& blockquote': {
          borderLeft: `3px solid ${theme.brand.primary}`,
          pl: 1.5, ml: 0, my: 1,
          color: theme.text.muted, fontStyle: 'italic',
        },
        '& table': { borderCollapse: 'collapse', width: '100%', my: 1 },
        '& th, & td': {
          border: `1px solid ${theme.border.default}`,
          px: 1.5, py: 0.75, textAlign: 'left', fontSize: 12,
        },
        '& th': { bgcolor: theme.background.tertiary, fontWeight: 600 },
        '& a': { color: theme.brand.primary, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
        '& hr': { border: 'none', borderTop: `1px solid ${theme.border.subtle}`, my: 1.5 },
      }}
    >
      <ReactMarkdown
        components={catalog ? {
          // Replace plain text nodes by splitting on [src:N] markers.
          // ReactMarkdown's `components` doesn't expose a 'text' override directly,
          // so we recursively walk children of every paragraph/list-item/etc and
          // transform string children inline.
          p: ({ children }) => <p>{transformChildren(children, catalog)}</p>,
          li: ({ children }) => <li>{transformChildren(children, catalog)}</li>,
          strong: ({ children }) => <strong>{transformChildren(children, catalog)}</strong>,
          em: ({ children }) => <em>{transformChildren(children, catalog)}</em>,
          h1: ({ children }) => <h1>{transformChildren(children, catalog)}</h1>,
          h2: ({ children }) => <h2>{transformChildren(children, catalog)}</h2>,
          h3: ({ children }) => <h3>{transformChildren(children, catalog)}</h3>,
          h4: ({ children }) => <h4>{transformChildren(children, catalog)}</h4>,
        } : undefined}
      >
        {cleaned}
      </ReactMarkdown>
    </Box>
  );
}
