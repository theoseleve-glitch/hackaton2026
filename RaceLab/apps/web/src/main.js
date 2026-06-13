import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { env } from "./env.js";
import { reveal } from "./reveal.js";

gsap.registerPlugin(ScrollTrigger);

// Lenis smooth scroll (skipped under reduced-motion) synced to ScrollTrigger.
let lenis = null;
if (!env.reduced) {
  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

const ctx = { gsap, ScrollTrigger, lenis, env, reveal };

async function boot() {
  const mods = await Promise.all([
    import("./nav.js"),
    import("./cursor.js"),
    import("./sections/hero.js"),
    import("./sections/problem.js"),
    import("./sections/engineer.js"),
    import("./sections/loop.js"),
    import("./sections/features.js"),
    import("./sections/proof.js"),
    import("./sections/pricing.js"),
    import("./sections/finalCta.js"),
  ]);
  for (const m of mods) m.init?.(ctx);
  // The tune signature scene boots last (heaviest); it owns its own fallback.
  import("./scene/tuneSequence.js").then((m) => m.init(ctx)).catch(() => {});
  ScrollTrigger.refresh();
}

// Preloader runs first, then reveals + boots.
import("./preloader.js").then((m) => m.run(ctx, boot)).catch(boot);
