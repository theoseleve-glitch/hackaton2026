"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { registerGsap } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

export interface CounterProps {
  to: number;
  suffix?: string;
  durationMs?: number;
  className?: string;
}

/** Format an integer with a narrow no-break space as thousands separator (French style). */
function formatInt(n: number): string {
  if (n < 1000) return String(n);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Counts from 0 → `to` when scrolled into view.
 * Reduced-motion: renders final value immediately.
 * SSR: renders final value as initial content to avoid empty server HTML.
 */
export default function Counter({ to, suffix = "", durationMs = 1600, className }: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  // SSR-safe initial text: show final value server-side and when reduced motion is on.
  // The client effect will reset to 0 then animate up (when motion is allowed).
  const initialText = formatInt(to) + suffix;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reduced) {
      el.textContent = formatInt(to) + suffix;
      return;
    }

    registerGsap();

    const ctx = gsap.context(() => {
      const obj = { val: 0 };
      // Reset to 0 immediately so the animation always starts from 0 on the client
      el.textContent = formatInt(0) + suffix;

      gsap.to(obj, {
        val: to,
        duration: durationMs / 1000,
        ease: "power3.out",
        onUpdate() {
          if (el) el.textContent = formatInt(Math.round(obj.val)) + suffix;
        },
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          once: true,
        },
      });
    });

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, suffix, durationMs, reduced]);

  return (
    <span ref={ref} className={className} aria-live="off" aria-atomic="true">
      {initialText}
    </span>
  );
}
