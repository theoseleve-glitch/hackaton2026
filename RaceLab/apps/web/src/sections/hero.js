// hero.js — section 1: viewport hero. Split-text headline + magnetic CTAs +
// a mix-blend-mode knockout word over a CSS-art machine. Three.js is reserved
// for the TUNE signature; the hero stays text-first for a fast LCP.
import { HERO } from "../config.js";
import { wantsHeavyGfx } from "../env.js";

// Wrap each word of a line in <span class="word"><span class="inner">…</span></span>
// so the inner span can slide up from below a clipping mask.
const splitLine = (line) =>
  line
    .split(" ")
    .map((w) => `<span class="word"><span class="inner">${w}</span></span>`)
    .join(" ");

export function init(ctx) {
  const { gsap, ScrollTrigger, env } = ctx;
  const root = document.getElementById("hero");
  if (!root) return;

  root.innerHTML = `
    <div class="hero__stage" aria-hidden="true">
      <div class="hero__glow"></div>
      <div class="hero__machine">
        <span class="hero__machine-body"></span>
        <span class="hero__machine-wing"></span>
        <span class="hero__machine-wheel hero__machine-wheel--f"></span>
        <span class="hero__machine-wheel hero__machine-wheel--r"></span>
        <span class="hero__machine-shadow"></span>
      </div>
    </div>

    <div class="container hero__inner">
      <p class="eyebrow hero__eyebrow">${HERO.eyebrow}</p>
      <h1 class="hero__headline">
        ${HERO.headline.map((line) => `<span class="hero__line">${splitLine(line)}</span>`).join("")}
      </h1>
      <p class="hero__subhead">${HERO.subhead}</p>
      <div class="hero__cta">
        <a class="btn btn--primary" data-magnetic href="${HERO.ctaPrimary.href}">${HERO.ctaPrimary.label}</a>
        <a class="btn btn--ghost" href="${HERO.ctaSecondary.href}">${HERO.ctaSecondary.label}</a>
      </div>
      <a class="hero__scrollcue" href="${HERO.ctaSecondary.href}" aria-label="Scroll to see how it works">
        <span class="hero__scrollcue-label mono">Scroll</span>
        <span class="hero__scrollcue-track"><span class="hero__scrollcue-dot"></span></span>
      </a>
    </div>`;

  const words = root.querySelectorAll(".hero__headline .inner");
  const subhead = root.querySelector(".hero__subhead");
  const cta = root.querySelector(".hero__cta");
  const eyebrow = root.querySelector(".hero__eyebrow");
  const cue = root.querySelector(".hero__scrollcue");

  // Reduced motion: paint final states, register nothing scroll-driven.
  if (env.reduced) {
    gsap.set([words, subhead, cta, eyebrow, cue], { autoAlpha: 1, yPercent: 0, y: 0 });
    return;
  }

  // Entrance: words rise from behind their clip mask, then the rest fades up.
  gsap.set(words, { yPercent: 110 });
  gsap.set([eyebrow, subhead, cta, cue], { autoAlpha: 0, y: 24 });

  // Kept brisk so the headline (the LCP element) reaches its final paint fast.
  const tl = gsap.timeline({ defaults: { ease: "power3.out" }, delay: 0.05 });
  tl.to(eyebrow, { autoAlpha: 1, y: 0, duration: 0.45 })
    .to(words, { yPercent: 0, duration: 0.75, stagger: 0.07 }, "-=0.25")
    .to(subhead, { autoAlpha: 1, y: 0, duration: 0.8 }, "-=0.5")
    .to(cta, { autoAlpha: 1, y: 0, duration: 0.8 }, "-=0.65")
    .to(cue, { autoAlpha: 1, y: 0, duration: 0.6 }, "-=0.5");

  // Scroll cue: a soft looping pulse on the dot.
  gsap.to(".hero__scrollcue-dot", {
    yPercent: 220,
    autoAlpha: 0,
    duration: 1.4,
    ease: "power1.inOut",
    repeat: -1,
    repeatDelay: 0.2,
  });

  // Machine parallax: drift on scroll-out (transform/opacity only).
  gsap.to(".hero__machine", {
    yPercent: 14,
    ease: "none",
    scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: true },
  });
  gsap.to(".hero__inner", {
    yPercent: -10,
    autoAlpha: 0.35,
    ease: "none",
    scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: true },
  });

  // Upgrade the hero centerpiece to the real procedural car on capable desktops,
  // lazily (after first paint, so the headline stays the LCP). The CSS-art machine
  // is the documented fallback whenever WebGL is unavailable.
  if (wantsHeavyGfx) {
    const stage = root.querySelector(".hero__stage");
    const machine = root.querySelector(".hero__machine");
    const host = document.createElement("div");
    host.className = "hero__car";
    host.setAttribute("aria-hidden", "true");
    stage.appendChild(host);
    import("../scene/car.js")
      .then(({ createCar }) => {
        if (machine) machine.style.display = "none";
        const car = createCar(host);
        const tick = () => { car.parts.group.rotation.y += 0.0025; car.render(); };
        let running = false, inView = true;
        const start = () => { if (!running) { gsap.ticker.add(tick); running = true; } };
        const stop = () => { if (running) { gsap.ticker.remove(tick); running = false; } };
        start();
        addEventListener("resize", car.resize);
        const io = new IntersectionObserver(
          ([e]) => { inView = e.isIntersecting; inView ? start() : stop(); },
          { rootMargin: "100px" },
        );
        io.observe(root);
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) stop();
          else if (inView) start();
        });
      })
      .catch(() => { /* keep the CSS-art machine */ });
  }
}
