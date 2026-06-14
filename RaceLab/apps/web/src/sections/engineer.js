// engineer.js — the AI race engineer section: 8-part report card + principles + before/after duel.
import { ENGINEER } from "../config.js";

export function init(ctx) {
  const { gsap, ScrollTrigger, env, reveal } = ctx;
  const root = document.getElementById("engineer");
  if (!root) return;

  root.innerHTML = `
    <div class="container engineer__inner">
      <header class="engineer__head">
        <p class="eyebrow">${ENGINEER.eyebrow}</p>
        <h2 class="engineer__h">${ENGINEER.heading}</h2>
      </header>

      <div class="engineer__grid">
        <article class="report" aria-label="AI race engineer report">
          <div class="report__chrome">
            <span class="report__dot"></span>
            <span class="report__dot"></span>
            <span class="report__dot"></span>
            <span class="report__file mono">engineer_report.txt</span>
          </div>
          <div class="report__body">
            ${ENGINEER.report
              .map((r, i) => {
                const slug = r.k.toLowerCase().replace(/[^a-z]+/g, "-");
                const isPrimary = r.k === "Primary change";
                const isConfidence = r.k === "Confidence";
                const cls = [
                  "report__row",
                  isPrimary ? "report__row--primary" : "",
                  isConfidence ? "report__row--confidence" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const value = isConfidence
                  ? `<span class="report__pill">${r.v}</span>`
                  : `<span class="report__v">${r.v}</span>`;
                return `<div class="${cls}" data-k="${slug}">
                  <span class="report__index mono">${String(i + 1).padStart(2, "0")}</span>
                  <span class="report__k mono">${r.k}</span>
                  ${value}
                </div>`;
              })
              .join("")}
          </div>
        </article>

        <aside class="engineer__side">
          <div class="principles">
            ${ENGINEER.principles
              .map(
                (p, i) => `<div class="principle">
                  <span class="principle__no mono">0${i + 1}</span>
                  <h3>${p.t}</h3>
                  <p>${p.d}</p>
                </div>`
              )
              .join("")}
          </div>

          <div class="duel">
            <p class="duel__label mono">${ENGINEER.duel.label}</p>
            <div class="duel__track">
              <span class="duel__node duel__node--before">
                <span class="duel__time mono">${ENGINEER.duel.before}</span>
                <span class="duel__tag mono">before</span>
              </span>
              <span class="duel__arrow" aria-hidden="true">→</span>
              <span class="duel__node duel__node--after">
                <span class="duel__time mono" data-after="${ENGINEER.duel.after}">${ENGINEER.duel.before}</span>
                <span class="duel__tag mono">after</span>
              </span>
            </div>
            <span class="duel__delta mono">${ENGINEER.duel.delta}</span>
          </div>
        </aside>
      </div>
    </div>`;

  const rows = root.querySelectorAll(".report__row");
  const principles = root.querySelectorAll(".principle");
  const after = root.querySelector(".duel__node--after .duel__time");
  const delta = root.querySelector(".duel__delta");
  const a = parseFloat(ENGINEER.duel.before);
  const b = parseFloat(ENGINEER.duel.after);

  // report rows slide in from the left (paper feeding out of the printer)
  reveal(rows, { x: -32, y: 0, stagger: 0.07, start: "top 78%" });
  // principle tiles rise with a wider stagger
  reveal(principles, { y: 48, stagger: 0.12, start: "top 82%" });

  if (env.reduced) {
    if (after) after.textContent = ENGINEER.duel.after;
    return;
  }
  if (!after || !delta) return;

  // duel: the "after" lap counts down from before -> after as it scrolls in,
  // and the delta pops once the count lands.
  gsap.set(delta, { autoAlpha: 0, y: 10 });
  ScrollTrigger.create({
    trigger: ".duel",
    start: "top 80%",
    once: true,
    onEnter: () =>
      gsap.to(
        { v: a },
        {
          v: b,
          duration: 1.2,
          ease: "power2.out",
          onUpdate() {
            after.textContent = this.targets()[0].v.toFixed(2);
          },
          onComplete() {
            after.textContent = ENGINEER.duel.after;
            gsap.to(delta, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" });
          },
        }
      ),
  });
}
