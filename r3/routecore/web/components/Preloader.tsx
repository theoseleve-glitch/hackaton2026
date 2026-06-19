"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

// The preloader is a brief ceremony: a Clay Red route draws itself under the
// wordmark while a 0–100 counter runs, then the whole overlay lifts away to
// reveal the page. Reduced-motion users skip it entirely (no scroll lock).
//
// IMPORTANT: the overlay must render from the first commit so its refs exist
// when the effect runs — otherwise the timeline never starts and it sticks.

const DRAW_MS = 1500;
const HOLD_MS = 250;

export default function Preloader() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const path = pathRef.current;
    const overlay = overlayRef.current;

    if (reduced || !path || !overlay) {
      setActive(false);
      return;
    }

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
        gap: 22,
      }}
    >
      <span
        style={{
          fontFamily: "Fraunces, Georgia, serif",
          fontSize: "clamp(34px, 7vw, 64px)",
          fontWeight: 600,
          color: "var(--brown)",
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        L&rsquo;Échappée
      </span>

      <svg width="200" height="64" viewBox="0 0 200 64" fill="none" aria-hidden>
        {/* faint straight reference line (the motorway) */}
        <line x1="14" y1="50" x2="186" y2="50" stroke="var(--border)" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" />
        {/* the échappée — a calm wandering detour that draws itself */}
        <path
          ref={pathRef}
          d="M14 50 C 56 50, 60 16, 100 16 S 144 50, 186 22"
          stroke="var(--clay)"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="14" cy="50" r="4.5" fill="var(--olive)" />
        <circle cx="186" cy="22" r="4.5" fill="var(--clay)" />
      </svg>

      <span
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 13,
          color: "var(--taupe)",
          letterSpacing: "0.08em",
        }}
      >
        <span ref={counterRef}>0</span>
        <span>&nbsp;%</span>
      </span>
    </div>
  );
}
