import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { env } from "./env.js";

// Animate elements in with a stagger when the container scrolls into view.
export function reveal(targets, { x = 0, y = 40, stagger = 0.1, start = "top 80%", trigger } = {}) {
  const els = gsap.utils.toArray(targets);
  if (!els.length) return;
  if (env.reduced) {
    gsap.set(els, { autoAlpha: 1, x: 0, y: 0 });
    return;
  }
  gsap.set(els, { autoAlpha: 0, x, y });
  ScrollTrigger.create({
    trigger: trigger || els[0],
    start,
    once: true,
    onEnter: () => gsap.to(els, { autoAlpha: 1, x: 0, y: 0, duration: 0.9, ease: "power3.out", stagger }),
  });
}
