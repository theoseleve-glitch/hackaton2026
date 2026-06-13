// problem.js — "The problem" section: 40 params, one question — what do I change?
// Asymmetric layout (heading left, the big question offset right, breaking the grid).
// Copy comes entirely from config.js (PROBLEM); never hardcoded here.
import { PROBLEM } from "../config.js";

export function init(ctx) {
  const { gsap, ScrollTrigger, env, reveal } = ctx;
  const root = document.getElementById("problem");
  if (!root) return;

  root.innerHTML = `
    <div class="container problem">
      <div class="problem__lead">
        <p class="eyebrow">${PROBLEM.eyebrow}</p>
        <h2 class="problem__heading">${PROBLEM.heading}</h2>
      </div>
      <p class="problem__big mono">${PROBLEM.big}</p>
      <p class="problem__body">${PROBLEM.body}</p>
    </div>`;

  const lead = root.querySelector(".problem__lead");
  const big = root.querySelector(".problem__big");
  const body = root.querySelector(".problem__body");

  // Reduced motion: everything visible, no scroll work, no bg shift.
  if (env.reduced) {
    gsap.set([lead, body, big], { autoAlpha: 1, y: 0, scale: 1 });
    return;
  }

  // Lead + body rise in with a stagger via the shared helper.
  reveal([lead, body], { y: 44, stagger: 0.12 });

  // The big question scrubs up in scale (0.9 -> 1) + fades as the section crosses.
  gsap.set(big, { autoAlpha: 0, scale: 0.9, transformOrigin: "left center" });
  gsap.to(big, {
    autoAlpha: 1,
    scale: 1,
    ease: "power2.inOut",
    scrollTrigger: {
      trigger: big,
      start: "top 88%",
      end: "top 42%",
      scrub: true,
    },
  });

  // Scroll-driven background deepening: toggle a class while this section owns
  // the viewport. The swap rides base.css's body background-color transition, so
  // it's a one-shot paint on enter/leave — not a per-frame paint scrub.
  ScrollTrigger.create({
    trigger: root,
    start: "top 60%",
    end: "bottom 40%",
    onToggle: (self) => document.body.classList.toggle("bg-deep", self.isActive),
  });
}
