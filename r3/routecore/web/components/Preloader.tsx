"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

// The preloader is a brief ceremony: a Clay Red route draws itself across a
// cream field while a 0–100 counter runs, then the whole overlay lifts away to
// reveal the page. Reduced-motion users skip it entirely (no scroll lock).

const DRAW_MS = 1500;
const HOLD_MS = 250;

export default function Preloader() {
  const reduced = useReducedMotion();
  // Start "done" on the server / reduced-motion so nothing covers the page and
  // there is no scroll lock. The client effect re-arms the ceremony when motion
  // is allowed.
  const [active, setActive] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced) {
      setActive(false);
      return;
    }
    setActive(true);
    const path = pathRef.current;
    const overlay = overlayRef.current;
    if (!path || !overlay) return;

    // Lock scroll during the ceremony.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;

    const count = { v: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        document.body.style.overflow = prevOverflow;
        setActive(false);
      },
    });
    tl.to(path, { strokeDashoffset: 0, duration: DRAW_MS / 1000, ease: "power2.inOut" }, 0);
    tl.to(
      count,
      {
        v: 100,
        duration: DRAW_MS / 1000,
        ease: "power2.inOut",
        onUpdate: () => {
          if (counterRef.current) counterRef.current.textContent = String(Math.round(count.v));
        },
      },
      0
    );
    tl.to(overlay, { yPercent: -100, duration: 0.7, ease: "power3.inOut" }, `+=${HOLD_MS / 1000}`);

    return () => {
      tl.kill();
      document.body.style.overflow = prevOverflow;
    };
  }, [reduced]);

  if (!active) return null;

  return (
    <div
      ref={overlayRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "var(--cream)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
      }}
    >
      <svg width="180" height="120" viewBox="0 0 180 120" fill="none" aria-hidden>
        <path
          ref={pathRef}
          d="M20 96 C 60 96, 50 30, 96 36 S 150 96, 160 28"
          stroke="var(--clay)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="20" cy="96" r="5" fill="var(--olive)" />
        <circle cx="160" cy="28" r="5" fill="var(--clay)" />
      </svg>
      <span
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 18,
          color: "var(--taupe)",
          letterSpacing: "0.04em",
        }}
      >
        <span ref={counterRef}>0</span>
        <span> %</span>
      </span>
    </div>
  );
}
