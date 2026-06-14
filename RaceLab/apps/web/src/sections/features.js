// features.js — the product depth section: a horizontal-scroll gallery of
// phone-frame cards driven by vertical scroll inside a pinned viewport (desktop),
// or native swipe-to-scroll (mobile). Copy comes from FEATURES in config.js.
import { FEATURES } from "../config.js";

export function init(ctx) {
  const { gsap, ScrollTrigger, env, reveal } = ctx;
  const root = document.getElementById("features");
  if (!root) return;

  root.innerHTML = `
    <div class="container features__head">
      <p class="eyebrow">${FEATURES.eyebrow}</p>
      <h2 class="features__title">${FEATURES.heading}</h2>
      <p class="features__hint mono" aria-hidden="true">scroll &rarr;</p>
    </div>
    <div class="features__viewport" role="region" tabindex="0" aria-label="Feature gallery">
      <div class="features__track">
        ${FEATURES.cards
          .map(
            (c, i) => `
        <article class="fcard">
          <div class="fcard__phone">
            <span class="fcard__index mono">0${i + 1}</span>
            <div class="fcard__bar"></div>
            <div class="fcard__accent"></div>
            <div class="fcard__row"></div>
            <div class="fcard__row"></div>
            <div class="fcard__row short"></div>
          </div>
          <div class="fcard__meta">
            <h3 class="fcard__t">${c.t}</h3>
            <p class="fcard__d">${c.d}</p>
          </div>
        </article>`,
          )
          .join("")}
      </div>
    </div>`;

  const viewport = root.querySelector(".features__viewport");
  const track = root.querySelector(".features__track");
  const cards = gsap.utils.toArray(root.querySelectorAll(".fcard"));

  // Reduced motion: native horizontal overflow, full-visible cards, no scroll rig.
  if (env.reduced) {
    viewport.classList.add("is-native");
    gsap.set(cards, { autoAlpha: 1, scale: 1 });
    return;
  }

  // Mobile: native horizontal overflow + a vertical entrance reveal. No pinning.
  if (env.isMobile) {
    viewport.classList.add("is-native");
    reveal(cards, { stagger: 0.1 });
    return;
  }

  // Desktop: pin the section and translate the track left by its overflow width
  // across the pinned scroll distance — vertical scroll drives horizontal motion.
  const distance = () => track.scrollWidth - innerWidth + 80;

  const horizontal = gsap.to(track, {
    x: () => -distance(),
    ease: "none",
    scrollTrigger: {
      trigger: root,
      start: "top top",
      end: () => "+=" + distance(),
      scrub: true,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  // Per-card depth: each card scales 0.85 -> 1 and lifts as it crosses the
  // viewport center, scrubbed against the horizontal container animation.
  cards.forEach((card) => {
    gsap.set(card, { scale: 0.85, autoAlpha: 0.55, y: 26 });
    gsap.to(card, {
      scale: 1,
      autoAlpha: 1,
      y: 0,
      ease: "power2.inOut",
      scrollTrigger: {
        trigger: card,
        containerAnimation: horizontal,
        start: "left 88%",
        end: "center 52%",
        scrub: true,
      },
    });
  });
}
