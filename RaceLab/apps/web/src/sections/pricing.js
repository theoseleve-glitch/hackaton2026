// pricing.js — the conversion section. Two plans (annual highlighted) + web-first note
// + magnetic trial CTA. All copy/pricing/links come from PRICING in config.js.
import { PRICING } from "../config.js";

export function init(ctx) {
  const { gsap, env, reveal } = ctx;
  const root = document.getElementById("pricing");
  if (!root) return;

  root.innerHTML = `
    <div class="container pricing">
      <header class="pricing__head">
        <p class="eyebrow">${PRICING.eyebrow}</p>
        <h2 class="pricing__h">${PRICING.heading}</h2>
      </header>

      <div class="pricing__plans">
        ${PRICING.plans
          .map((p, i) => {
            const featured = p.highlight ? " plan--featured" : "";
            const badge = p.badge ? `<span class="plan__badge">${p.badge}</span>` : "";
            const tag = p.highlight ? `<span class="plan__tag">Best value</span>` : "";
            return `
            <article class="plan${featured}" data-plan="${i}" aria-current="${p.highlight ? "true" : "false"}">
              ${badge}
              <header class="plan__top">
                <span class="plan__name mono">${p.name}</span>
                ${tag}
              </header>
              <p class="plan__price">
                <span class="plan__amount">${p.price}</span>
                <span class="plan__per mono">${p.per}</span>
              </p>
              <span class="plan__rule" aria-hidden="true"></span>
            </article>`;
          })
          .join("")}
      </div>

      <p class="pricing__note">${PRICING.note}</p>

      <div class="pricing__cta">
        <a class="btn btn--primary pricing__btn" data-magnetic href="${PRICING.cta.href}">${PRICING.cta.label}</a>
      </div>
    </div>`;

  const head = root.querySelector(".pricing__head");
  const plans = gsap.utils.toArray(root.querySelectorAll(".plan"));
  const note = root.querySelector(".pricing__note");
  const cta = root.querySelector(".pricing__cta");

  if (env.reduced) {
    gsap.set([head, ...plans, note, cta], { autoAlpha: 1, y: 0, scale: 1 });
    return;
  }

  // Header arrives first via the shared helper.
  reveal(head, { y: 30, trigger: root });

  // Plans rise with spatial depth: lift + a touch of scale, the featured plan a
  // hair higher so the eye lands on it. Staggered, eased power3.out, fired once.
  gsap.set(plans, { autoAlpha: 0, y: 64, scale: 0.965 });
  ctx.ScrollTrigger.create({
    trigger: root.querySelector(".pricing__plans"),
    start: "top 80%",
    once: true,
    onEnter: () =>
      gsap.to(plans, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
      }),
  });

  // Note + CTA settle in after the cards.
  reveal([note, cta], { y: 24, stagger: 0.1, start: "top 88%", trigger: root.querySelector(".pricing__plans") });

  // Pointer-driven hover elevation (transform + shadow handled in CSS via a class).
  plans.forEach((card) => {
    card.addEventListener("mouseenter", () =>
      gsap.to(card, { y: -8, duration: 0.4, ease: "power2.out", overwrite: "auto" }),
    );
    card.addEventListener("mouseleave", () =>
      gsap.to(card, { y: 0, duration: 0.5, ease: "power3.out", overwrite: "auto" }),
    );
  });
}
