// preloader.js — wireframe-assemble ceremony: chassis strokes draw on, a
// 000..100 mono counter ticks up, then the whole panel wipes up to reveal the page.
// Minimum ~1.6s even when assets are already cached, so the moment always lands.
import { BRAND } from "./config.js";

export function run(ctx, boot) {
  const { gsap, env } = ctx;
  const el = document.getElementById("preloader");

  // No ceremony under reduced-motion (or if the markup is absent): reveal instantly.
  if (!el || env.reduced) {
    el?.remove();
    document.body.removeAttribute("data-loading");
    boot();
    return;
  }

  el.querySelector("[data-brand]")?.replaceChildren(BRAND);
  const counter = el.querySelector("[data-count]");
  const lines = el.querySelectorAll(".preloader__car path");

  const setCount = (v) =>
    counter && (counter.textContent = String(Math.round(v)).padStart(3, "0"));

  // Each path starts fully hidden (offset == its own length) then draws to 0.
  // Normalising to a unit dasharray lets one tween drive every path regardless
  // of its real length, so the stagger reads cleanly.
  gsap.set(lines, { strokeDasharray: 1, strokeDashoffset: 1 });
  setCount(0);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.remove();
    document.body.removeAttribute("data-loading");
    boot();
  };

  const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });

  // Draw the chassis (1) and run the counter (2) in parallel from t=0.
  tl.to(lines, { strokeDashoffset: 0, duration: 1.4, stagger: 0.12 }, 0)
    .to(
      { v: 0 },
      {
        v: 100,
        duration: 1.4,
        ease: "power1.out",
        onUpdate() {
          setCount(this.targets()[0].v);
        },
        onComplete: () => setCount(100),
      },
      0
    )
    // Brief beat at 100 so the finished silhouette registers, then wipe up.
    .to(
      el,
      {
        yPercent: -100,
        duration: 0.7,
        ease: "power3.inOut",
        onComplete: finish,
      },
      ">+=0.2"
    );

  // Safety net: if a tween hook ever stalls, never trap the page behind the panel.
  gsap.delayedCall(4, finish);
}
