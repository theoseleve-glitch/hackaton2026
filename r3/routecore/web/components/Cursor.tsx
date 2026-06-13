"use client";
import { useEffect, useRef, useState } from "react";
import { lerp } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

export default function Cursor() {
  const reduced = useReducedMotion();
  // Track whether we're on a coarse-pointer device (touch) — default false until mount.
  const [isCoarse, setIsCoarse] = useState(false);
  const [mounted, setMounted] = useState(false);

  const elRef = useRef<HTMLDivElement>(null);
  // Mutable refs for the rAF loop — no re-renders needed.
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const scale = useRef(1);
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
        scale.current = 2.5;
      }
    };

    const onOut = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.("[data-cursor-hover]")) {
        scale.current = 1;
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);

    const tick = () => {
      const t = 0.12; // lerp factor — lower = more lag, higher = snappier
      current.current.x = lerp(current.current.x, target.current.x, t);
      current.current.y = lerp(current.current.y, target.current.y, t);

      const el = elRef.current;
      if (el) {
        el.style.transform = `translate(${current.current.x}px, ${current.current.y}px) translate(-50%, -50%) scale(${scale.current})`;
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
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: "var(--clay)",
        mixBlendMode: "difference",
        pointerEvents: "none",
        zIndex: 9998,
        // Start offscreen so it doesn't flash at 0,0 before first mousemove.
        transform: "translate(-200px, -200px) translate(-50%, -50%) scale(1)",
        // Smooth the scale transition on hover without touching the lerp position.
        transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        willChange: "transform",
      }}
    />
  );
}
