"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Infinite horizontal marquee. Pauses on hover. */
export function Marquee({
  children,
  className,
  duration = 26,
  reverse = false,
}: {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  reverse?: boolean;
}) {
  return (
    <div className={cn("group relative flex overflow-hidden", className)}>
      <motion.div
        className="flex shrink-0 items-center gap-[var(--gap,4rem)] pr-[var(--gap,4rem)] group-hover:[animation-play-state:paused]"
        animate={{ x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
}
