// proof.js — "Why it's different": Strava ↔ RaceLab comparison + punchline + fact chips.
// Animations: rows reveal top→bottom (stagger), punchline scrubs in, fact chips pop.
// Animates transform/opacity only; respects ctx.env.reduced (final states, no triggers).
import { PROOF, BRAND } from "../config.js";

export function init(ctx) {
  const { gsap, ScrollTrigger, env, reveal } = ctx;
  const root = document.getElementById("proof");
  if (!root) return;

  // The last row is the "no equivalent" decisive row — RaceLab cell carries the accent.
  const lastIndex = PROOF.rows.length - 1;

  root.innerHTML = `
    <div class="container proof">
      <header class="proof__head">
        <p class="eyebrow">${PROOF.eyebrow}</p>
        <h2 class="proof__title">${PROOF.heading}</h2>
      </header>

      <div class="proof__table" role="table" aria-label="Strava compared with ${BRAND}">
        <div class="proof__row proof__row--head" role="row">
          <span class="proof__cell proof__cell--label" role="columnheader">Strava</span>
          <span class="proof__sep" aria-hidden="true"></span>
          <span class="proof__cell proof__cell--label proof__cell--us" role="columnheader">${BRAND}</span>
        </div>
        ${PROOF.rows
          .map((r, i) => {
            const decisive = i === lastIndex;
            return `<div class="proof__row${decisive ? " proof__row--decisive" : ""}" role="row">
              <span class="proof__cell proof__cell--a" role="cell">${r.a}</span>
              <span class="proof__sep" aria-hidden="true"></span>
              <span class="proof__cell proof__cell--b${decisive ? " proof__cell--accent" : ""}" role="cell">${r.b}</span>
            </div>`;
          })
          .join("")}
      </div>

      <p class="proof__punchline">${PROOF.punchline}</p>

      <ul class="proof__facts" aria-label="Product facts">
        ${PROOF.facts.map((f) => `<li class="proof__fact mono">${f}</li>`).join("")}
      </ul>
    </div>`;

  // Drive the mobile per-cell brand prefix from the BRAND token (one-edit rename).
  root.style.setProperty("--brand-label", '"' + BRAND + ' — "');

  const rows = gsap.utils.toArray(root.querySelectorAll(".proof__row"));
  const punchline = root.querySelector(".proof__punchline");
  const facts = gsap.utils.toArray(root.querySelectorAll(".proof__fact"));

  // Reduced motion: everything visible, no scroll triggers.
  if (env.reduced) {
    gsap.set([...rows, punchline, ...facts], { autoAlpha: 1, x: 0, y: 0, scale: 1 });
    return;
  }

  // Rows wipe in top→bottom with a slight horizontal offset (spatial, not a plain fade).
  gsap.set(rows, { autoAlpha: 0, x: -32 });
  ScrollTrigger.create({
    trigger: root.querySelector(".proof__table"),
    start: "top 80%",
    once: true,
    onEnter: () =>
      gsap.to(rows, {
        autoAlpha: 1,
        x: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.09,
      }),
  });

  // Punchline scrubs in — rises + settles as the section crosses the viewport.
  gsap.set(punchline, { autoAlpha: 0, y: 48 });
  gsap.to(punchline, {
    autoAlpha: 1,
    y: 0,
    ease: "power2.inOut",
    scrollTrigger: {
      trigger: punchline,
      start: "top 92%",
      end: "top 58%",
      scrub: true,
    },
  });

  // Fact chips pop with a stagger once the row scrolls in.
  gsap.set(facts, { autoAlpha: 0, y: 24, scale: 0.92 });
  ScrollTrigger.create({
    trigger: root.querySelector(".proof__facts"),
    start: "top 88%",
    once: true,
    onEnter: () =>
      gsap.to(facts, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.55,
        ease: "back.out(1.7)",
        stagger: 0.1,
      }),
  });
}
