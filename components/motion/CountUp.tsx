"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Counts from `from` to `to` once in view. Handles prefix/suffix/decimals. */
export function CountUp({
  to,
  from = 0,
  duration = 1.5,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: {
  to: number;
  from?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [val, setVal] = useState(from);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setVal(to);
      return;
    }
    const controls = animate(from, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, reduce, from, to, duration]);

  const formatted =
    decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString("en-US");

  return (
    <span ref={ref} className={cn("tabular", className)}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
