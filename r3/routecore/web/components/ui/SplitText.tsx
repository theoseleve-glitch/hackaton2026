"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { splitToWords } from "./split";
import { useReducedMotion } from "@/lib/useReducedMotion";

export default function SplitText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const words = splitToWords(text);

  useEffect(() => {
    if (reduced || !ref.current) return;
    const ctx = gsap.context(() => {
      const spans = ref.current!.querySelectorAll("[data-word]");
      gsap.from(spans, {
        yPercent: 110,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.08,
      });
    }, ref);
    return () => ctx.revert();
  }, [reduced, text]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} style={{ display: "inline-block", overflow: "hidden" }} aria-hidden>
          <span data-word style={{ display: "inline-block" }}>
            {w}
          </span>&nbsp;
        </span>
      ))}
    </span>
  );
}
