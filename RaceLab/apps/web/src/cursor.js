// cursor.js — custom lerp-follow cursor + magnetic buttons.
// Desktop, motion-OK only: gated on !env.isMobile && !env.reduced.
// Listeners are DELEGATED on document so elements injected later by the section
// modules (every CTA, link, [data-magnetic]) are covered regardless of init order.
// Animates transform/opacity only; coarse pointers keep the native cursor.
import { gsap } from "gsap";
import { env } from "./env.js";

export function init() {
  if (env.isMobile || env.reduced) return;
  const dot = document.getElementById("cursor");
  if (!dot) return;

  let mx = innerWidth / 2, my = innerHeight / 2, x = mx, y = my, started = false;

  addEventListener(
    "mousemove",
    (e) => {
      mx = e.clientX;
      my = e.clientY;
      // Reveal the custom cursor only once the user actually moves a mouse —
      // keyboard-only users keep the native cursor.
      if (!started) {
        started = true;
        document.body.dataset.cursor = "on";
      }
    },
    { passive: true },
  );

  // Lerp the dot toward the pointer each frame for a trailing feel.
  gsap.ticker.add(() => {
    x += (mx - x) * 0.2;
    y += (my - y) * 0.2;
    gsap.set(dot, { x, y });
  });

  const hot = (el) => el && el.closest && el.closest("a, button, [data-magnetic]");

  // Grow the dot over any interactive / magnetic target (delegated).
  document.addEventListener("mouseover", (e) => {
    if (hot(e.target)) {
      gsap.to(dot, { scale: 2.4, duration: 0.3, ease: "power3.out", overwrite: "auto" });
    }
  });
  document.addEventListener("mouseout", (e) => {
    if (hot(e.target) && !hot(e.relatedTarget)) {
      gsap.to(dot, { scale: 1, duration: 0.3, ease: "power3.out", overwrite: "auto" });
    }
  });

  // Magnetic pull: the [data-magnetic] under the pointer drifts toward it within
  // an 80px radius, snapping back on leave. Delegated so injected CTAs are covered.
  let active = null;
  document.addEventListener(
    "mousemove",
    (e) => {
      const el = e.target.closest ? e.target.closest("[data-magnetic]") : null;
      if (el) {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) < 80) {
          active = el;
          gsap.to(el, { x: dx * 0.4, y: dy * 0.4, duration: 0.4, ease: "power3.out", overwrite: "auto" });
          return;
        }
      }
      if (active) {
        gsap.to(active, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1,0.4)", overwrite: "auto" });
        active = null;
      }
    },
    { passive: true },
  );
}
