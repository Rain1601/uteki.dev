import { Box } from '@mui/material';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const SHIMMER_KEYFRAMES = `
@keyframes dash-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

interface ShimmerLineProps {
  width?: number | string;
  height?: number;
  radius?: number;
  delay?: number;
  theme: any;
}

export function ShimmerLine({
  width = '100%',
  height = 12,
  radius = 4,
  delay = 0,
  theme,
}: ShimmerLineProps) {
  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: radius / 4,
        background: `linear-gradient(90deg, ${theme.background.tertiary} 0%, ${theme.background.tertiary} 40%, rgba(255,255,255,0.14) 50%, ${theme.background.tertiary} 60%, ${theme.background.tertiary} 100%)`,
        backgroundSize: '300% 100%',
        animation: `dash-shimmer 1.6s ease-in-out ${delay}s infinite`,
      }}
    />
  );
}

export function ShimmerStyles() {
  return <style>{SHIMMER_KEYFRAMES}</style>;
}

interface FadeInProps {
  show: boolean;
  delay?: number;
  children: ReactNode;
}

export function FadeIn({ show, delay = 0, children }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
      transition={{ duration: 0.22, delay, ease: 'easeOut' }}
      style={{ display: 'contents' }}
    >
      {children}
    </motion.div>
  );
}
