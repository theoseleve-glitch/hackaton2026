// scene/tuneSequence.js — the SIGNATURE moment.
// A pinned section where scrolling IS the act of tuning: the procedural RC
// buggy from car.js drops its ride height, tilts camber, pumps its shocks,
// sets its wing, then explodes to reveal the bare chassis — while real
// setup-sheet values (from config.TUNE) light up in sync on the rail.
//
// Resilience: if heavy GFX is unwanted (reduced-motion / reduced-data / no
// WebGL), we render a static CSS-art stage and reveal every step at once —
// no pin, no scrub, no Three.js. All copy comes from config; nothing hard-coded.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TUNE } from "../config.js";
import { wantsHeavyGfx, env } from "../env.js";
import { reveal } from "../reveal.js";

export function init(ctx) {
  const root = document.getElementById("tune");
  if (!root) return;

  // --- Pinned DOM: full-bleed stage (WebGL canvas) + a copy rail. ---
  root.innerHTML = `
    <div class="tune__pin">
      <div class="tune__stage" aria-hidden="true">
        <div class="tune__static" aria-hidden="true">
          <svg class="tune__chassis" viewBox="0 0 320 180" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">
            <path d="M28 120 L90 120 M230 120 L292 120" />
            <path d="M96 120 q64 -70 128 0" />
            <path d="M54 120 q-6 -42 42 -48 l92 0 q48 6 42 48" />
            <path d="M200 66 l46 -14 l3 20" opacity="0.85" />
            <circle cx="96" cy="138" r="22" />
            <circle cx="224" cy="138" r="22" />
            <line x1="118" y1="138" x2="202" y2="138" opacity="0.5" />
          </svg>
        </div>
      </div>
      <div class="tune__rail">
        <p class="eyebrow">${TUNE.eyebrow}</p>
        <h2 class="tune__heading">${TUNE.heading}</h2>
        <div class="tune__steps">
          ${TUNE.steps
            .map(
              (s, i) => `
            <div class="tune__step" data-step="${i}">
              <span class="tune__index mono">0${i + 1}</span>
              <span class="tune__part">${s.part}</span>
              <span class="tune__value mono">${s.value}</span>
              <span class="tune__note">${s.note}</span>
            </div>`,
            )
            .join("")}
        </div>
        <p class="tune__caption">${TUNE.caption}</p>
      </div>
    </div>`;

  const stage = root.querySelector(".tune__stage");
  const rail = root.querySelector(".tune__rail");
  const steps = gsap.utils.toArray(root.querySelectorAll(".tune__step"));

  // --- Fallback: static CSS-art stage, all steps visible, no scroll motion. ---
  if (!wantsHeavyGfx) {
    stage.classList.add("tune__stage--static");
    if (env.reduced) {
      gsap.set(steps, { autoAlpha: 1, y: 0 });
      steps.forEach((s) => s.classList.add("is-active"));
    } else {
      steps.forEach((s) => s.classList.add("is-active"));
      reveal(steps, { stagger: 0.12 });
    }
    return;
  }

  // --- Dynamic, WebGL-driven signature. ---
  import("./car.js")
    .then(({ createCar }) => {
      const car = createCar(stage);
      stage.classList.add("tune__stage--live");
      const p = car.parts;

      // Drive Three.js render off the GSAP ticker, but ONLY while #tune is on
      // screen (and the tab is visible) — otherwise the GPU keeps drawing the
      // buggy through the rest of the page, hurting the FPS/battery targets.
      let rendering = false;
      let inView = true;
      const startRender = () => {
        if (!rendering) { gsap.ticker.add(car.render); rendering = true; }
      };
      const stopRender = () => {
        if (rendering) { gsap.ticker.remove(car.render); rendering = false; car.render(); }
      };
      startRender();
      const io = new IntersectionObserver(
        ([e]) => { inView = e.isIntersecting; inView ? startRender() : stopRender(); },
        { rootMargin: "200px" },
      );
      io.observe(root);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopRender();
        else if (inView) startRender();
      });
      const onResize = () => car.resize();
      addEventListener("resize", onResize);

      // Highlight exactly one rail step at a time.
      const activate = (i) =>
        steps.forEach((s, j) => s.classList.toggle("is-active", j === i));

      // Steps start dimmed; each lights as its segment is reached.
      gsap.set(steps, { autoAlpha: 0.22, y: 14 });

      // Velocity-skew the rail on fast scroll (clamped ±6deg).
      let skewTween = null;
      const skewRail = (self) => {
        const skew = gsap.utils.clamp(-6, 6, self.getVelocity() / -320);
        skewTween = gsap.to(rail, {
          skewY: skew,
          duration: 0.35,
          ease: "power2.out",
          overwrite: true,
          onComplete: () => gsap.to(rail, { skewY: 0, duration: 0.5, ease: "power2.out" }),
        });
      };

      // One scrubbed timeline, normalized 0..1 across +=400% of scroll.
      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "+=400%",
          scrub: true,
          pin: ".tune__pin",
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: skewRail,
        },
      });

      // 0.00–0.18 — rotate the car in + drop ride height (step 0: Ride height).
      tl.fromTo(
        p.group.rotation,
        { y: -0.6 },
        { y: 0.3, duration: 0.18 },
        0,
      )
        .to([p.body.position, p.chassis.position], { y: "-=0.12", duration: 0.18 }, 0)
        .to(steps[0], { autoAlpha: 1, y: 0, duration: 0.05, ease: "power3.out", onStart: () => activate(0) }, 0.02)

        // 0.18–0.40 — camber tilt on the front wheels (step 1: Camber).
        .to(p.frontWheels.rotation, { z: -0.13, duration: 0.22 }, 0.18)
        .to(p.rearWheels.rotation, { z: -0.08, duration: 0.22 }, 0.18)
        .to(steps[1], { autoAlpha: 1, y: 0, duration: 0.05, ease: "power3.out", onStart: () => activate(1) }, 0.2)

        // 0.40–0.62 — shock travel: rear shocks extend + a slight squat (step 2: Shock oil).
        .to(p.shocks.scale, { y: 1.15, duration: 0.22 }, 0.4)
        .to(p.body.rotation, { z: -0.04, duration: 0.22 }, 0.4)
        .to(steps[2], { autoAlpha: 1, y: 0, duration: 0.05, ease: "power3.out", onStart: () => activate(2) }, 0.42)

        // 0.62–0.82 — set the wing angle (step 3: Wing).
        .to(p.wing.rotation, { z: 0.5, duration: 0.2 }, 0.62)
        .to(steps[3], { autoAlpha: 1, y: 0, duration: 0.05, ease: "power3.out", onStart: () => activate(3) }, 0.64)

        // 0.82–1.00 — EXPLODE: parts fly apart, revealing the chassis plate.
        .to(p.group.rotation, { y: 0.62, duration: 0.18 }, 0.82)
        .to(p.body.position, { y: "+=0.85", duration: 0.18 }, 0.82)
        .to(p.body.rotation, { z: 0, duration: 0.18 }, 0.82)
        .to(p.wing.position, { x: "-=0.7", y: "+=0.55", duration: 0.18 }, 0.82)
        .to(p.frontWheels.position, { x: "+=0.6", duration: 0.18 }, 0.82)
        .to(p.rearWheels.position, { x: "-=0.6", duration: 0.18 }, 0.82)
        .to(p.shocks.position, { y: "+=0.45", duration: 0.18 }, 0.82)
        .to(rail, { onStart: () => activate(-1) }, 0.86);

      // Release the per-frame render + listeners if this trigger is ever killed.
      ScrollTrigger.addEventListener("refreshInit", () => {
        if (skewTween) skewTween.kill();
        gsap.set(rail, { skewY: 0 });
      });
    })
    .catch(() => {
      // WebGL import failed at runtime → degrade to the static stage.
      stage.classList.add("tune__stage--static");
      steps.forEach((s) => s.classList.add("is-active"));
      reveal(steps, { stagger: 0.12 });
    });
}
