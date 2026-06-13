"use client";

import { useEffect, useRef } from "react";
import { registerGsap } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* ─── Mini-mockup sub-components ────────────────────────────────────────── */

function MockupSearch() {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1.5px solid var(--border)",
        borderRadius: 12,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "0.8rem",
        color: "var(--brown)",
      }}
    >
      {/* magnifier icon */}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="4.5" stroke="var(--taupe)" strokeWidth="1.5" />
        <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="var(--taupe)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>Lyon&nbsp;→&nbsp;Vienne</span>
    </div>
  );
}

function MockupDetour() {
  const pills = ["10 min", "25 min", "45 min"];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {pills.map((p, i) => (
        <span
          key={p}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            fontSize: "0.78rem",
            fontWeight: i === 1 ? 600 : 400,
            background: i === 1 ? "var(--clay)" : "var(--cream-deep)",
            color: i === 1 ? "#fff" : "var(--brown)",
            border: `1.5px solid ${i === 1 ? "var(--clay)" : "var(--border)"}`,
          }}
        >
          {p}
        </span>
      ))}
    </div>
  );
}

function MockupMap() {
  return (
    <svg viewBox="0 0 120 80" aria-label="Carte schématique avec route et haltes" style={{ width: "100%", maxWidth: 120, height: "auto" }}>
      {/* Background */}
      <rect x="0" y="0" width="120" height="80" rx="8" fill="var(--cream)" />
      {/* Route clay */}
      <path
        d="M 20 60 C 40 40, 50 25, 70 20 C 85 16, 100 30, 105 45"
        stroke="var(--clay)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* Gold halte dots */}
      <circle cx="48" cy="30" r="5" fill="var(--gold)" stroke="var(--surface)" strokeWidth="1.5" />
      <circle cx="68" cy="21" r="5" fill="var(--gold)" stroke="var(--surface)" strokeWidth="1.5" />
      <circle cx="90" cy="30" r="5" fill="var(--gold)" stroke="var(--surface)" strokeWidth="1.5" />
      {/* Start / end */}
      <circle cx="20" cy="60" r="4" fill="var(--olive)" />
      <circle cx="105" cy="45" r="4" fill="var(--clay)" />
    </svg>
  );
}

function MockupRouteCard() {
  return (
    <div
      style={{
        background: "var(--cream-deep)",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: "0.8rem",
        color: "var(--brown)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontWeight: 700, fontFamily: "Fraunces, serif", fontSize: "0.9rem" }}>Ta route</span>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "var(--taupe)" }}>
        <span>2h32</span>
        <span>·</span>
        <span>194 km</span>
        <span>·</span>
        <span style={{ color: "var(--gold)", fontWeight: 600 }}>4 haltes</span>
      </div>
    </div>
  );
}

/* ─── Step data ──────────────────────────────────────────────────────────── */

const STEPS = [
  {
    num: "01",
    title: "Où vas-tu ?",
    caption: "Entre ta destination. Comme un GPS, mais qui te veut du bien.",
    Mockup: MockupSearch,
  },
  {
    num: "02",
    title: "Combien de temps ?",
    caption: "Choisis ton détour : 10, 25, 45 minutes. Le temps que tu t’offres.",
    Mockup: MockupDetour,
  },
  {
    num: "03",
    title: "On trouve les haltes.",
    caption:
      "Producteurs, marchés, villages, points de vue — sur ta route, pas à l’autre bout du pays.",
    Mockup: MockupMap,
  },
  {
    num: "04",
    title: "Et tu pars.",
    caption: "Ta route, tes haltes, ton rythme. Bonne échappée.",
    Mockup: MockupRouteCard,
  },
] as const;

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    // Only animate on wide viewports where the user hasn't requested reduced motion.
    // The React hook `reduced` already reflects prefers-reduced-motion, but we also
    // check window width here so the effect correctly opts out on mobile.
    if (reduced || window.innerWidth < 769) return;

    registerGsap();

    const getDistance = () => track.scrollWidth - window.innerWidth;

    const ctx = gsap.context(() => {
      gsap.to(track, {
        x: () => -getDistance(),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          pin: true,
          scrub: 1,
          start: "top top",
          end: () => "+=" + getDistance(),
          invalidateOnRefresh: true,
        },
      });
    }, section);

    return () => {
      ctx.revert();
      // Ensure no residual transform lingers on the track after cleanup
      // (important when window resizes below 769 px while still mounted).
      gsap.set(track, { clearProps: "x" });
    };
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      aria-label="Comment ça marche"
      style={{
        background: "var(--cream)",
        // minHeight ensures the section has enough vertical scroll room even before
        // GSAP adds its own scroll distance via `end`.
        minHeight: "100vh",
        // Overflow hidden prevents the horizontal track from causing body scroll
        // during the pinned desktop animation.
        overflow: "hidden",
      }}
    >
      {/* Intro header — always visible, sits above the card track */}
      <div
        style={{
          padding: "clamp(48px, 8vw, 96px) clamp(24px, 5vw, 80px) clamp(24px, 4vw, 48px)",
        }}
      >
        <span className="eyebrow">COMMENT ÇA MARCHE</span>
        <h2
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: "clamp(28px, 4.5vw, 54px)",
            color: "var(--brown)",
            lineHeight: 1.15,
            marginTop: "0.5em",
            maxWidth: "22ch",
          }}
        >
          Quatre gestes, et te voilà parti.
        </h2>
      </div>

      {/*
        Track wrapper — on desktop (≥769 px, motion OK) this becomes a horizontal
        strip that GSAP translates left. On mobile it is a plain flex column so cards
        stack and are fully readable with no clipping.
      */}
      <div
        ref={trackRef}
        style={{
          display: "flex",
          // Column on mobile, row on desktop — the media query in CSS mirrors the
          // JS ScrollTrigger.matchMedia query.
          flexDirection: "column",
          gap: "clamp(20px, 3vw, 32px)",
          padding: "0 clamp(24px, 5vw, 80px) clamp(48px, 8vw, 96px)",
          // Width only expands to card-track width on desktop via the CSS below.
          willChange: "transform",
        }}
        className="hiw-track"
      >
        {STEPS.map(({ num, title, caption, Mockup }) => (
          <article
            key={num}
            style={{
              background: "var(--surface)",
              border: "1.5px solid var(--border)",
              borderRadius: 24,
              padding: "clamp(24px, 3vw, 36px)",
              boxShadow: "0 8px 24px rgba(43,33,28,0.10)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              // Card size: fills column on mobile, fixed width on desktop (via CSS).
              flexShrink: 0,
            }}
            className="hiw-card"
          >
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: "2.5rem",
                fontWeight: 900,
                color: "var(--clay)",
                lineHeight: 1,
              }}
            >
              {num}
            </span>

            <h3
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: "clamp(20px, 2vw, 26px)",
                color: "var(--brown)",
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              {title}
            </h3>

            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "0.95rem",
                color: "var(--taupe)",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {caption}
            </p>

            {/* App-screen mini-mockup */}
            <div
              style={{
                marginTop: "auto",
                paddingTop: 8,
              }}
            >
              <Mockup />
            </div>
          </article>
        ))}
      </div>

      {/* Scoped styles for track/card sizing on desktop */}
      <style>{`
        @media (min-width: 769px) and (prefers-reduced-motion: no-preference) {
          .hiw-track {
            flex-direction: row;
            align-items: stretch;
            /* Total track width: 4 cards + gaps, no wrap */
            width: max-content;
            /* Enough vertical height for the pinned viewport */
            min-height: calc(100vh - 200px);
            padding-bottom: 80px;
          }
          .hiw-card {
            width: min(80vw, 420px);
          }
        }

        /* Mobile / reduced-motion: column stack, full-width cards */
        @media (max-width: 768px), (prefers-reduced-motion: reduce) {
          .hiw-track {
            flex-direction: column;
          }
          .hiw-card {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
