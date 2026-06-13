"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { registerGsap } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";
import Reveal from "@/components/ui/Reveal";

export default function Manifeste() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!sectionRef.current) return;

    if (reduced) {
      sectionRef.current.style.backgroundColor = "var(--cream-deep)";
      return;
    }

    registerGsap();
    const ctx = gsap.context(() => {
      gsap.fromTo(
        sectionRef.current,
        { backgroundColor: "var(--cream)" },
        {
          backgroundColor: "var(--cream-deep)",
          ease: "none",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top bottom",
            end: "top center",
            scrub: true,
          },
        }
      );
    });

    return () => ctx.revert();
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      style={{
        backgroundColor: "var(--cream)",
        paddingTop: "clamp(96px, 16vh, 200px)",
        paddingBottom: "clamp(96px, 16vh, 200px)",
      }}
    >
      <div
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
          paddingLeft: "clamp(24px, 5vw, 80px)",
          paddingRight: "clamp(24px, 5vw, 80px)",
          textAlign: "center",
        }}
      >
        <p className="eyebrow" style={{ marginBottom: "3rem" }}>
          LE MANIFESTE
        </p>

        <Reveal>
          <p
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "clamp(28px, 5vw, 64px)",
              lineHeight: 1.15,
              color: "var(--brown)",
              marginBottom: "1.5rem",
              fontWeight: 600,
            }}
          >
            Le plus court n&rsquo;est pas toujours{" "}
            <span style={{ color: "var(--clay)" }}>le plus beau.</span>
          </p>
        </Reveal>

        <Reveal>
          <p
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "clamp(28px, 5vw, 64px)",
              lineHeight: 1.15,
              color: "var(--brown)",
              marginBottom: "1.5rem",
              fontWeight: 500,
            }}
          >
            L&rsquo;Échappée trouve les haltes qui valent le détour.
          </p>
        </Reveal>

        <Reveal>
          <p
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "clamp(28px, 5vw, 64px)",
              lineHeight: 1.15,
              color: "var(--brown)",
              fontWeight: 500,
            }}
          >
            Producteurs, marchés, villages, points de vue.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
