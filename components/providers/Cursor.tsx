"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * Custom cursor: a small ring that lerp-follows the pointer and expands over
 * interactive elements. Only engages on fine pointers; native cursor stays as a
 * fallback if JS never runs (we add `.cursor-ready` to <body> on mount).
 */
export function Cursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 500, damping: 40, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 500, damping: 40, mass: 0.6 });
  const scale = useMotionValue(1);
  const springScale = useSpring(scale, { stiffness: 400, damping: 28 });

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;
    document.body.classList.add("cursor-ready");

    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const el = (e.target as HTMLElement)?.closest(
        "a, button, [data-cursor], input, textarea, [role='button']",
      );
      scale.set(el ? 2.4 : 1);
    };
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("pointermove", move);
      document.body.classList.remove("cursor-ready");
    };
  }, [x, y, scale]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[70] hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent mix-blend-difference [@media(pointer:fine)]:block"
      style={{ x: ringX, y: ringY, scale: springScale }}
    />
  );
}
