# RaceLab Marketing Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an award-level, single-page, scroll-driven marketing site for the RC-racing app whose signature moment is a 3D RC car that tunes itself as you scroll.

**Architecture:** Static, vanilla HTML/CSS/JS served over HTTP, no bundler. ESM modules wired through an import map. A single `config.js` is the source of truth for all copy, pricing, links, and the swappable `BRAND` token. Each section is one ESM module exposing `init(ctx)`; `main.js` boots Lenis + GSAP/ScrollTrigger and calls each module. Three.js (the hero car + tune sequence) is dynamic-imported off the critical path with a static fallback.

**Tech Stack:** Vanilla HTML/CSS/JS · GSAP 3.12 + ScrollTrigger · Three.js 0.169 · Lenis 1.1 · Google Fonts (Space Grotesk + Space Mono) · Vercel static hosting.

**Spec:** `docs/superpowers/specs/2026-06-14-racelab-marketing-site-design.md`

---

## Conventions & environment

- **All work happens in the worktree** `C:\Users\Admin\Documents\wt-theo-racelab` on branch `theo/racelab`. Site root is `RaceLab/apps/web/`. **Never commit RaceLab on `r3`.**
- **Staging:** always `git add <explicit paths>`. Never `git add -A`.
- **Commit messages:** no double quotes (use `git commit -F -` heredocs from the Bash tool). End every commit with the co-author trailer.
- **Serve locally:** `npx serve RaceLab/apps/web -l 5173` (any static server works; import maps need HTTP, not `file://`).
- **Library loading** (in `index.html`, before `main.js`):

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/",
    "gsap": "https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js",
    "gsap/ScrollTrigger": "https://cdn.jsdelivr.net/npm/gsap@3.12.5/ScrollTrigger.js",
    "lenis": "https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.mjs"
  }
}
</script>
```
If any CDN URL 404s at runtime, bump the patch version and re-check — do not silently drop the library.

## File structure

```
RaceLab/apps/web/
  index.html              # shell, importmap, font preloads, all section <section> stubs
  vercel.json             # static hosting config
  styles/
    base.css              # reset, :root tokens, typography, grain, cursor, buttons, utilities
    sections.css          # per-section layout
  src/
    config.js             # SINGLE source of truth: BRAND, copy, pricing, links, headline variants
    main.js               # boot: Lenis + GSAP register + ctx + init each module
    env.js                # reduced-motion flag, isMobile, supportsWebGL, prefersReducedData
    cursor.js             # lerp custom cursor + magnetic buttons
    nav.js                # hide-on-scroll-down / reveal-on-up + mobile menu + active link
    preloader.js          # wireframe-assemble ceremony + 0..100 counter
    reveal.js             # shared scroll-entrance helper (stagger, power3.out)
    scene/
      car.js              # Three.js procedural RC buggy: scene/camera/lights/build/render
      tuneSequence.js     # ScrollTrigger scrub -> car-transform timeline (the signature)
    sections/
      hero.js  problem.js  engineer.js  loop.js
      features.js  proof.js  pricing.js  finalCta.js
  test/
    config.test.mjs       # node --test: config integrity contract
  assets/                 # favicon.svg, og.png (added in verification task)
```

Each `sections/*.js` exports `export function init(ctx) {}` where `ctx = { gsap, ScrollTrigger, lenis, env, reveal }`. `scene/*` export named init functions. `main.js` owns the registry and order.

---

## Task 0: Scaffold — config contract, shell, tokens, dev server

**Files:**
- Create: `RaceLab/apps/web/src/config.js`
- Create: `RaceLab/apps/web/index.html`
- Create: `RaceLab/apps/web/styles/base.css`
- Create: `RaceLab/apps/web/styles/sections.css` (empty stub with a header comment)
- Create: `RaceLab/apps/web/vercel.json`
- Create: `RaceLab/apps/web/test/config.test.mjs`

- [ ] **Step 1: Write `config.js` (the contract).** This is consumed by every later task — names are fixed here.

```js
// config.js — single source of truth. Swap BRAND in one place.
export const BRAND = "RaceLab"; // placeholder; public sign-off pending (candidate: GripLab)
export const LINKS = {
  trial: "https://griplab.app",
  account: "https://griplab.app",
};
export const NAV = [
  { label: "How it works", href: "#tune" },
  { label: "The loop", href: "#loop" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];
export const HERO = {
  eyebrow: "THE STRAVA OF RC RACING",
  headline: ["TUNE LESS.", "WIN MORE."],
  headlineVariants: [["GET", "DIALED."], ["STOP GUESSING", "YOUR SETUP."]],
  subhead: "Log every run. Get one grounded change from an AI race engineer that knows your track, your weather, and whether its advice actually worked.",
  ctaPrimary: { label: "Start free trial", href: LINKS.trial },
  ctaSecondary: { label: "See how it works", href: "#tune" },
};
export const PROBLEM = {
  eyebrow: "THE PROBLEM",
  heading: "40 tunable parameters. One question:",
  big: "What do I change?",
  body: "Camber, ride height, shock oil, diff, springs, wing. Most racers copy a fast guy's sheet and hope. The conditions that decide everything — surface, grip, weather — never make it into the advice.",
};
export const TUNE = {
  eyebrow: "TUNE IT LIVE",
  heading: "One change at a time.",
  caption: "Real setup values. Real cause and effect. The way a race engineer actually works — isolate one variable, see what it does.",
  steps: [
    { part: "Ride height", value: "-1.0 mm", note: "less body roll" },
    { part: "Camber", value: "-2.0°", note: "more grip mid-corner" },
    { part: "Shock oil", value: "+50 cSt rear", note: "calmer on power" },
    { part: "Wing", value: "+5°", note: "stable in the fast stuff" },
  ],
  explode: "See every part. Nothing hidden.",
};
export const ENGINEER = {
  eyebrow: "YOUR AI RACE ENGINEER",
  heading: "Strava tells you what you did. RaceLab tells you what to change.",
  report: [
    { k: "Diagnosis", v: "Car pushes mid-corner on power; rear feels planted." },
    { k: "Primary change", v: "Drop front ride height 1 mm — frees rotation on entry." },
    { k: "Secondary", v: "If it still pushes, soften front sway 0.2 mm." },
    { k: "Don't touch", v: "Diff and rear shocks are right for these conditions." },
    { k: "Expected", v: "Sharper turn-in, a touch more steering on throttle." },
    { k: "Driving tip", v: "Brake one car-length earlier into the hairpin; let it rotate." },
    { k: "Confidence", v: "High — matches HUDY rule 4.2 for high-grip blue groove." },
    { k: "Why", v: "Grounded in your last 3 runs + today's track temp and grip." },
  ],
  principles: [
    { t: "One change at a time", d: "Never a dump of five guesses. One ranked, reversible move." },
    { t: "Grounded or silent", d: "Every change cites a knowledge-base rule — or we say stick with what you have." },
    { t: "On-device. No signal needed", d: "Works in the pits with dead Wi-Fi. Zero API on the advice path." },
  ],
  duel: { before: "18.40", after: "18.06", delta: "-0.34s", label: "avg lap, before vs after one change" },
};
export const LOOP = {
  eyebrow: "THE LOOP",
  heading: "Every run makes the next one faster.",
  stations: [
    { n: "Race", d: "Transponder laps + conditions auto-captured." },
    { n: "Log", d: "Setup attached to the run, quick feedback, photos." },
    { n: "Engineer", d: "One grounded change to try, with the why." },
    { n: "Result", d: "Better / same / worse — the AI learns you." },
    { n: "Share", d: "Verified results attached; others fork it." },
  ],
  punchline: "Each logged run teaches the AI what actually works — a flywheel a static setup vault can never copy.",
};
export const FEATURES = {
  eyebrow: "THE APP",
  heading: "Built for the pit lane.",
  cards: [
    { t: "Garage", d: "Every car, every typology — nitro or electric, the sheet adapts." },
    { t: "Setup sheets", d: "Immutable versions. See exactly what changed vs the kit." },
    { t: "Tracks", d: "Corner-by-corner, surfaces, conditions, lap records." },
    { t: "Run log", d: "Log a run in under 10 seconds, trackside, offline." },
    { t: "Compare", d: "Two runs side by side: setup vs conditions vs tyres." },
    { t: "Engineer report", d: "The 8-part report, grounded in your history." },
    { t: "Race planner", d: "Time-first pit windows. Box at 5:50, not lap 14." },
    { t: "Speedhive", d: "Transponder laps import themselves. New run detected." },
  ],
};
export const PROOF = {
  eyebrow: "WHY IT'S DIFFERENT",
  heading: "The Strava of RC racing — but prescriptive.",
  rows: [
    { a: "Activity (ride/run)", b: "Race day, auto-created from timing data" },
    { a: "GPS trace", b: "Lap times + the setup sheet attached to the run" },
    { a: "Kudos", b: "Props — Dialed · Send it · Tough break" },
    { a: "Segments & leaderboards", b: "Per-track, per-class lap leaderboards" },
    { a: "Year in Review", b: "Season Wrapped" },
    { a: "— (no equivalent)", b: "An AI race engineer that tells you what to change" },
  ],
  punchline: "Strava is descriptive. RaceLab is prescriptive.",
  facts: ["100% on-device advice", "0 API calls on the advice path", "8-part engineer report", "Transponder-verified results"],
};
export const PRICING = {
  eyebrow: "PRICING",
  heading: "Start with 15 days free.",
  plans: [
    { name: "Monthly", price: "€9.99", per: "/ month", highlight: false },
    { name: "Annual", price: "€99.99", per: "/ year", highlight: true, badge: "2 months free" },
  ],
  note: "Create your account on the web — it's cheaper there (no app-store cut).",
  cta: { label: "Start your 15-day free trial", href: LINKS.trial },
};
export const FINAL = {
  heading: "Get dialed.",
  sub: "Your next run could be your fastest.",
  cta: { label: "Start your 15-day free trial", href: LINKS.trial },
};
export const FOOTER = {
  tagline: "On-device · grounded or silent · made by racers.",
  links: [
    { label: "How it works", href: "#tune" },
    { label: "Pricing", href: "#pricing" },
    { label: "griplab.app", href: LINKS.trial },
  ],
  legal: "Pre-launch.",
};
```

- [ ] **Step 2: Write the config contract test** at `test/config.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/config.js";

test("BRAND is a non-empty string", () => {
  assert.equal(typeof C.BRAND, "string");
  assert.ok(C.BRAND.length > 0);
});
test("every CTA points at griplab.app", () => {
  const hrefs = [C.HERO.ctaPrimary.href, C.PRICING.cta.href, C.FINAL.cta.href];
  for (const h of hrefs) assert.match(h, /griplab\.app/);
});
test("pricing has monthly 9.99 and annual 99.99", () => {
  assert.ok(C.PRICING.plans.some(p => p.price.includes("9.99") && p.per.includes("month")));
  assert.ok(C.PRICING.plans.some(p => p.price.includes("99.99") && p.per.includes("year")));
});
test("the loop has exactly 5 stations in order", () => {
  assert.deepEqual(C.LOOP.stations.map(s => s.n), ["Race","Log","Engineer","Result","Share"]);
});
test("engineer report has all 8 parts", () => {
  assert.equal(C.ENGINEER.report.length, 8);
});
test("tune has 4 scrubbed steps", () => {
  assert.equal(C.TUNE.steps.length, 4);
});
```

- [ ] **Step 3: Run the test, expect PASS.**

Run: `node --test RaceLab/apps/web/test/config.test.mjs`
Expected: all tests pass (`# pass 6`). If a path error, fix the relative import.

- [ ] **Step 4: Write `index.html`** — the shell with the importmap (from Conventions), Google Fonts preload, a `#cursor` element, a `#preloader` element, `<nav>`, and one empty `<section id="...">` per section in order: `hero, problem, tune, engineer, loop, features, proof, pricing, final`, plus `<footer>`. Body gets `data-loading`. Include `<link rel="preconnect">` for fonts and `<link rel="preload" as="style">` for the Space Grotesk CSS, plus a `<noscript>` style that reveals all content. End `<body>` with `<script type="module" src="/src/main.js"></script>`. Headings use semantic `<h1>` (hero) / `<h2>` (sections). Each section module fills its own `<section>` at init.

- [ ] **Step 5: Write `styles/base.css`** — reset (`*{box-sizing:border-box;margin:0}`), `html{scroll-behavior:auto}`, `:root` with the exact tokens from spec §4 (`--bg #0E0F12`, variants, `--surface`, `--surface-alt`, `--border`, `--text`, `--sub`, `--accent #FF5A26`, `--accent-soft`, `--good`, `--warn`, plus `--maxw:1280px`, fluid type vars). Set `body{background:var(--bg);color:var(--text);font-family:"Space Grotesk",system-ui,sans-serif;-webkit-font-smoothing:antialiased}`. Add: `.eyebrow{font-family:"Space Mono",monospace;font-size:11px;text-transform:uppercase;letter-spacing:3px;color:var(--accent)}`; `.grain` fixed full-screen overlay with an inline SVG `feTurbulence` data-URI at `opacity:.04;mix-blend-mode:overlay;pointer-events:none`; custom cursor base (`#cursor{position:fixed;width:14px;height:14px;border-radius:50%;background:var(--accent);pointer-events:none;z-index:9999;transform:translate(-50%,-50%);mix-blend-mode:difference}` and `@media (pointer:coarse){#cursor{display:none}}` plus `body{cursor:none}` only when `data-cursor="on"`); button styles (`.btn`, `.btn--primary` solid accent, `.btn--ghost` outline, both with multi-layer shadow + transform hover); `.skip-link`; `:focus-visible{outline:2px solid var(--accent);outline-offset:3px}`; and the reduced-motion block:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  #cursor { display: none !important; }
  html { scroll-behavior: auto; }
}
```

- [ ] **Step 6: Write `vercel.json`:**

```json
{ "cleanUrls": true, "headers": [
  { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
] }
```

- [ ] **Step 7: Serve and smoke-check.** Run `npx serve RaceLab/apps/web -l 5173`, open `http://localhost:5173`. Expected: no console errors; off-black background; grain visible; fonts loaded. (Sections still empty.)

- [ ] **Step 8: Commit.**

```bash
git add RaceLab/apps/web/index.html RaceLab/apps/web/vercel.json RaceLab/apps/web/styles RaceLab/apps/web/src/config.js RaceLab/apps/web/test
git commit -F - <<'EOF'
feat(web): scaffold marketing site — config contract, shell, tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 1: `env.js` — capability + preference detection

**Files:** Create `RaceLab/apps/web/src/env.js`

- [ ] **Step 1: Implement.**

```js
export const env = {
  reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  reducedData: matchMedia("(prefers-reduced-data: reduce)").matches,
  isMobile: matchMedia("(max-width: 768px), (pointer: coarse)").matches,
  supportsWebGL: (() => {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch { return false; }
  })(),
};
export const wantsHeavyGfx = !env.reduced && !env.reducedData && env.supportsWebGL;
```

- [ ] **Step 2: Commit.** `git add RaceLab/apps/web/src/env.js` then commit `feat(web): env capability + motion-preference detection`.

---

## Task 2: `main.js` — boot Lenis + GSAP + module registry

**Files:** Create `RaceLab/apps/web/src/main.js`, `RaceLab/apps/web/src/reveal.js`

- [ ] **Step 1: Write `reveal.js`** — a shared entrance helper used by simple sections:

```js
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { env } from "./env.js";

// Animate elements in with a stagger when the container scrolls into view.
export function reveal(targets, { y = 40, stagger = 0.1, start = "top 80%", trigger } = {}) {
  const els = gsap.utils.toArray(targets);
  if (!els.length) return;
  if (env.reduced) { gsap.set(els, { autoAlpha: 1, y: 0 }); return; }
  gsap.set(els, { autoAlpha: 0, y });
  ScrollTrigger.create({
    trigger: trigger || els[0],
    start,
    once: true,
    onEnter: () => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", stagger }),
  });
}
```

- [ ] **Step 2: Write `main.js`:**

```js
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
    import("./nav.js"), import("./cursor.js"),
    import("./sections/hero.js"), import("./sections/problem.js"),
    import("./sections/engineer.js"), import("./sections/loop.js"),
    import("./sections/features.js"), import("./sections/proof.js"),
    import("./sections/pricing.js"), import("./sections/finalCta.js"),
  ]);
  for (const m of mods) m.init?.(ctx);
  // The tune signature scene boots last (heaviest); it owns its own fallback.
  import("./scene/tuneSequence.js").then((m) => m.init(ctx)).catch(() => {});
  ScrollTrigger.refresh();
}

// Preloader runs first, then reveals + boots.
import("./preloader.js").then((m) => m.run(ctx, boot)).catch(boot);
```

- [ ] **Step 3: Verify boot does not crash with empty modules.** Temporarily create empty `nav.js`, `cursor.js`, `preloader.js`, and `sections/*.js` each exporting `export function init(){}` / `export function run(ctx,boot){boot()}`. Serve, confirm console clean. (These get replaced in later tasks.)

- [ ] **Step 4: Commit.** `git add RaceLab/apps/web/src/main.js RaceLab/apps/web/src/reveal.js` then `feat(web): boot pipeline — Lenis + ScrollTrigger + module registry`.

---

## Task 3: `preloader.js` — wireframe-assemble ceremony

**Files:** Create `RaceLab/apps/web/src/preloader.js`; add `#preloader` markup styles in `sections.css`.

- [ ] **Step 1: Implement** — a 0..100 mono counter and an SVG chassis outline whose stroke `stroke-dashoffset` animates from hidden to drawn, minimum 1.6s even if assets are ready, then a wipe-up reveal that calls `boot()`:

```js
import { BRAND } from "./config.js";
export function run(ctx, boot) {
  const { gsap, env } = ctx;
  const el = document.getElementById("preloader");
  if (!el || env.reduced) { el?.remove(); document.body.removeAttribute("data-loading"); boot(); return; }
  el.querySelector("[data-brand]")?.replaceChildren(BRAND);
  const counter = el.querySelector("[data-count]");
  const lines = el.querySelectorAll("path");
  gsap.set(lines, { strokeDasharray: 1, strokeDashoffset: 1 });
  const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
  tl.to(lines, { strokeDashoffset: 0, duration: 1.4, stagger: 0.05 })
    .to({ v: 0 }, { v: 100, duration: 1.4, onUpdate() { counter.textContent = String(Math.round(this.targets()[0].v)).padStart(3, "0"); } }, 0)
    .to(el, { yPercent: -100, duration: 0.7, ease: "power3.inOut", onComplete: () => { el.remove(); document.body.removeAttribute("data-loading"); boot(); } }, "+=0.15");
}
```

- [ ] **Step 2: Style** `#preloader` (fixed, full-screen, `var(--bg)`, centered SVG + counter, `z-index:10000`). The SVG is a simple buggy silhouette (chassis + 4 wheels) drawn with `<path stroke="var(--accent)" fill="none">`.

- [ ] **Step 3: Verify.** Serve; confirm the counter runs 000..100, the silhouette draws, then wipes up to reveal the page. Toggle reduced-motion (DevTools > Rendering) and confirm it is removed instantly.

- [ ] **Step 4: Commit.** `git add RaceLab/apps/web/src/preloader.js RaceLab/apps/web/styles/sections.css` then `feat(web): preloader ceremony — drawn chassis + counter`.

---

## Task 4: `cursor.js` — custom cursor + magnetic buttons

**Files:** Create `RaceLab/apps/web/src/cursor.js`

- [ ] **Step 1: Implement** lerp-follow dot, scale-up on hover of `a,button,[data-magnetic]`, and magnetic pull on `[data-magnetic]` within an 80px radius. Gate entirely on `!env.isMobile && !env.reduced`; set `document.body.dataset.cursor = "on"`.

```js
import { gsap } from "gsap";
import { env } from "./env.js";
export function init() {
  if (env.isMobile || env.reduced) return;
  const dot = document.getElementById("cursor");
  if (!dot) return;
  document.body.dataset.cursor = "on";
  let mx = innerWidth / 2, my = innerHeight / 2, x = mx, y = my;
  addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; });
  gsap.ticker.add(() => { x += (mx - x) * 0.2; y += (my - y) * 0.2; gsap.set(dot, { x, y }); });
  const hot = "a, button, [data-magnetic]";
  document.querySelectorAll(hot).forEach((el) => {
    el.addEventListener("mouseenter", () => gsap.to(dot, { scale: 2.4, duration: 0.3 }));
    el.addEventListener("mouseleave", () => gsap.to(dot, { scale: 1, duration: 0.3 }));
  });
  document.querySelectorAll("[data-magnetic]").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < 80) gsap.to(el, { x: dx * 0.4, y: dy * 0.4, duration: 0.4 });
    });
    el.addEventListener("mouseleave", () => gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1,0.4)" }));
  });
}
```

- [ ] **Step 2: Verify** on desktop: dot follows with lag, grows over buttons, primary CTA pulls toward cursor. On coarse pointer: no dot, native cursor present.

- [ ] **Step 3: Commit.** `git add RaceLab/apps/web/src/cursor.js` then `feat(web): custom cursor + magnetic CTAs`.

---

## Task 5: `nav.js` — smart sticky nav

**Files:** Create `RaceLab/apps/web/src/nav.js`

- [ ] **Step 1: Implement** — render `NAV` links + a primary "Start free trial" button into `<nav>`; hide on scroll-down, reveal on scroll-up; add a `.scrolled` class past 40px; mobile: hamburger toggles a full-screen overlay with large links that stagger in; set the brand wordmark from `BRAND`. Use `ScrollTrigger` or a scroll listener with `lenis` scroll value. Active-section indicator via `ScrollTrigger` per section toggling the matching link's `.active`.

```js
import { BRAND, NAV, HERO } from "./config.js";
import { gsap } from "gsap";
export function init(ctx) {
  const nav = document.querySelector("nav");
  nav.innerHTML = `
    <a class="nav__brand" href="#hero">${BRAND}</a>
    <div class="nav__links">${NAV.map(n => `<a href="${n.href}">${n.label}</a>`).join("")}</div>
    <a class="btn btn--primary nav__cta" data-magnetic href="${HERO.ctaPrimary.href}">${HERO.ctaPrimary.label}</a>
    <button class="nav__burger" aria-label="Menu" aria-expanded="false"><span></span><span></span></button>`;
  let last = 0;
  const onScroll = (y) => {
    nav.classList.toggle("scrolled", y > 40);
    if (y > last && y > 200) nav.classList.add("hidden"); else nav.classList.remove("hidden");
    last = y;
  };
  if (ctx.lenis) ctx.lenis.on("scroll", ({ scroll }) => onScroll(scroll));
  else addEventListener("scroll", () => onScroll(scrollY));
  // mobile overlay
  const burger = nav.querySelector(".nav__burger");
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
    if (open) gsap.from(".nav__links a", { y: 30, autoAlpha: 0, stagger: 0.06, duration: 0.4, ease: "power3.out" });
  });
  nav.querySelectorAll(".nav__links a").forEach(a => a.addEventListener("click", () => nav.classList.remove("open")));
}
```

- [ ] **Step 2: Style** the nav, `.scrolled` (backdrop blur + border), `.hidden` (`transform:translateY(-100%)`), and the `.open` full-screen overlay (mobile). Transition only `transform`/`opacity`/`backdrop-filter`.

- [ ] **Step 3: Verify** desktop hide/reveal + active link; mobile overlay open/close + staggered links.

- [ ] **Step 4: Commit.** `git add RaceLab/apps/web/src/nav.js RaceLab/apps/web/styles/sections.css` then `feat(web): smart sticky nav + mobile overlay`.

---

## Task 6: `scene/car.js` — procedural Three.js RC buggy + fallback

**Files:** Create `RaceLab/apps/web/src/scene/car.js`

- [ ] **Step 1: Build the scene.** Export `createCar(container)` returning `{ group, render, resize, dispose, parts }` where `parts` exposes named handles the tune sequence animates: `{ body, frontWheels, rearWheels, wing, chassis, shocks }`. Build the buggy from primitives — a low-poly body (`BoxGeometry` beveled via `RoundedBoxGeometry` from addons), 4 wheels (`CylinderGeometry`), a wing (`BoxGeometry`), a visible chassis plate, and shock cylinders. Materials: `MeshStandardMaterial` dark metal for body (`color:0x1A1C21`, `metalness:.6`, `roughness:.35`), accent `0xFF5A26` for wing/details. Lights: `HemisphereLight` + a key `DirectionalLight` + a rim light tinted accent. Camera `PerspectiveLayout` ~35° fov. Renderer `antialias:true`, `setPixelRatio(Math.min(devicePixelRatio, env.isMobile ? 1.5 : 2))`, `setClearAlpha(0)`. Add a subtle ground reflection-free contact shadow (a dark radial `PlaneGeometry`).

```js
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { env } from "../env.js";

export function createCar(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(4.2, 2.2, 5.4); camera.lookAt(0, 0.3, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, env.isMobile ? 1.5 : 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x0a0a0c, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(5, 8, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff5a26, 1.6); rim.position.set(-6, 2, -4); scene.add(rim);

  const group = new THREE.Group(); scene.add(group);
  const metal = new THREE.MeshStandardMaterial({ color: 0x1a1c21, metalness: 0.6, roughness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff5a26, metalness: 0.4, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0e0f12, metalness: 0.2, roughness: 0.8 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.3), metal); chassis.position.y = 0.35;
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.6, 1.2, 4, 0.18), metal); body.position.y = 0.75;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.5), accent); wing.position.set(-1.05, 1.05, 0); wing.rotation.z = 0.18;
  const mkWheel = (x, z) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 24), dark); w.rotation.x = Math.PI / 2; w.position.set(x, 0.42, z); return w; };
  const fl = mkWheel(0.85, 0.62), fr = mkWheel(0.85, -0.62), rl = mkWheel(-0.85, 0.62), rr = mkWheel(-0.85, -0.62);
  const frontWheels = new THREE.Group(); frontWheels.add(fl, fr);
  const rearWheels = new THREE.Group(); rearWheels.add(rl, rr);
  const mkShock = (x, z) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), accent); s.position.set(x, 0.55, z); s.rotation.z = 0.3; return s; };
  const shocks = new THREE.Group(); shocks.add(mkShock(0.85, 0.45), mkShock(0.85, -0.45), mkShock(-0.85, 0.45), mkShock(-0.85, -0.45));
  group.add(chassis, body, wing, frontWheels, rearWheels, shocks);

  const parts = { body, chassis, wing, frontWheels, rearWheels, shocks, group };
  function render() { renderer.render(scene, camera); }
  function resize() { camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(container.clientWidth, container.clientHeight); }
  function dispose() { renderer.dispose(); renderer.domElement.remove(); }
  return { group, parts, render, resize, dispose, renderer, camera };
}
```

- [ ] **Step 2: Verify in isolation** with a temporary test page (or via the hero/tune task) — confirm a recognizable buggy renders on a transparent background, lit with an orange rim. Confirm `resize()` keeps aspect on window resize.

- [ ] **Step 3: Commit.** `git add RaceLab/apps/web/src/scene/car.js` then `feat(web): procedural Three.js RC buggy`.

---

## Task 7: `scene/tuneSequence.js` + the TUNE section (★ signature)

**Files:** Create `RaceLab/apps/web/src/scene/tuneSequence.js`; build the `#tune` section markup/CSS.

- [ ] **Step 1: Build the section DOM** in `tuneSequence.js` init: a pinned wrapper holding a left `<div class="tune__stage">` (the WebGL canvas mounts here, shared with the hero — see note) and a right `<div class="tune__rail">` with the eyebrow/heading and one `<div class="tune__step">` per `TUNE.steps` (part · value · note), plus an `explode` caption. Each step has `data-step` index.

- [ ] **Step 2: Fallback first.** If `!wantsHeavyGfx`, render a static treated hero image / CSS-art car in `.tune__stage`, reveal all steps with the `reveal()` helper, and return without WebGL.

- [ ] **Step 3: Wire the scrub timeline.** Create the car via `createCar(stage)`. Pin `#tune` for ~4 viewport-heights and build a single `gsap.timeline` with `scrollTrigger:{ trigger:"#tune", start:"top top", end:"+=400%", scrub:true, pin:true }`. Segments along normalized progress:
  - 0.00–0.18: car rotates in (`group.rotation.y: -0.6 -> 0.3`), step 0 (ride height) chip flies onto the body; `body.position.y` and `chassis.position.y` drop by 0.12 (ride height down).
  - 0.18–0.40: step 1 (camber) — `frontWheels.rotation.z` and `rearWheels.children` tilt to `-0.13`; chip 1 in.
  - 0.40–0.62: step 2 (shock oil) — `shocks` pulse/scale `1 -> 1.15` rear, slight squat; chip 2 in.
  - 0.62–0.82: step 3 (wing) — `wing.rotation.z: 0.18 -> 0.5`; chip 3 in.
  - 0.82–1.00: **explode** — translate `body +y`, `wing +x/+y`, `frontWheels`/`rearWheels` outward on x, `shocks` out, revealing `chassis`; show the explode caption.
  - Each chip enters with `power3.out`; the rail's active step gets `.is-active`.
  - Add a `gsap.ticker` render call (`render()`); throttle to once per rendered frame.
  - Use `ScrollTrigger`'s `onUpdate` to apply scroll-velocity `skewY` to `.tune__rail` (clamp ±6deg) for the velocity-skew requirement.

```js
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TUNE } from "../config.js";
import { wantsHeavyGfx, env } from "../env.js";
import { reveal } from "../reveal.js";

export function init(ctx) {
  const root = document.getElementById("tune");
  root.innerHTML = `
    <div class="tune__pin">
      <div class="tune__stage" aria-hidden="true"></div>
      <div class="tune__rail">
        <p class="eyebrow">${TUNE.eyebrow}</p>
        <h2>${TUNE.heading}</h2>
        ${TUNE.steps.map((s,i)=>`<div class="tune__step" data-step="${i}">
            <span class="tune__part">${s.part}</span>
            <span class="tune__value">${s.value}</span>
            <span class="tune__note">${s.note}</span></div>`).join("")}
        <p class="tune__caption">${TUNE.caption}</p>
      </div>
    </div>`;
  const stage = root.querySelector(".tune__stage");
  const steps = root.querySelectorAll(".tune__step");

  if (!wantsHeavyGfx) {           // graceful fallback
    stage.classList.add("tune__stage--static");
    reveal(steps, { stagger: 0.12 });
    return;
  }

  import("./car.js").then(({ createCar }) => {
    const car = createCar(stage);
    gsap.ticker.add(car.render);
    addEventListener("resize", car.resize);
    const p = car.parts;
    gsap.set(steps, { autoAlpha: 0.25 });
    const tl = gsap.timeline({ scrollTrigger: {
      trigger: root, start: "top top", end: "+=400%", scrub: true, pin: ".tune__pin",
      onUpdate: (self) => gsap.to(".tune__rail", { skewY: gsap.utils.clamp(-6,6, self.getVelocity()/-300), duration: 0.3, overwrite: true }),
    }});
    const activate = (i) => steps.forEach((s,j)=>s.classList.toggle("is-active", j===i));
    tl.to(p.group.rotation, { y: 0.3, duration: 0.18 }, 0)
      .to([p.body.position, p.chassis.position], { y: "-=0.12", duration: 0.18 }, 0)
      .to(steps[0], { autoAlpha: 1, duration: 0.05, onStart:()=>activate(0) }, 0.02)
      .to([p.frontWheels.rotation], { z: -0.13, duration: 0.22 }, 0.18)
      .to(steps[1], { autoAlpha: 1, onStart:()=>activate(1) }, 0.18)
      .to(p.shocks.scale, { y: 1.15, duration: 0.22 }, 0.40)
      .to(steps[2], { autoAlpha: 1, onStart:()=>activate(2) }, 0.40)
      .to(p.wing.rotation, { z: 0.5, duration: 0.2 }, 0.62)
      .to(steps[3], { autoAlpha: 1, onStart:()=>activate(3) }, 0.62)
      // explode
      .to(p.body.position, { y: "+=0.8", duration: 0.18 }, 0.82)
      .to(p.wing.position, { x: "-=0.6", y: "+=0.5", duration: 0.18 }, 0.82)
      .to(p.frontWheels.position, { x: "+=0.5", duration: 0.18 }, 0.82)
      .to(p.rearWheels.position, { x: "-=0.5", duration: 0.18 }, 0.82)
      .to(p.shocks.position, { y: "+=0.4", duration: 0.18 }, 0.82);
  }).catch(() => { stage.classList.add("tune__stage--static"); reveal(steps); });
}
```

- [ ] **Step 4: Style** `.tune__pin` (100vh flex two-column; stack on mobile), `.tune__stage` (canvas fills, `--static` shows a CSS gradient + chassis SVG), `.tune__step` (mono value in `--accent`, `.is-active` brightens + left accent border), `.tune__caption`.

- [ ] **Step 5: Verify** the signature: scroll slowly through `#tune`; the car drops ride height, tilts camber, pumps shocks, sets wing, then explodes; steps light up in sync; rail skews with fast scroll. Then test reduced-motion + a forced no-WebGL (DevTools disable WebGL) → static stage, all steps visible.

- [ ] **Step 6: Commit.** `git add RaceLab/apps/web/src/scene/tuneSequence.js RaceLab/apps/web/styles/sections.css` then `feat(web): TUNE signature — scroll-scrubbed car tune + explode`.

---

## Task 8: `sections/hero.js`

**Files:** Create `RaceLab/apps/web/src/sections/hero.js`

- [ ] **Step 1: Build DOM** into `#hero`: eyebrow, `<h1>` with `HERO.headline` lines wrapped per-word in `<span class="word"><span class="inner">…</span></span>` for split-text; subhead; `.hero__cta` with primary (`data-magnetic`) + ghost secondary; a `.hero__scrollcue`; and a `.hero__stage` placeholder (a calm idle 3D car may be added later — for v1 the hero stage shows a large knockout word `TUNE` with `mix-blend-mode:difference` over a CSS-art car/gradient to keep LCP text-first and Three.js reserved for the signature).
- [ ] **Step 2: Animate** on init (after preloader): split-words rise (`yPercent:110 -> 0`, stagger 0.08, `power3.out`), subhead + CTAs fade-up, scroll cue loops. Under `env.reduced`, set final states.
- [ ] **Step 3: Knockout word** — absolutely-positioned huge `TUNE` with `mix-blend-mode:difference`, parallaxed on scroll via ScrollTrigger `scrub`.
- [ ] **Step 4: Verify** headline fills viewport width (`clamp(40px,9vw,130px)`), words animate in once, CTAs magnetic, scroll cue visible.
- [ ] **Step 5: Commit.** `git add RaceLab/apps/web/src/sections/hero.js RaceLab/apps/web/styles/sections.css` then `feat(web): hero — split-text headline + magnetic CTAs`.

---

## Task 9: `sections/problem.js`

**Files:** Create `RaceLab/apps/web/src/sections/problem.js`

- [ ] **Step 1: Build DOM** into `#problem`: eyebrow `PROBLEM.eyebrow`, `<h2>` `PROBLEM.heading`, a giant `.problem__big` (`PROBLEM.big`, mono, `--accent`), body `PROBLEM.body`. Asymmetric layout (heading left, big question offset right, breaking the grid per spec §6).
- [ ] **Step 2: Animate** with `reveal()`; add a scroll-driven background shift on this section (`ScrollTrigger` toggling `--bg` to `#0B0C0E`). The big question scrubs in scale `0.9 -> 1`.
- [ ] **Step 3: Verify** entrance + bg transition; reduced-motion shows everything.
- [ ] **Step 4: Commit.** `git add RaceLab/apps/web/src/sections/problem.js RaceLab/apps/web/styles/sections.css` then `feat(web): problem section`.

---

## Task 10: `sections/engineer.js` — the report card + principles + duel

**Files:** Create `RaceLab/apps/web/src/sections/engineer.js`

- [ ] **Step 1: Build DOM** into `#engineer`: eyebrow, `<h2>` `ENGINEER.heading`, a `.report` card listing all 8 `ENGINEER.report` rows as labelled tiles (label in mono `--sub`, value in `--text`; "Primary change" tile emphasized with `--accent` left border; "Confidence" shows a `--good` pill), three `.principle` tiles from `ENGINEER.principles`, and a `.duel` mini-viz showing before/after avg lap with the `delta` animating via a counter.
- [ ] **Step 2: Animate** — report rows stagger-reveal; the duel `delta` counts from `before` to `after` (number tween) when scrolled in; principle tiles rise with stagger. Use `reveal()` + a counter tween.

```js
import { ENGINEER } from "../config.js";
export function init(ctx) {
  const { gsap, ScrollTrigger, env, reveal } = ctx;
  const root = document.getElementById("engineer");
  root.innerHTML = `
    <p class="eyebrow">${ENGINEER.eyebrow}</p>
    <h2 class="engineer__h">${ENGINEER.heading}</h2>
    <div class="engineer__grid">
      <article class="report">
        ${ENGINEER.report.map(r=>`<div class="report__row" data-k="${r.k}">
          <span class="report__k">${r.k}</span><span class="report__v">${r.v}</span></div>`).join("")}
      </article>
      <aside class="engineer__side">
        ${ENGINEER.principles.map(p=>`<div class="principle"><h3>${p.t}</h3><p>${p.d}</p></div>`).join("")}
        <div class="duel">
          <span class="duel__before">${ENGINEER.duel.before}</span>
          <span class="duel__arrow">→</span>
          <span class="duel__after" data-after="${ENGINEER.duel.after}">${ENGINEER.duel.before}</span>
          <span class="duel__delta">${ENGINEER.duel.delta}</span>
          <span class="duel__label">${ENGINEER.duel.label}</span>
        </div>
      </aside>
    </div>`;
  reveal(root.querySelectorAll(".report__row"), { stagger: 0.07 });
  reveal(root.querySelectorAll(".principle"), { stagger: 0.12 });
  const after = root.querySelector(".duel__after");
  const a = parseFloat(ENGINEER.duel.before), b = parseFloat(ENGINEER.duel.after);
  if (env.reduced) { after.textContent = ENGINEER.duel.after; return; }
  ScrollTrigger.create({ trigger: ".duel", start: "top 80%", once: true, onEnter: () =>
    gsap.to({ v: a }, { v: b, duration: 1.2, ease: "power2.out", onUpdate() { after.textContent = this.targets()[0].v.toFixed(2); } }) });
}
```

- [ ] **Step 3: Style** the report card (surface bg, rounded, multi-layer shadow), the primary/confidence emphasis, principle tiles, and the duel.
- [ ] **Step 4: Verify** the 8 rows render, delta counts down, principles reveal.
- [ ] **Step 5: Commit.** `git add RaceLab/apps/web/src/sections/engineer.js RaceLab/apps/web/styles/sections.css` then `feat(web): AI engineer section — 8-part report + duel`.

---

## Task 11: `sections/loop.js`

**Files:** Create `RaceLab/apps/web/src/sections/loop.js`

- [ ] **Step 1: Build DOM** into `#loop`: eyebrow, `<h2>` `LOOP.heading`, a horizontal/stepped row of 5 `.station` nodes (`LOOP.stations` n + d) connected by an animated `--accent` connector line, and a `.loop__punchline`. The connector is an SVG path whose `stroke-dashoffset` draws across as the section scrolls; on the last station the line curves back (a small return arc) to signal "loop".
- [ ] **Step 2: Animate** — stations stagger-reveal; connector draws on a scrub trigger; reduced-motion shows full line + nodes.
- [ ] **Step 3: Verify** the 5 ordered stations + drawing connector.
- [ ] **Step 4: Commit.** `git add RaceLab/apps/web/src/sections/loop.js RaceLab/apps/web/styles/sections.css` then `feat(web): the loop section`.

---

## Task 12: `sections/features.js` — horizontal-scroll gallery

**Files:** Create `RaceLab/apps/web/src/sections/features.js`

- [ ] **Step 1: Build DOM** into `#features`: eyebrow + `<h2>` `FEATURES.heading`, then a `.features__track` flex row of 8 `.fcard` "phone frames" (one per `FEATURES.cards`), each a CSS device frame containing a tiny stylized app-screen mock (header bar in `--surface`, an accent element, 2–3 skeleton rows) plus the card title + line beneath.
- [ ] **Step 2: Wire horizontal scroll** — pin `#features` and translate `.features__track` on x by its overflow width across the pinned scroll distance (the required horizontal-scroll-within-vertical-flow). On mobile, fall back to native horizontal overflow-scroll (no pin).

```js
import { FEATURES } from "../config.js";
export function init(ctx) {
  const { gsap, ScrollTrigger, env, reveal } = ctx;
  const root = document.getElementById("features");
  root.innerHTML = `
    <div class="features__head"><p class="eyebrow">${FEATURES.eyebrow}</p><h2>${FEATURES.heading}</h2></div>
    <div class="features__viewport"><div class="features__track">
      ${FEATURES.cards.map(c=>`<div class="fcard">
        <div class="fcard__phone"><div class="fcard__bar"></div><div class="fcard__accent"></div>
          <div class="fcard__row"></div><div class="fcard__row"></div><div class="fcard__row short"></div></div>
        <h3>${c.t}</h3><p>${c.d}</p></div>`).join("")}
    </div></div>`;
  const track = root.querySelector(".features__track");
  if (env.isMobile) { root.querySelector(".features__viewport").classList.add("is-native"); reveal(root.querySelectorAll(".fcard")); return; }
  const distance = () => track.scrollWidth - innerWidth + 80;
  gsap.to(track, { x: () => -distance(), ease: "none",
    scrollTrigger: { trigger: root, start: "top top", end: () => "+=" + distance(), scrub: true, pin: true, invalidateOnRefresh: true } });
}
```

- [ ] **Step 2b:** Add scroll-reveal scale (`0.85 -> 1`) + parallax on each `.fcard` as it crosses center (desktop) via a per-card ScrollTrigger using `containerAnimation`.
- [ ] **Step 3: Style** `.features__viewport` (overflow hidden; `.is-native` → `overflow-x:auto`), `.features__track` (flex, gap), `.fcard` + the phone frame (rounded 20px, multi-shadow, `--surface` screen), responsive.
- [ ] **Step 4: Verify** desktop: vertical scroll drives cards left through a pinned viewport; mobile: native swipe.
- [ ] **Step 5: Commit.** `git add RaceLab/apps/web/src/sections/features.js RaceLab/apps/web/styles/sections.css` then `feat(web): features — horizontal-scroll app gallery`.

---

## Task 13: `sections/proof.js`

**Files:** Create `RaceLab/apps/web/src/sections/proof.js`

- [ ] **Step 1: Build DOM** into `#proof`: eyebrow, `<h2>` `PROOF.heading`, a two-column compare table (`Strava` | `RaceLab`) from `PROOF.rows` (last row's RaceLab cell emphasized in `--accent` since it has "no equivalent"), the `.proof__punchline`, and a row of `.fact` chips from `PROOF.facts`.
- [ ] **Step 2: Animate** rows reveal top-to-bottom (stagger); punchline scrubs in; fact chips pop with stagger. Reduced-motion safe.
- [ ] **Step 3: Verify** table renders, punchline lands, chips are factual (no fake numbers).
- [ ] **Step 4: Commit.** `git add RaceLab/apps/web/src/sections/proof.js RaceLab/apps/web/styles/sections.css` then `feat(web): proof — Strava vs RaceLab table`.

---

## Task 14: `sections/pricing.js`

**Files:** Create `RaceLab/apps/web/src/sections/pricing.js`

- [ ] **Step 1: Build DOM** into `#pricing`: eyebrow, `<h2>` `PRICING.heading`, two `.plan` cards from `PRICING.plans` (annual `highlight` gets an accent border + `badge`), the web-first `PRICING.note`, and a magnetic primary CTA `PRICING.cta`.
- [ ] **Step 2: Animate** — plan cards rise + hover elevation (transform + multi-shadow); CTA magnetic.
- [ ] **Step 3: Verify** both plans, badge on annual, note present, CTA → griplab.app.
- [ ] **Step 4: Commit.** `git add RaceLab/apps/web/src/sections/pricing.js RaceLab/apps/web/styles/sections.css` then `feat(web): pricing — trial + web-first plans`.

---

## Task 15: `sections/finalCta.js` + footer

**Files:** Create `RaceLab/apps/web/src/sections/finalCta.js`

- [ ] **Step 1: Build DOM** into `#final`: huge `<h2>` `FINAL.heading`, sub `FINAL.sub`, a large magnetic CTA `FINAL.cta`; full-viewport, deepest bg (`#0B0C0E`). Build the `<footer>`: brand wordmark (`BRAND`), `FOOTER.tagline`, `FOOTER.links`, and `© 2026 ${BRAND}. ${FOOTER.legal}`.
- [ ] **Step 2: Animate** — heading split-words rise; CTA magnetic; optional faint return of the knockout word to echo the hero (loop closure).
- [ ] **Step 3: Verify** final CTA + footer render; links correct.
- [ ] **Step 4: Commit.** `git add RaceLab/apps/web/src/sections/finalCta.js RaceLab/apps/web/styles/sections.css` then `feat(web): final CTA + footer`.

---

## Task 16: Resilience & responsive hardening pass

**Files:** Touch `styles/base.css`, `styles/sections.css`, and any section needing mobile rules.

- [ ] **Step 1: Reduced-motion audit.** With `prefers-reduced-motion: reduce` emulated, scroll the whole page: confirm no pinning jumps, no hidden content, no WebGL motion, all text visible. Fix any section that left elements at `autoAlpha:0`.
- [ ] **Step 2: No-WebGL audit.** Disable WebGL (DevTools > Rendering / or block the context): confirm `#tune` shows the static stage and the hero CSS-art renders; no console errors.
- [ ] **Step 3: Mobile audit** at 390px: nav overlay works; sections stack; features uses native swipe; tap targets ≥44px; no horizontal overflow; type scales. Add `@media (max-width:768px)` rules as needed.
- [ ] **Step 4: Commit.** `git add RaceLab/apps/web/styles RaceLab/apps/web/src` then `fix(web): resilience + responsive hardening`.

---

## Task 17: Verification — Lighthouse, Playwright, a11y, assets

**Files:** Create `RaceLab/apps/web/assets/favicon.svg`, `RaceLab/apps/web/assets/og.png`; add meta tags to `index.html`.

- [ ] **Step 1: Add favicon + OG/meta** (title, description from HERO.subhead, `og:image`, theme-color `#0E0F12`) to `index.html`.
- [ ] **Step 2: Playwright pass.** Serve, then with the Playwright MCP: navigate to `http://localhost:5173`, wait for load, screenshot full page; screenshot mid-`#tune` (scroll to ~40% of its scroll range) to capture the car mid-explode; screenshot `#features`, `#pricing`, `#final`. Re-run with `prefers-reduced-motion` emulated and confirm content visibility. Save shots under a scratch dir (not committed).
- [ ] **Step 3: Lighthouse.** Run Lighthouse (desktop + mobile). Confirm LCP < 2.5s, CLS < 0.1, a11y ≥ 95. Record numbers. Fix regressions (e.g., preload the LCP font, set explicit sizes on app-frame assets).
- [ ] **Step 4: Keyboard + contrast pass.** Tab through: skip link works, focus rings visible on every link/button, nav reachable, CTAs reachable. Verify AA contrast for body text and any accent-on-dark text.
- [ ] **Step 5: Re-run config test.** `node --test RaceLab/apps/web/test/config.test.mjs` → all pass.
- [ ] **Step 6: Commit.** `git add RaceLab/apps/web/assets RaceLab/apps/web/index.html` then `feat(web): meta, favicon, OG image + verification pass`.

---

## Task 18: Final push + optional deploy

- [ ] **Step 1: Push** `git push origin theo/racelab`.
- [ ] **Step 2 (optional, on request):** Deploy to Vercel as a static project rooted at `RaceLab/apps/web/` and wire `griplab.app`. Do NOT deploy without explicit user go-ahead (outward-facing).
- [ ] **Step 3:** Update `PIT_BOARD.md` and auto-memory with the new `apps/web` marketing surface.

---

## Self-review — spec coverage

- Big Idea "tune it live" → Tasks 6–7 (car + scrubbed tune/explode). ✓
- 11-section map → preloader T3, hero T8, problem T9, tune T7, engineer T10, loop T11, features T12, proof T13, pricing T14, final+footer T15. ✓
- Visual system / tokens / fonts / grain / cursor → T0 base.css + T4. ✓
- Lenis + ScrollTrigger sync, transform/opacity only, easing → T2. ✓
- Pinned scrub (T7), viewport headline (T8), horizontal gallery (T12), magnetic CTA (T4/T8/T14/T15). ✓ (all required awwwards landing beats)
- Resilience (WebGL fallback, reduced-motion, mobile) → built into T7/T8 + audited T16. ✓
- Honesty (no fake proof) → config PROOF.facts are product facts; T13. ✓
- A11y + performance targets → T16 + T17. ✓
- BRAND swappable token, config single-source → T0 config.js, asserted by test. ✓
- Location `RaceLab/apps/web/`, theo/racelab, no add -A, no double quotes, co-author trailer → Conventions + every commit step. ✓

No unresolved placeholders; module/method names (`init(ctx)`, `createCar`, `parts.{body,chassis,wing,frontWheels,rearWheels,shocks}`, `reveal`, `env`, `wantsHeavyGfx`) are consistent across tasks.
