"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Word-by-word reveal: each word rises out of a clipped mask.
 *
 * Fires on MOUNT (not whileInView): a masked word pre-clips itself out of view,
 * which would starve an IntersectionObserver and deadlock the reveal. This is
 * built for above-the-fold headlines, so mount-time is also the right trigger.
 * Reduced-motion users get plain, fully-visible text.
 *
 * `start` offsets the cascade so multiple lines stagger; words carry aria-hidden
 * and the container an aria-label, so AT reads the line once, not word-by-word.
 */
export function SplitText({
  text,
  className,
  start = 0,
  gap = 0.05,
}: {
  text: string;
  className?: string;
  start?: number;
  gap?: number;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");

  if (reduce) {
    return <span className={cn("inline-block", className)}>{text}</span>;
  }

  return (
    <span aria-label={text} className={cn("inline-flex flex-wrap gap-x-[0.26em]", className)}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden className="inline-flex overflow-hidden pb-[0.14em]">
          <motion.span
            className="inline-block"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.8, delay: start + i * gap, ease: [0.16, 1, 0.3, 1] }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
