// loop.js — "The Loop" section: the moat.
// Five ordered stations (Race -> Log -> Engineer -> Result -> Share) wired by an
// SVG connector that draws across on scrub and curves back on the last node to
// signal a closed flywheel. Copy comes entirely from config.LOOP.
import { LOOP } from "../config.js";

export function init(ctx) {
  const { gsap, ScrollTrigger, env, reveal } = ctx;
  const root = document.getElementById("loop");
  if (!root) return;

  const stations = LOOP.stations
    .map(
      (s, i) => `
        <li class="station" data-station="${i}">
          <span class="station__index mono">${String(i + 1).padStart(2, "0")}</span>
          <span class="station__dot" aria-hidden="true"></span>
          <h3 class="station__name">${s.n}</h3>
          <p class="station__desc">${s.d}</p>
        </li>`
    )
    .join("");

  root.innerHTML = `
    <div class="container loop">
      <header class="loop__head">
        <p class="eyebrow">${LOOP.eyebrow}</p>
        <h2 class="loop__h">${LOOP.heading}</h2>
      </header>

      <div class="loop__flow">
        <svg class="loop__wire" viewBox="0 0 1000 220" fill="none" preserveAspectRatio="none" aria-hidden="true">
          <path class="loop__wire-track"
            d="M40 70 H960 q24 0 24 24 v36 q0 24 -24 24 H40" />
          <path class="loop__wire-draw"
            d="M40 70 H960 q24 0 24 24 v36 q0 24 -24 24 H40" />
        </svg>
        <ol class="loop__stations">${stations}</ol>
      </div>

      <p class="loop__punchline">${LOOP.punchline}</p>
    </div>`;

  const stationEls = root.querySelectorAll(".station");
  const draw = root.querySelector(".loop__wire-draw");
  const punchline = root.querySelector(".loop__punchline");
  const len = draw.getTotalLength();

  // Reduced motion: show the full wire and every node at their final state, no triggers.
  if (env.reduced) {
    gsap.set(draw, { strokeDasharray: len, strokeDashoffset: 0 });
    gsap.set(stationEls, { autoAlpha: 1, y: 0 });
    gsap.set(punchline, { autoAlpha: 1, y: 0 });
    return;
  }

  // Stations fade in with a stagger — OPACITY ONLY, so the CSS zig-zag transform
  // (and the .is-lit lift) survive instead of being overwritten by a GSAP transform.
  gsap.set(stationEls, { autoAlpha: 0 });
  ScrollTrigger.create({
    trigger: root.querySelector(".loop__flow"),
    start: "top 78%",
    once: true,
    onEnter: () =>
      gsap.to(stationEls, { autoAlpha: 1, duration: 0.8, ease: "power3.out", stagger: 0.1 }),
  });
  reveal(punchline, { y: 28, start: "top 92%" });

  // Connector draws across on a scrub trigger, finishing the return arc last so the
  // line visibly curves back to Race — the flywheel reading.
  gsap.set(draw, { strokeDasharray: len, strokeDashoffset: len });
  gsap.to(draw, {
    strokeDashoffset: 0,
    ease: "power2.inOut",
    scrollTrigger: {
      trigger: root.querySelector(".loop__flow"),
      start: "top 72%",
      end: "bottom 60%",
      scrub: true,
    },
  });

  // Each station "lights" the instant the drawn wire reaches it — a leading-edge
  // wipe synced to the same scroll range, so progress reads left-to-right.
  ScrollTrigger.create({
    trigger: root.querySelector(".loop__flow"),
    start: "top 72%",
    end: "bottom 60%",
    scrub: true,
    onUpdate: (self) => {
      const reached = Math.floor(self.progress * stationEls.length + 0.0001);
      stationEls.forEach((el, i) => el.classList.toggle("is-lit", i < reached));
    },
  });
}
