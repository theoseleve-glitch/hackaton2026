"use client";

import { useEffect, useRef, useState } from "react";
import { registerGsap } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const CHIPS = [
  { label: "10 min — une respiration", index: 0 },
  { label: "25 min — je prends le temps", index: 1 },
  { label: "45 min — je pars en échappée", index: 2 },
];

export default function SignatureMap() {
  const sectionRef = useRef<HTMLElement>(null);
  const echappeeRef = useRef<SVGPathElement>(null);
  const [activeChip, setActiveChip] = useState(1);
  const activeChipRef = useRef(1);
  const reduced = useReducedMotion();

  useEffect(() => {
    // Guard: we need the refs
    if (!sectionRef.current || !echappeeRef.current) return;

    // Captured once at mount; does not react to resize/orientation (acceptable for a landing page).
    const isMobile = window.innerWidth < 768;
    const noAnim = reduced || isMobile;

    const path = echappeeRef.current;
    const totalLength = path.getTotalLength();

    if (noAnim) {
      // Static: fully drawn, haltes visible, middle chip active
      path.style.strokeDasharray = `${totalLength}`;
      path.style.strokeDashoffset = "0";
      const haltes = sectionRef.current!.querySelectorAll<SVGCircleElement>("[data-halte]");
      haltes.forEach((h) => {
        h.style.transform = "scale(1)";
      });
      setActiveChip(1);
      return;
    }

    // Animated path
    registerGsap();

    // Initial state: path undrawn, haltes hidden
    path.style.strokeDasharray = `${totalLength}`;
    path.style.strokeDashoffset = `${totalLength}`;

    const haltes = sectionRef.current!.querySelectorAll<SVGCircleElement>("[data-halte]");
    haltes.forEach((h) => {
      gsap.set(h, { scale: 0, transformOrigin: "center center" });
    });

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "+=2000",
          scrub: true,
          pin: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            const p = self.progress;
            // Thresholds must stay in sync with timeline keyframe split:
            // route draw 0–0.6, halte bloom 0.6–1.
            const next = p < 0.4 ? 0 : p < 0.7 ? 1 : 2;
            if (next !== activeChipRef.current) {
              activeChipRef.current = next;
              setActiveChip(next);
            }
          },
        },
      });

      // Step 1: draw the route (60% of timeline)
      tl.to(
        path,
        {
          strokeDashoffset: 0,
          ease: "none",
          duration: 0.6,
        },
        0
      );

      // Step 2: bloom haltes with stagger (remaining 40%)
      tl.to(
        haltes,
        {
          scale: 1,
          transformOrigin: "center center",
          stagger: 0.15,
          ease: "back.out(1.7)",
          duration: 0.4,
        },
        0.6
      );
    }, sectionRef);

    return () => {
      ctx.revert();
    };
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      style={{ background: "var(--cream-deep)", minHeight: "100vh" }}
      className="relative flex flex-col md:flex-row items-center gap-10 px-6 py-16 md:px-16 md:py-0"
    >
      {/* Left: text block */}
      <div className="flex flex-col gap-6 md:w-2/5 md:flex-shrink-0">
        <span className="eyebrow">LA SIGNATURE</span>

        <h2
          style={{
            fontSize: "clamp(28px, 5vw, 56px)",
            color: "var(--brown)",
            fontFamily: "Fraunces, serif",
            lineHeight: 1.15,
          }}
        >
          Combien de temps veux-tu t&apos;offrir&nbsp;?
        </h2>

        <div className="flex flex-col gap-3 mt-2">
          {CHIPS.map((chip) => {
            const isActive = chip.index === activeChip;
            return (
              <button
                key={chip.index}
                aria-pressed={isActive}
                onClick={() => setActiveChip(chip.index)}
                style={{
                  background: isActive ? "#F9E5DE" : "var(--surface)",
                  border: `1.5px solid ${isActive ? "var(--clay)" : "var(--border)"}`,
                  borderRadius: "999px",
                  padding: "10px 20px",
                  color: "var(--brown)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "0.95rem",
                  fontWeight: isActive ? 600 : 400,
                  transition: "background 0.25s, border-color 0.25s, font-weight 0.1s",
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: inline SVG map */}
      <div className="flex-1 flex items-center justify-center w-full">
        <svg
          viewBox="0 0 400 500"
          role="img"
          aria-label="Une route qui s'écarte de l'autoroute pour rejoindre quatre belles haltes."
          style={{ width: "100%", maxWidth: "420px", height: "auto" }}
        >
          {/* France silhouette — stylized soft hexagon-blob */}
          <path
            d="
              M 200 30
              C 280 20, 370 80, 380 160
              C 390 230, 360 290, 340 340
              C 320 390, 280 450, 220 470
              C 175 482, 130 460, 100 430
              C 60 395, 30 340, 25 270
              C 18 190, 50 110, 110 65
              C 145 38, 175 36, 200 30
              Z
            "
            fill="var(--cream)"
            stroke="var(--mist)"
            strokeWidth="2"
            opacity="0.5"
          />

          {/* Direct route: Lyon-ish (200,100) → Vienne-ish (210,400), dotted */}
          <path
            id="route-direct"
            d="M 200 100 L 210 400"
            stroke="var(--taupe)"
            strokeWidth="3"
            strokeDasharray="2 8"
            fill="none"
            opacity="0.6"
          />

          {/* Échappée route: same endpoints, wandering bezier */}
          <path
            ref={echappeeRef}
            id="route-echappee"
            d="M 200 100 C 260 150, 290 180, 270 220 C 250 260, 160 270, 150 310 C 140 350, 180 370, 210 400"
            stroke="var(--clay)"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />

          {/* Haltes along the échappée curve */}
          <circle data-halte="1" cx="262" cy="163" r="7" fill="var(--gold)" stroke="var(--surface)" strokeWidth="2" />
          <circle data-halte="2" cx="278" cy="208" r="7" fill="var(--gold)" stroke="var(--surface)" strokeWidth="2" />
          <circle data-halte="3" cx="157" cy="287" r="7" fill="var(--gold)" stroke="var(--surface)" strokeWidth="2" />
          <circle data-halte="4" cx="148" cy="322" r="7" fill="var(--gold)" stroke="var(--surface)" strokeWidth="2" />

          {/* Start dot — olive */}
          <circle cx="200" cy="100" r="6" fill="var(--olive)" />

          {/* End dot — clay */}
          <circle cx="210" cy="400" r="6" fill="var(--clay)" />
        </svg>
      </div>
    </section>
  );
}
