import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function AnimatedCard({ children, className, style }: AnimatedCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, transition: { duration: 0.2, ease: 'easeOut' } }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}
