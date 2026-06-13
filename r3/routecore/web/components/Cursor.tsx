"use client";
import { useEffect, useRef, useState } from "react";
import { lerp } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

// Named constants — no magic numbers scattered through the loop.
const LERP_FACTOR = 0.12;
const CURSOR_SIZE = 14;
const HOVER_SCALE = 2.5;
const CURSOR_Z = 9998;

export default function Cursor() {
  const reduced = useReducedMotion();
  // Track whether we're on a coarse-pointer device (touch) — default false until mount.
  const [isCoarse, setIsCoarse] = useState(false);
  const [mounted, setMounted] = useState(false);

  const elRef = useRef<HTMLDivElement>(null);
  // Mutable refs for the rAF loop — no re-renders needed.
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const targetScale = useRef(1);
  const currentScale = useRef(1);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    setIsCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    if (reduced || isCoarse || !mounted) return;

    // Hide the native cursor while ours is active.
    document.documentElement.style.cursor = "none";

    const onMove = (e: MouseEvent) => {
      target.current = { x: e.clientX, y: e.clientY };
    };

    const onOver = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.("[data-cursor-hover]")) {
        targetScale.current = HOVER_SCALE;
      }
    };

    const onOut = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.("[data-cursor-hover]")) {
        targetScale.current = 1;
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);

    const tick = () => {
      current.current.x = lerp(current.current.x, target.current.x, LERP_FACTOR);
      current.current.y = lerp(current.current.y, target.current.y, LERP_FACTOR);
      currentScale.current = lerp(currentScale.current, targetScale.current, LERP_FACTOR);

      const el = elRef.current;
      if (el) {
        // One composed transform per frame — no CSS transition fighting the rAF loop.
        el.style.transform = `translate3d(${current.current.x}px, ${current.current.y}px, 0) translate(-50%, -50%) scale(${currentScale.current})`;
      }

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      document.documentElement.style.cursor = "";
    };
  }, [reduced, isCoarse, mounted]);

  // Render nothing if reduced motion, coarse pointer, or not yet mounted (SSR-safe).
  if (!mounted || reduced || isCoarse) return null;

  return (
    <div
      ref={elRef}
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: CURSOR_SIZE,
        height: CURSOR_SIZE,
        borderRadius: "50%",
        background: "var(--clay)",
        mixBlendMode: "difference",
        pointerEvents: "none",
        zIndex: CURSOR_Z,
        // Start offscreen so it doesn't flash at 0,0 before first mousemove.
        transform: "translate3d(-200px, -200px, 0) translate(-50%, -50%) scale(1)",
        // No CSS transition on transform — scale is lerped inside the rAF loop.
        willChange: "transform",
      }}
    />
  );
}
