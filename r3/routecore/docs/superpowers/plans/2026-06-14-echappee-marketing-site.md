# L'Échappée Marketing Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an awwwards-grade, single-page, French marketing site for the L'Échappée mobile app (live in stores) that drives App Store / Google Play downloads.

**Architecture:** Next.js App Router app in `r3/routecore/web/`, fully isolated from the Flutter project. One Lenis smooth-scroll instance bridges to GSAP ScrollTrigger; each section is a self-contained client component that registers and cleans up its own ScrollTriggers. Reusable motion primitives (`Magnetic`, `SplitText`, `Reveal`) and a `useReducedMotion` guard keep maximalist motion consistent and accessible. Brand colors/typography come verbatim from `DESIGN_SYSTEM_ECHAPPEE.md`.

**Tech Stack:** Next.js 15 (App Router, TypeScript), GSAP 3 + ScrollTrigger, Lenis, `next/font` (Fraunces + Inter), Vitest + Testing Library (logic primitives only), deployed on Vercel.

**Spec:** `r3/routecore/docs/superpowers/specs/2026-06-14-echappee-marketing-site-design.md`

---

## File Structure

```
r3/routecore/web/
  package.json, tsconfig.json, next.config.ts, vitest.config.ts, .gitignore
  app/
    layout.tsx          # fonts, metadata/OG, grain, <SmoothScroll>, <Cursor>
    page.tsx            # composes sections in order
    globals.css         # :root tokens, grain, reduced-motion resets
  lib/
    tokens.ts           # brand colors mirrored from design system
    motion.ts           # lerp(), shared GSAP eases, registerPlugin
    useReducedMotion.ts # SSR-safe hook
  components/
    SmoothScroll.tsx    # Lenis + ScrollTrigger bridge (client)
    Cursor.tsx          # custom lerp cursor
    Grain.tsx           # SVG grain overlay
    ui/
      Magnetic.tsx      # magnetic wrapper (uses magneticOffset)
      magnetic.ts       # pure magneticOffset(x,y,rect,strength) math
      SplitText.tsx     # splits text into word/char spans (uses splitToWords)
      split.ts          # pure splitToWords(text) helper
      Reveal.tsx        # scroll-reveal wrapper
      StoreBadge.tsx    # App Store / Play badge link
    sections/
      Preloader.tsx, Hero.tsx, Manifeste.tsx, SignatureMap.tsx,
      HowItWorks.tsx, Haltes.tsx, Stats.tsx, DownloadCTA.tsx, Footer.tsx
  public/
    screens/.gitkeep    # app screenshot mockups
    map/france.svg      # stylized France + route path
    badges/             # store badge SVGs
```

---

## Task 1: Scaffold the Next.js app

**Files:**
- Create: `r3/routecore/web/package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Create the project with pnpm**

Run from `r3/routecore/web` parent:
```bash
cd r3/routecore && pnpm create next-app@latest web --ts --app --no-tailwind --no-src-dir --no-eslint --import-alias "@/*" --use-pnpm
```
If the interactive prompt blocks, instead create `web/` manually with the files below.

- [ ] **Step 2: Add motion deps**

```bash
cd r3/routecore/web && pnpm add gsap lenis && pnpm add -D vitest @testing-library/react @testing-library/dom jsdom @vitejs/plugin-react
```

- [ ] **Step 3: Replace `app/globals.css` with brand tokens**

```css
:root {
  --clay: #D95F45; --clay-pressed: #BE4F37; --clay-tint: #F9E5DE;
  --cream: #FFF7EA; --cream-deep: #F3E4CE; --surface: #FFFCF5;
  --brown: #2B211C; --taupe: #8A7C70; --olive: #6F7F45;
  --gold: #D9A441; --mist: #7EA8A4; --border: #E7D8C8;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: auto; } /* Lenis handles smoothing */
body { background: var(--cream); color: var(--brown); font-family: var(--font-inter), system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
h1,h2,h3 { font-family: var(--font-fraunces), Georgia, serif; line-height: 1.1; font-weight: 600; }
.eyebrow { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: var(--taupe); }
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; scroll-behavior: auto; }
}
```

- [ ] **Step 4: Set up fonts + metadata in `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], variable: "--font-fraunces" });
const inter = Inter({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "L'Échappée — Le GPS des routes qui respirent",
  description: "Le détour est la destination. Trouve les plus belles haltes sur ta route : producteurs, marchés, villages, points de vue.",
  openGraph: { title: "L'Échappée", description: "Le GPS des routes qui respirent.", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <a href="#contenu" className="skip">Aller au contenu</a>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Minimal `app/page.tsx`**

```tsx
export default function Home() {
  return <main id="contenu"><h1 style={{ padding: 40 }}>L'Échappée</h1></main>;
}
```

- [ ] **Step 6: Verify dev server builds**

Run: `cd r3/routecore/web && pnpm build`
Expected: build succeeds, no type errors.

- [ ] **Step 7: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): scaffold Next.js app with brand tokens and fonts"
```

---

## Task 2: Logic primitive — magnetic math (TDD)

**Files:**
- Create: `web/components/ui/magnetic.ts`, `web/components/ui/magnetic.test.ts`, `web/vitest.config.ts`

- [ ] **Step 1: Configure Vitest**

`web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], test: { environment: "jsdom", globals: true } });
```
Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing test** — `magnetic.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { magneticOffset } from "./magnetic";

const rect = { left: 100, top: 100, width: 100, height: 100 } as DOMRect;

describe("magneticOffset", () => {
  it("returns zero at the element center", () => {
    expect(magneticOffset(150, 150, rect, 0.4)).toEqual({ x: 0, y: 0 });
  });
  it("pulls toward the cursor scaled by strength", () => {
    // cursor 50px right of center, strength 0.4 => 20px
    expect(magneticOffset(200, 150, rect, 0.4)).toEqual({ x: 20, y: 0 });
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `cd r3/routecore/web && pnpm test magnetic`
Expected: FAIL — cannot find module `./magnetic`.

- [ ] **Step 4: Implement `magnetic.ts`**

```ts
export function magneticOffset(
  cx: number, cy: number, rect: { left: number; top: number; width: number; height: number }, strength: number
): { x: number; y: number } {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return { x: (cx - centerX) * strength, y: (cy - centerY) * strength };
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm test magnetic`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): magnetic offset math + tests"
```

---

## Task 3: Logic primitives — lerp, splitToWords, useReducedMotion (TDD)

**Files:**
- Create: `web/lib/motion.ts`, `web/lib/motion.test.ts`, `web/components/ui/split.ts`, `web/components/ui/split.test.ts`, `web/lib/useReducedMotion.ts`

- [ ] **Step 1: Failing tests** — `motion.test.ts` and `split.test.ts`

`web/lib/motion.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { lerp } from "./motion";
describe("lerp", () => {
  it("interpolates", () => expect(lerp(0, 10, 0.5)).toBe(5));
  it("returns start at t=0", () => expect(lerp(2, 8, 0)).toBe(2));
});
```
`web/components/ui/split.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { splitToWords } from "./split";
describe("splitToWords", () => {
  it("splits on spaces, preserving words", () => {
    expect(splitToWords("Le GPS")).toEqual(["Le", "GPS"]);
  });
  it("handles single word", () => expect(splitToWords("Échappée")).toEqual(["Échappée"]));
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd r3/routecore/web && pnpm test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`web/lib/motion.ts`:
```ts
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
let registered = false;
export function registerGsap() {
  if (!registered && typeof window !== "undefined") { gsap.registerPlugin(ScrollTrigger); registered = true; }
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const EASE_OUT = "power3.out";
export const EASE_SCRUB = "power2.inOut";
```
`web/components/ui/split.ts`:
```ts
export const splitToWords = (text: string): string[] => text.split(/\s+/).filter(Boolean);
```
`web/lib/useReducedMotion.ts`:
```ts
"use client";
import { useEffect, useState } from "react";
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm test`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): lerp, splitToWords, useReducedMotion primitives + tests"
```

---

## Task 4: SmoothScroll provider (Lenis ↔ ScrollTrigger)

**Files:**
- Create: `web/components/SmoothScroll.tsx`
- Modify: `web/app/layout.tsx`

- [ ] **Step 1: Implement `SmoothScroll.tsx`**

```tsx
"use client";
import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { registerGsap } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  useEffect(() => {
    registerGsap();
    if (reduced) return;
    const lenis = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
    const { ScrollTrigger } = require("gsap/ScrollTrigger");
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => { lenis.raf(time * 1000); };
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => { gsap.ticker.remove(raf); lenis.destroy(); };
  }, [reduced]);
  return <>{children}</>;
}
```

- [ ] **Step 2: Wrap children in layout** — in `app/layout.tsx` import and wrap `{children}` with `<SmoothScroll>...</SmoothScroll>`.

- [ ] **Step 3: Verify build**

Run: `cd r3/routecore/web && pnpm build`
Expected: PASS, no SSR errors (Lenis only runs in effect).

- [ ] **Step 4: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): Lenis smooth-scroll bridged to ScrollTrigger"
```

---

## Task 5: Shared UI primitives — Magnetic, SplitText, Reveal, Grain, Cursor

**Files:**
- Create: `web/components/ui/Magnetic.tsx`, `web/components/ui/SplitText.tsx`, `web/components/ui/Reveal.tsx`, `web/components/Grain.tsx`, `web/components/Cursor.tsx`

- [ ] **Step 1: `Magnetic.tsx`**

```tsx
"use client";
import { useRef } from "react";
import gsap from "gsap";
import { magneticOffset } from "./magnetic";
import { useReducedMotion } from "@/lib/useReducedMotion";

export default function Magnetic({ children, strength = 0.4 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const move = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const { x, y } = magneticOffset(e.clientX, e.clientY, r, strength);
    gsap.to(ref.current, { x, y, duration: 0.4, ease: "power3.out" });
  };
  const reset = () => ref.current && gsap.to(ref.current, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1,0.4)" });
  return <span ref={ref} onMouseMove={move} onMouseLeave={reset} style={{ display: "inline-block" }}>{children}</span>;
}
```

- [ ] **Step 2: `SplitText.tsx`** (word-level split + GSAP stagger entrance)

```tsx
"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { splitToWords } from "./split";
import { useReducedMotion } from "@/lib/useReducedMotion";

export default function SplitText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const words = splitToWords(text);
  useEffect(() => {
    if (reduced || !ref.current) return;
    const spans = ref.current.querySelectorAll("[data-word]");
    gsap.from(spans, { yPercent: 110, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.08 });
  }, [reduced]);
  return (
    <span ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} style={{ display: "inline-block", overflow: "hidden" }} aria-hidden>
          <span data-word style={{ display: "inline-block" }}>{w}&nbsp;</span>
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 3: `Reveal.tsx`** (scroll-triggered entrance, `start: top 80%`)

```tsx
"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { registerGsap } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

export default function Reveal({ children, y = 50, className }: { children: React.ReactNode; y?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    registerGsap();
    if (reduced || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(ref.current, { y, opacity: 0, duration: 1, ease: "power3.out",
        scrollTrigger: { trigger: ref.current, start: "top 80%" } });
    });
    return () => ctx.revert();
  }, [reduced, y]);
  return <div ref={ref} className={className}>{children}</div>;
}
```

- [ ] **Step 4: `Grain.tsx`** — fixed full-screen SVG-noise overlay at low opacity, `pointer-events:none`, `aria-hidden`.

```tsx
export default function Grain() {
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0.04,
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
  );
}
```

- [ ] **Step 5: `Cursor.tsx`** — lerp-following dot, hidden on touch / reduced-motion, scales on `[data-cursor-hover]`. Uses `lerp` from `@/lib/motion` in a rAF loop; `pointer-events:none`, `aria-hidden`.

- [ ] **Step 6: Wire Grain + Cursor into layout** (inside `<SmoothScroll>`).

- [ ] **Step 7: Verify build + tests**

Run: `cd r3/routecore/web && pnpm build && pnpm test`
Expected: build PASS, tests PASS.

- [ ] **Step 8: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): Magnetic, SplitText, Reveal, Grain, Cursor primitives"
```

---

## Task 6: StoreBadge + DownloadCTA section

**Files:**
- Create: `web/components/ui/StoreBadge.tsx`, `web/components/sections/DownloadCTA.tsx`, `web/public/badges/.gitkeep`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: `StoreBadge.tsx`** — accessible link wrapping an official store badge SVG, `href` prop, `aria-label`. Placeholder hrefs: `APP_STORE_URL` / `PLAY_STORE_URL` constants at top with `// TODO: real URLs` (tracked in spec §8). Wrapped in `<Magnetic>`.

```tsx
"use client";
import Magnetic from "./Magnetic";
export const APP_STORE_URL = "https://apps.apple.com/app/idTODO";   // TODO real
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=TODO"; // TODO real
export default function StoreBadge({ store, href }: { store: "ios" | "android"; href: string }) {
  const label = store === "ios" ? "Télécharger sur l'App Store" : "Disponible sur Google Play";
  return (
    <Magnetic><a href={href} aria-label={label} data-cursor-hover
      style={{ display: "inline-block", padding: "14px 24px", borderRadius: 14, background: "var(--brown)", color: "var(--surface)", fontWeight: 600, textDecoration: "none" }}>
      {label}
    </a></Magnetic>
  );
}
```
(Swap the styled link for the official SVG badge once assets are dropped in `public/badges/`.)

- [ ] **Step 2: `DownloadCTA.tsx`** — full-viewport Clay Red field, Fraunces headline "Ta prochaine échappée commence ici.", both badges, `id="telecharger"`.

- [ ] **Step 3: Render `<DownloadCTA />` in `page.tsx`.**

- [ ] **Step 4: Verify build**

Run: `cd r3/routecore/web && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): store badges + download CTA section"
```

---

## Task 7: Hero section

**Files:**
- Create: `web/components/sections/Hero.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Implement `Hero.tsx`**

- Full `min-height: 100vh`, Warm Cream bg.
- Eyebrow (`.eyebrow`): "GPS DE DÉTOUR · FRANCE".
- `<SplitText text="Le GPS des routes qui respirent." />` as the `<h1>` at `clamp(40px,9vw,130px)`.
- One accent word ("respirent") wrapped in a span with `mixBlendMode: "difference"` color Clay Red.
- Subhead (Inter `bodyLarge`): "Le plus court t'emmène vite. Le détour te ramène quelque chose."
- Primary CTA `<Magnetic>` button → `#telecharger`, label "Télécharger l'app".
- Floating app mockup `next/image` from `public/screens/hero.png` (placeholder) with a slow `scrub` tilt via ScrollTrigger (guarded by reduced-motion).

- [ ] **Step 2: Add hero scrub** — in a `gsap.context` effect: scrub the mockup `y`/`rotate` slightly as the hero scrolls out. `scrollTrigger: { trigger, start: "top top", end: "bottom top", scrub: true }`. Revert in cleanup.

- [ ] **Step 3: Render `<Hero />` first in `page.tsx`.**

- [ ] **Step 4: Verify build + visual**

Run: `cd r3/routecore/web && pnpm build && pnpm dev`
Visual check: headline fills width, words stagger in, CTA is magnetic, no layout shift.

- [ ] **Step 5: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): hero with split-text headline and scrub mockup"
```

---

## Task 8: Manifeste section (bg color transition)

**Files:**
- Create: `web/components/sections/Manifeste.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Implement `Manifeste.tsx`** — large Fraunces statement broken into 3 `<Reveal>` lines: "Le plus court n'est pas toujours le plus beau." / "L'Échappée trouve les haltes qui valent le détour." / "Producteurs, marchés, villages, points de vue."

- [ ] **Step 2: Background scrub** — ScrollTrigger that tweens the section bg `--cream` → `--cream-deep` across its scroll range (`scrub: true`), reduced-motion guarded (static `cream-deep`).

- [ ] **Step 3: Render after Hero.**

- [ ] **Step 4: Verify build**

Run: `cd r3/routecore/web && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): manifeste section with bg transition"
```

---

## Task 9: Signature pinned map (the moment)

**Files:**
- Create: `web/components/sections/SignatureMap.tsx`, `web/public/map/france.svg`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Author `france.svg`** — a stylized France outline (Mist Blue stroke, cream fill) plus two `<path>`s: `#route-direct` (Stone Taupe, dashed, Lyon→Vienne straight-ish) and `#route-echappee` (Clay Red curved detour). Add 4 `<circle data-halte>` gold dots along the echappée path. Give the echappée path an `id` so its `getTotalLength()` is usable.

- [ ] **Step 2: Implement `SignatureMap.tsx`** — section `min-height: 100vh`, pinned.

- Inline-import the SVG (as a React component via SVGR is not configured; instead inline the SVG markup directly in the component so paths/circles are addressable refs).
- Eyebrow + Fraunces h2: "Combien de temps veux-tu t'offrir ?"
- Three detour chips: "10 min — une respiration", "25 min — je prends le temps", "45 min — je pars en échappée".

- [ ] **Step 3: Scroll-scrub draw** — in `gsap.context`:
  - Set `#route-echappee` `strokeDasharray`/`strokeDashoffset` to its `getTotalLength()`.
  - Timeline pinned: `ScrollTrigger { trigger, start: "top top", end: "+=2000", scrub: true, pin: true }`.
  - Tween `strokeDashoffset` → 0 (route draws), then stagger-bloom the `[data-halte]` circles (scale 0→1), then visually advance the active detour chip.
  - Reduced-motion: render route fully drawn, no pin, no scrub.
  - Revert context on cleanup.

- [ ] **Step 4: Mobile fallback** — below 768px, skip `pin`; show the route pre-drawn with a simple `Reveal` on the haltes (check `window.innerWidth` inside the matchMedia or `ScrollTrigger.matchMedia`).

- [ ] **Step 5: Render after Manifeste.**

- [ ] **Step 6: Verify build + visual**

Run: `cd r3/routecore/web && pnpm build && pnpm dev`
Visual check: section pins, route draws as you scroll, haltes bloom, unpins cleanly; on mobile width it does not pin.

- [ ] **Step 7: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): signature pinned scroll-scrubbed route map"
```

---

## Task 10: HowItWorks horizontal-scroll gallery

**Files:**
- Create: `web/components/sections/HowItWorks.tsx`, `web/public/screens/.gitkeep`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Implement `HowItWorks.tsx`** — a pinned section translating a horizontal track of 4 cards as the user scrolls vertically. Cards: "Où vas-tu ?", "Combien de temps ?", "On a trouvé 4 haltes", "Ta route est prête". Each card = Fraunces title + Inter caption + `next/image` app-screen mockup placeholder (`public/screens/step-1..4.png`).

- [ ] **Step 2: Horizontal scrub** — `gsap.to(track, { x: () => -(track.scrollWidth - innerWidth), ease: "none", scrollTrigger: { trigger, pin: true, scrub: 1, end: () => "+=" + track.scrollWidth } })`. Reduced-motion / mobile: vertical stack, no pin (use `ScrollTrigger.matchMedia`).

- [ ] **Step 3: Render after SignatureMap.**

- [ ] **Step 4: Verify build + visual**

Run: `cd r3/routecore/web && pnpm build && pnpm dev`
Visual: cards scroll horizontally while pinned; on mobile they stack.

- [ ] **Step 5: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): how-it-works horizontal gallery"
```

---

## Task 11: Haltes category cards

**Files:**
- Create: `web/components/sections/Haltes.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Implement `Haltes.tsx`** — asymmetric, overlapping grid of category cards: Producteurs (olive), Marchés (gold), Villages (clay), Points de vue (mist), Bonnes tables (clay), Nature (success green). Each card: icon (emoji or inline SVG), Fraunces title, one-line description in brand voice. Use negative margins / `transform: translateY` offsets to break the grid (per awwwards "break the grid once"). Wrap each in `<Reveal>` with staggered `y`. Multi-layer box-shadow per design system shadow tokens. `data-cursor-hover` + scale-on-hover.

- [ ] **Step 2: Render after HowItWorks.**

- [ ] **Step 3: Verify build**

Run: `cd r3/routecore/web && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): haltes category cards"
```

---

## Task 12: Stats counters

**Files:**
- Create: `web/components/sections/Stats.tsx`, `web/components/ui/Counter.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: `Counter.tsx`** — counts a number from 0 → target when scrolled into view (`ScrollTrigger start: "top 85%"`, `gsap.to({val:0}, {val:target, onUpdate})`). Reduced-motion: render final value immediately. Props: `to: number`, `suffix?: string`.

- [ ] **Step 2: `Stats.tsx`** — 3–4 stats in Fraunces big numerals: "560+ haltes", "horaires réels", "péages réels — France entière", "0 pub déguisée". (Confirm exact figures at copy pass — spec §8.) Eyebrow "Ce qu'il y a sous le capot".

- [ ] **Step 3: Render after Haltes.**

- [ ] **Step 4: Verify build**

Run: `cd r3/routecore/web && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): animated stats counters"
```

---

## Task 13: Preloader

**Files:**
- Create: `web/components/sections/Preloader.tsx`
- Modify: `web/app/layout.tsx` (mount above everything)

- [ ] **Step 1: Implement `Preloader.tsx`** — fixed full-screen cream overlay, Clay Red route line that draws (SVG `strokeDashoffset`) + a 0→100 % counter, ~2s, then GSAP timeline slides the overlay up/out and the page reveals. Reduced-motion: render hidden immediately (no ceremony, no scroll lock). Lock body scroll while active; unlock on complete.

- [ ] **Step 2: Mount `<Preloader />` at top of `<body>`** in layout.

- [ ] **Step 3: Verify build + visual**

Run: `cd r3/routecore/web && pnpm build && pnpm dev`
Visual: route draws, counter runs, overlay exits, hero staggers in. With reduced-motion the page shows instantly.

- [ ] **Step 4: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): route-drawing preloader"
```

---

## Task 14: Footer + final polish

**Files:**
- Create: `web/components/sections/Footer.tsx`
- Modify: `web/app/page.tsx`, `web/app/globals.css` (skip-link styles, focus states, custom scrollbar)

- [ ] **Step 1: `Footer.tsx`** — minimal: Fraunces brand line "Le GPS des routes qui respirent.", nav anchors, mentions légales / confidentialité placeholders, store badges repeat, © 2026 L'Échappée.

- [ ] **Step 2: Polish CSS** — visible `:focus-visible` outlines (Clay Red), `.skip` link styles (visually hidden until focus), styled-thin scrollbar, ensure `section { padding-block: clamp(96px, 14vh, 180px); }`.

- [ ] **Step 3: Render `<Footer />` last; confirm section order in `page.tsx`:** Hero → Manifeste → SignatureMap → HowItWorks → Haltes → Stats → DownloadCTA → Footer.

- [ ] **Step 4: Verify build + tests + lint**

Run: `cd r3/routecore/web && pnpm build && pnpm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd r3/routecore && git add web && git commit -m "feat(echappee-web): footer and final a11y polish"
```

---

## Task 15: Accessibility & performance verification pass

**Files:** none (verification only); fix-ups land in the relevant section files.

- [ ] **Step 1: Reduced-motion audit** — set OS "reduce motion" (or DevTools rendering emulation). Confirm: no Lenis smoothing, no pin/scrub, no split-text animation, no preloader ceremony, all content visible and readable.

- [ ] **Step 2: Keyboard audit** — Tab through: skip-link works, every CTA/link reachable with visible focus, store badges activate on Enter.

- [ ] **Step 3: Contrast audit** — verify Deep Brown on Cream, surface text, and Clay Red CTA text (Soft White) all pass WCAG AA.

- [ ] **Step 4: Performance** — `pnpm build` then run Lighthouse (or `npx unlighthouse`) on the production build. Targets: LCP < 2.5s, CLS < 0.1. Fix any layout-property animations (must be transform/opacity only) and add explicit dimensions to any image causing CLS.

- [ ] **Step 5: Commit any fixes**

```bash
cd r3/routecore && git add web && git commit -m "fix(echappee-web): a11y and performance pass"
```

---

## Task 16: Deploy to Vercel

**Files:** Create `web/vercel.json` only if needed (defaults should work for Next.js).

- [ ] **Step 1: Confirm production build** — `cd r3/routecore/web && pnpm build` succeeds.
- [ ] **Step 2: Deploy** — from `web/`: `vercel` (preview) then `vercel --prod`. (Requires the Vercel CLI / login — if unavailable, hand the `web/` dir to the user with deploy instructions.)
- [ ] **Step 3: Smoke-test the deployed URL** — preloader, signature map scrub, store badge links, mobile layout.
- [ ] **Step 4: Record the URL** in the spec's open-items section and commit.

---

## Notes for the implementer

- **App is live in stores** — store badges link out; no waitlist/backend.
- **Brand fidelity:** colors and type are non-negotiable (`DESIGN_SYSTEM_ECHAPPEE.md`); motion is intentionally maximalist per the user's explicit choice, overriding the app's internal "calm motion" rule for the *website only*.
- **Every animated section MUST** guard on `useReducedMotion` and clean up its ScrollTriggers via `gsap.context().revert()`.
- **Placeholders to replace** (tracked in spec §8): real store URLs, real app screenshots in `public/screens/`, final stat figures, logo SVG.
- **French copy throughout**, tutoiement, calm voice — reuse phrases from the design system §7.
