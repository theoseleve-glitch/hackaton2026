"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import SplitText from "@/components/ui/SplitText";
import Magnetic from "@/components/ui/Magnetic";
import { registerGsap } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !sectionRef.current || !mockupRef.current) return;
    registerGsap();
    const ctx = gsap.context(() => {
      gsap.to(mockupRef.current, {
        y: 80,
        rotate: 3,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      style={{
        minHeight: "100vh",
        background: "var(--cream)",
        padding: "clamp(48px, 8vw, 120px) clamp(24px, 6vw, 96px)",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: "clamp(48px, 6vw, 80px)",
          alignItems: "center",
        }}
        className="hero-grid"
      >
        {/* ── Left column: text ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <span className="eyebrow">GPS DE DÉTOUR · FRANCE</span>

          {/* Screen-reader gets the full sentence via aria-label on the wrapper */}
          <h1
            aria-label="Le GPS des routes qui respirent."
            style={{
              fontSize: "clamp(40px, 9vw, 130px)",
              lineHeight: 1.05,
              fontFamily: "var(--font-fraunces, Georgia, serif)",
              color: "var(--brown)",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {/* Word-by-word entrance for the non-accented part */}
            <SplitText
              text="Le GPS des routes qui"
            />
            {/* Accented word with mix-blend + clay red — maintains the word-reveal feel */}
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                overflow: "hidden",
                verticalAlign: "bottom",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  color: "var(--clay)",
                  mixBlendMode: "difference",
                  /* Slightly delayed so it follows the other words */
                  animation: reduced
                    ? "none"
                    : "heroAccent 0.9s cubic-bezier(0.215,0.61,0.355,1) 0.72s both",
                }}
              >
                respirent.
              </span>
            </span>
          </h1>

          <p
            style={{
              fontSize: "clamp(17px, 2.2vw, 22px)",
              color: "var(--taupe)",
              lineHeight: 1.55,
              maxWidth: 520,
              margin: 0,
            }}
          >
            Le plus court t&apos;emmène vite.{" "}
            <br />
            Le détour te ramène quelque chose.
          </p>

          <div>
            <Magnetic strength={0.35}>
              <a
                href="#telecharger"
                data-cursor-hover
                style={{
                  display: "inline-block",
                  background: "var(--clay)",
                  color: "var(--surface)",
                  padding: "14px 32px",
                  borderRadius: 18,
                  fontWeight: 600,
                  fontSize: "clamp(15px, 1.4vw, 17px)",
                  textDecoration: "none",
                  letterSpacing: "0.01em",
                  transition: "opacity 0.2s ease",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.opacity = "0.88")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.opacity = "1")
                }
              >
                Télécharger l&apos;app
              </a>
            </Magnetic>
          </div>
        </div>

        {/* ── Right column: phone mockup placeholder ── */}
        {/* TODO: replace with real app screenshot once assets are ready */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            ref={mockupRef}
            style={{
              width: "clamp(220px, 32vw, 320px)",
              aspectRatio: "9/19.5",
              borderRadius: 40,
              border: "3px solid var(--border)",
              background: "var(--cream)",
              boxShadow: "0 8px 24px rgba(43,33,28,0.10)",
              overflow: "hidden",
              position: "relative",
              transform: "rotate(-4deg)",
              transformOrigin: "center center",
            }}
          >
            {/* App screen interior */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(160deg, var(--cream) 60%, var(--mist) 100%)",
                padding: "24px 16px 0",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Mini header */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--brown)",
                  letterSpacing: "0.08em",
                  marginBottom: 8,
                }}
              >
                L&apos;ÉCHAPPÉE
              </div>

              {/* Map area with SVG route */}
              <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                <svg
                  viewBox="0 0 260 320"
                  style={{ width: "100%", height: "100%" }}
                  aria-hidden
                >
                  {/* Subtle road grid */}
                  <line x1="80" y1="0" x2="80" y2="320" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 8" opacity="0.5" />
                  <line x1="180" y1="0" x2="180" y2="320" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 8" opacity="0.5" />
                  <line x1="0" y1="100" x2="260" y2="100" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 8" opacity="0.5" />
                  <line x1="0" y1="220" x2="260" y2="220" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 8" opacity="0.5" />

                  {/* Clay route curve — the scenic detour */}
                  <path
                    d="M 40 280 C 60 200, 120 260, 130 180 C 140 100, 80 80, 130 40 C 160 20, 200 60, 220 80"
                    stroke="var(--clay)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    fill="none"
                  />

                  {/* Gold halte dots */}
                  <circle cx="130" cy="180" r="7" fill="var(--gold)" opacity="0.9" />
                  <circle cx="200" cy="80" r="7" fill="var(--gold)" opacity="0.9" />
                  <circle cx="80" cy="240" r="5" fill="var(--gold)" opacity="0.7" />
                  <circle cx="155" cy="110" r="5" fill="var(--gold)" opacity="0.7" />

                  {/* Start dot */}
                  <circle cx="40" cy="280" r="6" fill="var(--olive)" />
                  {/* End dot */}
                  <circle cx="220" cy="80" r="6" fill="var(--mist)" stroke="var(--brown)" strokeWidth="1.5" />
                </svg>
              </div>

              {/* Bottom card */}
              <div
                style={{
                  background: "rgba(255,252,245,0.95)",
                  borderRadius: "16px 16px 0 0",
                  padding: "14px 16px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 3,
                    background: "var(--border)",
                    borderRadius: 2,
                    margin: "0 auto 10px",
                  }}
                />
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--brown)",
                    fontWeight: 600,
                    margin: 0,
                    lineHeight: 1.4,
                  }}
                >
                  On a trouvé 4 haltes sur ta route.
                </p>
                <p
                  style={{
                    fontSize: 10,
                    color: "var(--taupe)",
                    margin: "4px 0 0",
                  }}
                >
                  Épicerie fermière · Belvédère · Fontaine
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframe for accent word entrance (mirrors SplitText's power3.out timing) */}
      <style>{`
        @keyframes heroAccent {
          from { transform: translateY(110%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @media (min-width: 768px) {
          .hero-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
