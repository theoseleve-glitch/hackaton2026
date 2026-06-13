"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { magneticOffset } from "./magneticOffset";
import { useReducedMotion } from "@/lib/useReducedMotion";

export default function Magnetic({
  children,
  strength = 0.4,
}: {
  children: React.ReactNode;
  strength?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const reduced = useReducedMotion();

  // Kill any in-flight tween on unmount to avoid writing to a detached node.
  useEffect(() => () => { tweenRef.current?.kill(); }, []);

  const move = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const { x, y } = magneticOffset(e.clientX, e.clientY, r, strength);
    tweenRef.current?.kill();
    tweenRef.current = gsap.to(ref.current, { x, y, duration: 0.4, ease: "power3.out" });
  };

  const reset = () => {
    if (!ref.current) return;
    tweenRef.current?.kill();
    tweenRef.current = gsap.to(ref.current, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1,0.4)" });
  };

  return (
    <span
      ref={ref}
      onMouseMove={move}
      onMouseLeave={reset}
      style={{ display: "inline-block" }}
    >
      {children}
    </span>
  );
}
