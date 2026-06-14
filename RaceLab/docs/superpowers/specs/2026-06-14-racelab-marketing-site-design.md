# RaceLab Marketing Site — Design Spec

_Design approved 2026-06-14. Brainstormed from `mockup/awwwards-upgrade-prompt.md` (the "how") + `mockup/prompt-2-discovery.md` (the "what"), grounded in `docs/01_CONCEPT.md` and `docs/FEATURES.md`._

## 1. Goal & scope

A single-page, scroll-driven **marketing site** for the RC-racing app (codename RaceLab,
public-name candidate GripLab — shown as a swappable `BRAND` token). Award-level
production quality (motion, depth, typography, performance). The scroll **is** the story.

- **Primary conversion goal / CTA:** "Start your 15-day free trial" → `griplab.app`.
- **Secondary CTA:** "See how it works" → scrolls to the signature section.
- **Out of scope:** no backend, no waitlist form, no CMS, no auth, no in-page payment.
  Every CTA links out to `griplab.app`. Multi-page expansion is a later, separate spec.

### Decisions locked at brainstorm

| Decision | Choice |
|---|---|
| Name | **Placeholder**, wired as a single `BRAND` token in `config.js` (default visible: "RaceLab"); swap to GripLab is one edit. Public branding remains William's sign-off. |
| Shape | Single-page scroll narrative |
| Stack | **GSAP + ScrollTrigger + Three.js + Lenis**, hosted as **vanilla HTML/CSS/JS** (static, Vercel-deployable). No React, no Tailwind, no jQuery, no Bootstrap. |
| Big Idea | **"The Machine — tune it live"** |
| 3D assets | **Procedural** Three.js geometry (no licensed model dependency) |
| App screens | Faithful **CSS/SVG "phone-frame" recreations** using the real palette + real copy (no emulator dependency) |
| Location | `RaceLab/apps/web/`, committed on `theo/racelab` via the worktree (never r3) |
| Hero headline | "TUNE LESS. WIN MORE." (alternates kept in config) |

## 2. The Big Idea — "Tune it live"

The hero is a procedural 3D RC car. Scrolling **is** the act of tuning: in the pinned
signature section the car visibly transforms through real setup changes, then explodes to
reveal its chassis — while setup-sheet values fly onto the parts. Form mirrors function:
the site demonstrates the product's core promise ("one grounded change at a time") by
changing one parameter at a time as you scroll.

Narrative arc: _this gorgeous machine → tuning it is the hard part → an AI race engineer
makes it one change at a time → the whole improvement loop → the app → proof → trial._

## 3. Section map (top → bottom)

| # | Section | Job | Signature motion |
|---|---|---|---|
| 0 | **Preloader** | Ceremony (1.5–3s) | Chassis wireframe assembles from scattered lines; mono 0→100 counter; staggers into hero on exit |
| 1 | **Hero** (100vh) | Wow + primary CTA | Three.js RC car (auto-rotate + mouse parallax); split-text headline `clamp(40px,9vw,130px)`; **magnetic** "Start free trial" + ghost "See how it works"; custom cursor; grain overlay; scroll cue |
| 2 | **The problem** | Tension | "40 tunable parameters. One question: _what do I change?_" — bg color shift, text stagger |
| 3 | **★ TUNE IT** (pinned, scrubbed) | **Signature moment** | Car transforms with scroll progress — ride height ↓, camber tilt, shock/spring, wing angle — each with a setup-sheet chip flying onto the relevant part, then an **exploded view** of the chassis. Scroll-velocity skew on side elements. Lives within the first 2 scroll-lengths. |
| 4 | **AI Race Engineer** | #1 differentiator | "Strava tells you what you _did_. RaceLab tells you what to _change_." 8-part report card reveals (CSS recreation of the Pit Board report); 3 principle tiles: _one change at a time · grounded or silent · on-device, no signal needed_; ghost-duel lap-delta counters |
| 5 | **The Loop** | The moat | Race → Log → Engineer → Result → Share stepped reveal; "every logged run teaches the AI — a flywheel So Dialed can't copy" |
| 6 | **Features** (horizontal scroll) | Product depth | Phone-frame cards: Garage · Versioned sheets (diff) · Tracks (corner-by-corner) · Run log · Compare · Engineer report · Race planner + time-first pit strategy · Speedhive auto-import. Pinned section, x-translate on scroll. |
| 7 | **Proof** | Credibility | Strava ↔ RaceLab comparison table, animated row reveal; punchline "descriptive vs **prescriptive**" |
| 8 | **Pricing** | Convert | 15-day free trial → €9.99/mo · €99.99/yr; "cheaper on the web" web-first note; annual highlighted; hover elevation + accent |
| 9 | **Final CTA** (100vh) | Close | Magnetic "Start your 15-day free trial"; car returns; "Get dialed." |
| 10 | **Footer** | Wrap | Brand wordmark, "on-device · grounded or silent", links |

The required awwwards "landing page" beats are all present: scroll narrative, **one pinned
scrub section** (#3), viewport-filling animated headline (#1), **horizontal-scroll gallery**
(#6), **magnetic CTA** (#1, #9).

## 4. Visual system (extends the app's pit-lane DA — not invented)

CSS custom properties on `:root`:

```
--bg: #0E0F12;        /* + section variants #0B0C0E, #111114 */
--surface: #1A1C21;   --surface-alt: #22252C;   --border: #2E323B;
--text: #ECEDEE;      --sub: #9BA1A6;
--accent: #FF5A26;    --accent-soft: #3A2218;
--good: #3DDC84;      --warn: #FFB02E;
```

- **Never** pure `#000`/`#fff` (already satisfied: off-black bg, off-white text).
- SVG **grain/noise** overlay on the background.
- **Scroll-driven background color transitions** between sections.
- **Type:** `Space Grotesk` (display + UI) + `Space Mono` (eyebrows, labels, telemetry-style
  data) — instrument-panel pairing; Google Fonts; primary preloaded, `font-display: swap`.
- Hero headline: split-text per-word/char animation.
- One `mix-blend-mode: difference` knockout word over the car.
- Multi-layer box-shadows on cards (depth, not single shadow).
- Eyebrows: 11px, uppercase, letter-spacing 3px, mono.
- Line-height: 1.1 headlines, 1.6–1.7 body.

## 5. Architecture (vanilla, modular)

```
RaceLab/apps/web/
  index.html
  styles/
    base.css        # reset, tokens, typography, grain, custom cursor
    sections.css    # per-section layout
  src/
    main.js         # entry: Lenis init + GSAP/ScrollTrigger register + module init(lenis)
    config.js       # SINGLE source: BRAND token, all copy, pricing, links, headline variants
    preloader.js
    cursor.js       # lerp-follow custom cursor + magnetic buttons
    nav.js          # hide-on-scroll-down / reveal-on-up; mobile menu
    a11y.js         # prefers-reduced-motion gate (exports a `reduced` flag)
    perf.js         # mobile detection, DPR cap, WebGL visibility pause
    scene/
      car.js        # Three.js procedural RC buggy: scene, camera, lights, materials
      tuneSequence.js # ScrollTrigger scrub → car-transform GSAP timeline
    sections/
      hero.js  problem.js  engineer.js  loop.js
      features.js  proof.js  pricing.js  finalCta.js
  assets/           # favicon, og-image, any SVG app frames
  vercel.json       # static config (clean URLs, cache headers)
```

- Each module exposes `init(lenis)` and owns exactly one concern (one purpose, testable in
  isolation, understandable without reading siblings).
- **`config.js` is the single source of truth** for copy/pricing/links and the `BRAND`
  token. No content string is hardcoded in markup or section modules.
- No backend; no data fetching. The site is fully static.

### Data flow
`config.js` → `main.js` builds/hydrates the DOM and calls each `init(lenis)` → sections read
copy from config and register GSAP/ScrollTrigger animations bound to the shared Lenis
instance (`lenis.on('scroll', ScrollTrigger.update)`).

## 6. Motion & smooth scroll

- **Lenis** smooth scroll: easing `(t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))`,
  duration ~1.2s; CSS `scroll-behavior: auto`; synced to ScrollTrigger.
- Entrances `power3.out`; scrubbed `power2.inOut`; default trigger `start: "top 80%"`;
  staggers 80–120ms.
- **Only `transform` and `opacity` are animated** — never width/height/top/left/margin.
- GSAP, Three.js loaded via dynamic import / lazy; heavy libs code-split.

## 7. Resilience & honesty

- **WebGL unsupported / fails to load** → static CSS-art hero (gradient + chassis SVG); site
  stays fully functional and on-brand without Three.js.
- **JS disabled** → semantic HTML still reads (progressive enhancement; animation is the
  enhancement layer, content lives in markup).
- **`prefers-reduced-motion`** → disable Lenis smoothing, all scroll/scrub/parallax, WebGL
  auto-rotate; show final states immediately.
- **Mobile** → simplified geometry, capped DPR, fewer/zero particles, WebGL paused when the
  hero is offscreen; target 45+ FPS mid-range.
- **Honesty constraint (hard):** product is pre-launch, so **no invented testimonials or
  traction numbers.** Proof uses only real product facts (deterministic on-device engineer,
  8-part report, grounded-or-silent, transponder-verified results, web-first pricing). Real
  social proof is added before launch, not fabricated now.

## 8. Accessibility (non-negotiable)

- `prefers-reduced-motion` honored everywhere.
- Keyboard-navigable; visible focus states; skip-to-content link.
- Semantic landmarks, correct heading hierarchy, alt text.
- Custom cursor `aria-hidden`; ARIA labels on custom interactive elements.
- WCAG AA contrast: body text uses `--text` on `--bg` (passes); `--accent` reserved for
  large/graphic elements and verified for any text use.

## 9. Performance hard targets

- LCP < 2.5s · CLS < 0.1 · 60fps desktop during animation.
- Fonts preloaded + `font-display: swap`; images (app-frame assets) WebP/AVIF with explicit
  width/height; lazy-load below the fold.
- Three.js dynamic-imported; renderer paused offscreen; DPR capped (≤2).

## 10. Verification plan

- **Lighthouse**: confirm LCP/CLS/perf/a11y targets.
- **Playwright** (MCP): screenshot desktop (1440) + mobile (390) widths; capture the
  preloader, hero, the pinned TUNE-IT signature mid-scrub, features, pricing, final CTA.
- **Reduced-motion pass**: emulate `prefers-reduced-motion: reduce`, confirm motion is off
  and content is fully visible.
- **No-WebGL pass**: confirm static hero fallback renders.
- **Keyboard pass**: tab order, focus visibility, skip link.
- Acceptance = every applicable awwwards-checklist item satisfied (mapped in the plan).

## 11. Build orchestration (ultracode)

Implementation will be driven from `writing-plans` → a Workflow that fans out section
builders in parallel against the shared `config.js` + token contract, then runs an
adversarial design/performance review (Immersive-Garden-rigor lens + Lighthouse/perf lens)
before integration. Agents return findings; decisions stay with the orchestrator.

## 12. Open follow-ups (post-approval, non-blocking)

- Final public name (William's sign-off) — swap the `BRAND` token.
- Real app screenshots could later replace the CSS/SVG frames if desired.
- OG/social meta image + favicon set.
- Vercel project + domain wiring (`griplab.app`) when ready to deploy.
