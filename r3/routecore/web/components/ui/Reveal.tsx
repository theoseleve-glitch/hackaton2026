"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { registerGsap } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

export default function Reveal({
  children,
  y = 50,
  className,
}: {
  children: React.ReactNode;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    registerGsap();
    if (reduced || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(ref.current, {
        y,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: ref.current, start: "top 80%" },
      });
    });
    return () => ctx.revert();
  }, [reduced, y]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
