import { motion } from 'framer-motion';
import { ReactNode, Children } from 'react';

interface AnimatedListProps {
  children: ReactNode;
  staggerDelay?: number;
  className?: string;
  style?: React.CSSProperties;
}

const containerVariants = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
  },
};

export default function AnimatedList({ children, staggerDelay = 0.05, className, style }: AnimatedListProps) {
  const variants = staggerDelay !== 0.05
    ? { animate: { transition: { staggerChildren: staggerDelay } } }
    : containerVariants;

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      className={className}
      style={style}
    >
      {Children.map(children, (child) =>
        child ? (
          <motion.div variants={itemVariants}>
            {child}
          </motion.div>
        ) : null,
      )}
    </motion.div>
  );
}
