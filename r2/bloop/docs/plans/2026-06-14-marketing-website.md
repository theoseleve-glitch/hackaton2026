# bloop Marketing Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Awwwards-level, single-page, bilingual marketing site for the bloop party-game app, anchored by one continuous faceless coral metaball ("liquid bloop") that threads the whole scroll.

**Architecture:** A static Vite + TypeScript site (no UI framework) in the bloop monorepo at `apps/marketing`. DOM/CSS builds all 11 content sections first; a lazy-loaded Three.js raymarched-metaball canvas sits behind them and is choreographed by GSAP ScrollTrigger + Lenis smooth scroll. Pure logic (i18n, catalog, metaball math) is unit-tested with Vitest; visual integration is smoke-verified with the Playwright MCP. First-class fallbacks for reduced-motion / mobile / no-WebGL.

**Tech Stack:** Vite 6, TypeScript 5.7, Three.js, GSAP + ScrollTrigger, Lenis, @fontsource (Fredoka / DM Sans / Caveat), Vitest, Playwright MCP, Vercel (static).

**Spec:** `r2/bloop/docs/designs/2026-06-14-marketing-website-design.md` — the contract. Copy, tokens, section jobs, and guardrails live there; this plan implements it.

**Conventions:**
- All paths below are relative to repo root `C:\Users\Admin\Documents\Hacktaton26`.
- The package is `@bloop/marketing`. Run scripts from `r2/bloop` via `pnpm --filter @bloop/marketing <script>` (pnpm is provided by corepack — run `corepack enable` once if `pnpm` is missing).
- Commit after every task with the shown message. Frequent commits.
- Co-author trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
r2/bloop/apps/marketing/
  package.json            @bloop/marketing — deps + scripts (dev/build/preview/test/typecheck)
  vite.config.ts          Vite config: GLSL ?raw import, build target, base
  tsconfig.json           extends nothing heavy; strict TS, DOM libs
  vitest.config.ts        jsdom env for i18n tests
  index.html              single page; <main> with 11 <section> landmarks; preconnect/preload
  vercel.json             static build + SPA-safe headers
  public/
    favicon.svg           coral-dot favicon
    og.png                1200x630 social card (generated in Task 20)
  src/
    main.ts               entrypoint: wires i18n, scroll, sections, lazy webgl
    styles/
      tokens.css          CSS custom properties (from spec §4)
      base.css            reset, fonts, grain, cursor base, typography ramp
      sections.css        per-section layout (kept one file <500 lines; split if it grows)
    lib/
      i18n.ts             Locale detect/persist/apply, t(), applyI18n()
      scroll.ts           Lenis + ScrollTrigger init, revealOnScroll(), pinScrub()
      cursor.ts           custom lerp cursor + state morphs
      magnetic.ts         magnetic-button effect
      splitText.ts        split a heading into per-char spans
      dom.ts              tiny el() helper for building mockups
    webgl/
      bloop.ts            metaball scene controller (renderer, uniforms, RAF, API)
      droplets.ts         scroll-driven blob schedule + pinch-off → DOM handoff
      fallback.ts         webgl-support + reduced-motion detection, static fallback
      shaders/
        fullscreen.vert   passthrough vertex (fullscreen quad)
        metaball.frag     raymarched SDF smin metaballs, coral material
    sections/
      preloader.ts hero.ts thesis.ts how-it-works.ts every-phone.ts
      library.ts night-oracle.ts proof.ts safety.ts download.ts footer.ts
    mockups/
      home.ts lobby.ts reveal-split.ts oracle.ts   (code-built clean app screens)
    content/
      fr.json en.json     transcreated copy dictionaries
      games.ts            catalog data (name FR/EN, hook FR/EN, accent, creator, spicy)
    math/
      metaball.ts         pure helpers: smin(), blobSchedule()  (unit-tested)
  test/
    i18n.test.ts  games.test.ts  metaball.test.ts
```

---

## Phase A — Foundation

### Task 1: Scaffold the `@bloop/marketing` Vite package

**Files:**
- Create: `r2/bloop/apps/marketing/package.json`
- Create: `r2/bloop/apps/marketing/tsconfig.json`
- Create: `r2/bloop/apps/marketing/vite.config.ts`
- Create: `r2/bloop/apps/marketing/vitest.config.ts`
- Create: `r2/bloop/apps/marketing/index.html`
- Create: `r2/bloop/apps/marketing/src/main.ts`
- Create: `r2/bloop/apps/marketing/.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@bloop/marketing",
  "private": true,
  "type": "module",
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 4173",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "three": "^0.171.0",
    "gsap": "^3.12.5",
    "lenis": "^1.1.18",
    "@fontsource/fredoka": "^5.1.0",
    "@fontsource/dm-sans": "^5.1.0",
    "@fontsource/caveat": "^5.1.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "typescript": "^5.7.3",
    "vitest": "^3.2.0",
    "jsdom": "^25.0.0",
    "@types/three": "^0.171.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src", "test", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `vite.config.ts`** (GLSL files imported as raw strings)

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.vert', '**/*.frag'],
  build: { target: 'es2020', cssCodeSplit: true, sourcemap: false },
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules
dist
.vite
*.local
```

- [ ] **Step 6: Create minimal `index.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>bloop — le jeu qui expose ton groupe</title>
    <meta name="description" content="le jeu de soirée qui expose ton groupe. chaque manche démarre une dispute en 30 secondes. 2–16 joueurs, zéro compte." />
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Create placeholder `src/main.ts`**

```ts
const app = document.getElementById('app')!;
app.innerHTML = '<h1>bloop.</h1>';
```

- [ ] **Step 8: Install and verify dev server**

Run from `r2/bloop`:
```
pnpm install
pnpm --filter @bloop/marketing dev
```
Expected: Vite prints `Local: http://localhost:5173/`. Open it with the Playwright MCP (`browser_navigate` → `http://localhost:5173/`), then `browser_snapshot` shows the `bloop.` heading and `browser_console_messages` shows no errors. Stop the dev server.

- [ ] **Step 9: Verify typecheck + build**

Run from `r2/bloop`:
```
pnpm --filter @bloop/marketing typecheck
pnpm --filter @bloop/marketing build
```
Expected: both exit 0; `vite build` emits `apps/marketing/dist/`.

- [ ] **Step 10: Commit**

```
git add r2/bloop/apps/marketing r2/bloop/pnpm-lock.yaml
git commit -m "feat(marketing): scaffold @bloop/marketing Vite+TS package"
```

---

### Task 2: Design tokens + base styles + fonts + grain

**Files:**
- Create: `r2/bloop/apps/marketing/src/styles/tokens.css`
- Create: `r2/bloop/apps/marketing/src/styles/base.css`
- Modify: `r2/bloop/apps/marketing/src/main.ts`

- [ ] **Step 1: Create `tokens.css`** — paste the full `:root` block from spec §4 verbatim, plus type-ramp custom properties:

```css
:root{
  --ink:#0F1633; --cream:#FBF6EC; --cream-100:#F4EAD5; --white:#FFFFFF;
  --coral:#FF6F61; --coral-pressed:#E85D50;
  --yellow:#FFCC4D; --teal:#4ECDC4; --cobalt:#5B7BFF; --lavender:#B6A8FF; --pink:#FF6B9D;
  --yellow-soft:#FFE08A; --lavender-soft:#D6CCFF; --pink-soft:#FFC2D6;
  --success:#3DC97A; --danger:#E5503F; --warning:#FDC700;
  --r-sm:10px; --r-md:14px; --r-lg:22px; --r-xl:28px; --r-pill:999px;
  --pop:0 4px 0 0 var(--ink);
  --clay:0 6px 0 rgba(15,22,51,.18), 0 10px 18px rgba(15,22,51,.12);
  --s1:8px; --s2:12px; --s3:16px; --s4:24px; --s5:32px;
  --font-display:'Fredoka',system-ui,sans-serif;
  --font-body:'DM Sans',system-ui,sans-serif;
  --font-sticker:'Caveat',cursive;
  --maxw:1240px;
}
```

- [ ] **Step 2: Create `base.css`** — reset, font imports, typography ramp, grain overlay, scrollbar, focus:

```css
@import '@fontsource/fredoka/600.css';
@import '@fontsource/fredoka/700.css';
@import '@fontsource/dm-sans/400.css';
@import '@fontsource/dm-sans/500.css';
@import '@fontsource/dm-sans/700.css';
@import '@fontsource/caveat/600.css';

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:auto} /* Lenis owns smoothing */
body{
  background:var(--cream); color:var(--ink);
  font-family:var(--font-body); font-size:18px; line-height:1.6;
  -webkit-font-smoothing:antialiased; overflow-x:hidden;
}
h1,h2,h3{font-family:var(--font-display);font-weight:700;line-height:1.05;letter-spacing:-.01em}
.h-hero{font-size:clamp(48px,9vw,132px)}
.h-display{font-size:clamp(40px,6vw,60px)}
.h1{font-size:clamp(32px,4.5vw,44px)}
.overline{font-family:var(--font-body);font-weight:500;font-size:11px;
  letter-spacing:1.2px;text-transform:uppercase;opacity:.7}
a{color:inherit}
:focus-visible{outline:3px solid var(--coral);outline-offset:3px;border-radius:6px}
/* SVG grain over cream */
body::after{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:9998;opacity:.045;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
@media (prefers-reduced-motion: reduce){ html{scroll-behavior:auto} }
```

- [ ] **Step 3: Import styles in `main.ts`**

```ts
import './styles/tokens.css';
import './styles/base.css';

const app = document.getElementById('app')!;
app.innerHTML = '<h1 class="h-hero">bloop<span style="color:var(--coral)">.</span></h1>';
```

- [ ] **Step 4: Verify visually**

Start dev server; with Playwright MCP `browser_navigate` to it and `browser_take_screenshot`. Expected: cream `#FBF6EC` background, ink heading in Fredoka, coral `.`, faint grain. `browser_console_messages` clean.

- [ ] **Step 5: Commit**

```
git add r2/bloop/apps/marketing/src
git commit -m "feat(marketing): design tokens, base styles, fonts, grain"
```

---

### Task 3: Content + catalog data + i18n engine (unit-tested)

**Files:**
- Create: `r2/bloop/apps/marketing/src/content/games.ts`
- Create: `r2/bloop/apps/marketing/src/content/fr.json`
- Create: `r2/bloop/apps/marketing/src/content/en.json`
- Create: `r2/bloop/apps/marketing/src/lib/i18n.ts`
- Create: `r2/bloop/apps/marketing/test/i18n.test.ts`
- Create: `r2/bloop/apps/marketing/test/games.test.ts`

- [ ] **Step 1: Write `test/games.test.ts` (failing)**

```ts
import { describe, it, expect } from 'vitest';
import { GAMES } from '../src/content/games';

describe('catalog', () => {
  it('has the launch games with bilingual names + hooks', () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(8);
    for (const g of GAMES) {
      expect(g.name.fr).toBeTruthy();
      expect(g.name.en).toBeTruthy();
      expect(g.hook.fr).toBeTruthy();
      expect(g.hook.en).toBeTruthy();
      expect(g.accent).toMatch(/^#/);
    }
  });
  it('flags 18+ games', () => {
    expect(GAMES.some((g) => g.spicy)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run from `r2/bloop`: `pnpm --filter @bloop/marketing test`
Expected: FAIL — cannot find module `games`.

- [ ] **Step 3: Create `src/content/games.ts`** (data from spec §3 / brand brief catalog; 8 launch tiles minimum — add more as desired)

```ts
export interface Game {
  id: string;
  name: { fr: string; en: string };
  hook: { fr: string; en: string };
  accent: string;     // one of the bright tokens
  creator?: string;   // "inspired by …" chip
  spicy?: boolean;    // 18+ sibling
}

export const GAMES: Game[] = [
  { id: 'qui-de-vous', name: { fr: 'Qui de vous…', en: 'Most Likely To' },
    hook: { fr: 'un seul vote désigne le coupable.', en: 'one vote names the guilty one.' },
    accent: '#FFCC4D' },
  { id: 'pires-potes', name: { fr: 'Pires Potes', en: 'Worst Mates' },
    hook: { fr: 'chaque question désigne un coupable. le pire pote gagne.', en: 'every question points a finger. the worst friend wins.' },
    accent: '#FF6B9D', creator: 'inspired by Squeezie', spicy: true },
  { id: 'tu-preferes', name: { fr: 'Tu Préfères ?', en: 'Would You Rather' },
    hook: { fr: 'devine la majorité. les deux options coûtent cher.', en: 'predict the majority. both options cost you.' },
    accent: '#5B7BFF', creator: 'inspired by Squeezie' },
  { id: 'gauche-droite', name: { fr: 'De gauche ou de droite ?', en: 'Left- or Right-Coded?' },
    hook: { fr: 'vote le camp. puis défends-le devant tout le monde.', en: 'vote the side. then defend it to the room.' },
    accent: '#4ECDC4' },
  { id: 'au-pif', name: { fr: 'Au Pif !', en: 'Ballpark!' },
    hook: { fr: 'le plus proche gagne. personne n’est largué.', en: 'closest number wins. nobody gets shut out.' },
    accent: '#FFCC4D', creator: 'inspired by McFly & Carlito' },
  { id: 'cinquante', name: { fr: 'Cinquante-Cinquante', en: 'Fifty-Fifty' },
    hook: { fr: 'complète la phrase, vise le pourcentage de la foule.', en: 'finish the line, hit the crowd’s number.' },
    accent: '#B6A8FF' },
  { id: 'double-jeu', name: { fr: 'Double Jeu', en: 'Double Agent' },
    hook: { fr: 'tout le monde voit le même mot. sauf un. démasque-le.', en: 'everyone sees the same word. except one. unmask them.' },
    accent: '#5B7BFF' },
  { id: 'action-verite', name: { fr: 'Action ou Vérité', en: 'Truth or Dare' },
    hook: { fr: 'deux ambiances : la soirée entre potes, ou le tête-à-tête qui chauffe.', en: 'two vibes: party night, or the date that heats up.' },
    accent: '#FF6F61', spicy: true },
  { id: 'loup-garou', name: { fr: 'Loup-Garou', en: 'Werewolf' },
    hook: { fr: 'le village dort. quelqu’un ment.', en: 'the village sleeps. someone is lying.' },
    accent: '#0F1633' },
];
```

- [ ] **Step 4: Write `test/i18n.test.ts` (failing)**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { detectLocale, t } from '../src/lib/i18n';

describe('i18n', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to fr when nav language is not english', () => {
    expect(detectLocale('de-DE')).toBe('fr');
    expect(detectLocale('fr-FR')).toBe('fr');
    expect(detectLocale(undefined)).toBe('fr');
  });
  it('detects en', () => {
    expect(detectLocale('en-GB')).toBe('en');
  });
  it('respects a persisted choice over nav language', () => {
    localStorage.setItem('bloop_locale', 'en');
    expect(detectLocale('fr-FR')).toBe('en');
  });
  it('looks up nested keys per locale', () => {
    expect(t('hero.headline', 'fr')).toMatch(/expose/i);
    expect(t('hero.headline', 'en')).toMatch(/expose/i);
  });
  it('falls back to the key when missing', () => {
    expect(t('nope.missing', 'fr')).toBe('nope.missing');
  });
});
```

- [ ] **Step 5: Run it, verify it fails**

Run: `pnpm --filter @bloop/marketing test`
Expected: FAIL — cannot find module `i18n`.

- [ ] **Step 6: Create `src/content/fr.json` and `en.json`**

`fr.json` (author natively; full-transgressive register — see spec §3 copy):
```json
{
  "nav": { "play": "jouer" },
  "hero": {
    "eyebrow": "2–16 joueurs · zéro compte · rien de stocké sur toi",
    "headline": "le jeu qui expose ton groupe",
    "sub": "chaque manche est conçue pour démarrer une dispute en 30 secondes.",
    "cta": "choper bloop"
  },
  "thesis": { "line": "TOI t’as voté ça ?!", "echo": "" },
  "how": {
    "title": "comment ça marche",
    "s1": "crée un salon",
    "s2": "tes potes scannent le code",
    "s3": "démarre le chaos"
  },
  "phone": { "title": "pas de télé. pas de comptes.", "body": "chaque téléphone est la manette ET l’écran." },
  "library": { "title": "les jeux", "soon": "bientôt 👀" },
  "night": { "title": "une soirée, pas une partie", "oracle": "l’oracle de la soirée" },
  "proof": { "title": "le moment où les votes tombent" },
  "safety": { "title": "drôle, jamais cruel", "body": "anonyme. signalement intégré. accessible. contenu 18+ derrière une porte d’âge." },
  "download": { "title": "choper bloop", "soon": "bientôt" },
  "footer": { "tag": "fait avec du chaos · 2026", "privacy": "confidentialité" }
}
```

`en.json` (transcreated, not translated — lowercase texting register):
```json
{
  "nav": { "play": "play" },
  "hero": {
    "eyebrow": "2–16 players · no accounts · nothing stored about you",
    "headline": "the party game that exposes your group",
    "sub": "every round is built to start a 30-second argument.",
    "cta": "get bloop"
  },
  "thesis": { "line": "TOI t’as voté ça ?!", "echo": "wait — YOU voted that?!" },
  "how": {
    "title": "how it works",
    "s1": "create a room",
    "s2": "friends scan the code",
    "s3": "start the chaos"
  },
  "phone": { "title": "no tv. no accounts.", "body": "every phone is the controller AND the screen." },
  "library": { "title": "the games", "soon": "soon 👀" },
  "night": { "title": "one night, not one match", "oracle": "the oracle of the night" },
  "proof": { "title": "the moment the votes land" },
  "safety": { "title": "funny, never cruel", "body": "anonymous. report built in. accessible. 18+ content behind an age gate." },
  "download": { "title": "get bloop", "soon": "soon" },
  "footer": { "tag": "built with chaos · 2026", "privacy": "privacy" }
}
```

- [ ] **Step 7: Create `src/lib/i18n.ts`**

```ts
import fr from '../content/fr.json';
import en from '../content/en.json';

export type Locale = 'fr' | 'en';
const DICTS: Record<Locale, unknown> = { fr, en };
const KEY = 'bloop_locale';

export function detectLocale(navLang: string | undefined =
  typeof navigator !== 'undefined' ? navigator.language : undefined): Locale {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  if (saved === 'fr' || saved === 'en') return saved;
  return navLang?.toLowerCase().startsWith('en') ? 'en' : 'fr'; // FR is the default
}

export function t(key: string, locale: Locale): string {
  const lookup = (dict: unknown) =>
    key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict);
  const v = lookup(DICTS[locale]) ?? lookup(DICTS.fr);
  return typeof v === 'string' ? v : key;
}

export function applyI18n(locale: Locale): void {
  localStorage.setItem(KEY, locale);
  document.documentElement.lang = locale;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!, locale);
  });
  document.dispatchEvent(new CustomEvent('localechange', { detail: locale }));
}
```

- [ ] **Step 8: Run tests, verify pass**

Run: `pnpm --filter @bloop/marketing test`
Expected: PASS (games + i18n suites green).

- [ ] **Step 9: Commit**

```
git add r2/bloop/apps/marketing/src r2/bloop/apps/marketing/test
git commit -m "feat(marketing): catalog data + bilingual i18n engine (tested)"
```

---

### Task 4: Smooth-scroll + reveal core (Lenis + GSAP)

**Files:**
- Create: `r2/bloop/apps/marketing/src/lib/scroll.ts`
- Create: `r2/bloop/apps/marketing/src/lib/splitText.ts`

- [ ] **Step 1: Create `src/lib/scroll.ts`**

```ts
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initSmoothScroll(): Lenis | null {
  if (prefersReducedMotion()) return null;
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function revealOnScroll(scope: HTMLElement): void {
  const targets = scope.querySelectorAll<HTMLElement>('[data-reveal]');
  if (prefersReducedMotion()) { gsap.set(targets, { opacity: 1, y: 0 }); return; }
  gsap.from(targets, {
    opacity: 0, y: 44, duration: 0.8, ease: 'power3.out', stagger: 0.1,
    scrollTrigger: { trigger: scope, start: 'top 80%' },
  });
}

/** Pin a section and return a scrubbed timeline for scroll-bound choreography. */
export function pinScrub(section: HTMLElement, length = '+=120%'): gsap.core.Timeline {
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: section, start: 'top top', end: length,
      pin: !prefersReducedMotion(), scrub: prefersReducedMotion() ? false : 1,
    },
  });
  return tl;
}
```

- [ ] **Step 2: Create `src/lib/splitText.ts`**

```ts
/** Wrap each character of an element's text in a <span class="char"> for stagger animation. */
export function splitChars(el: HTMLElement): HTMLElement[] {
  const text = el.textContent ?? '';
  el.textContent = '';
  const spans: HTMLElement[] = [];
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = 'char';
    s.style.display = 'inline-block';
    s.style.whiteSpace = 'pre';
    s.textContent = ch;
    el.appendChild(s);
    spans.push(s);
  }
  return spans;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @bloop/marketing typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```
git add r2/bloop/apps/marketing/src/lib
git commit -m "feat(marketing): Lenis + GSAP scroll core, splitText"
```

---

## Phase B — Shell & sections (DOM-first, no WebGL yet)

### Task 5: App shell — nav, FR/EN toggle, custom cursor, magnetic, section mount

**Files:**
- Create: `r2/bloop/apps/marketing/src/lib/cursor.ts`
- Create: `r2/bloop/apps/marketing/src/lib/magnetic.ts`
- Create: `r2/bloop/apps/marketing/src/lib/dom.ts`
- Create: `r2/bloop/apps/marketing/src/styles/sections.css`
- Rewrite: `r2/bloop/apps/marketing/src/main.ts`

- [ ] **Step 1: Create `src/lib/dom.ts`**

```ts
type Attrs = Record<string, string>;
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Attrs = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c);
  return n;
}
```

- [ ] **Step 2: Create `src/lib/cursor.ts`** (lerp dot; morphs on `[data-cursor]` elements; disabled on touch + reduced-motion)

```ts
import { prefersReducedMotion } from './scroll';

export function initCursor(): void {
  if (matchMedia('(pointer: coarse)').matches || prefersReducedMotion()) return;
  const dot = document.createElement('div');
  dot.className = 'cursor';
  dot.setAttribute('aria-hidden', 'true');
  document.body.appendChild(dot);
  let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y;
  addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; });
  const tick = () => { x += (tx - x) * 0.18; y += (ty - y) * 0.18;
    dot.style.transform = `translate(${x}px,${y}px)`; requestAnimationFrame(tick); };
  tick();
  document.querySelectorAll<HTMLElement>('[data-cursor]').forEach((node) => {
    node.addEventListener('mouseenter', () => {
      dot.classList.add('cursor--active'); dot.dataset.label = node.dataset.cursor ?? '';
    });
    node.addEventListener('mouseleave', () => dot.classList.remove('cursor--active'));
  });
}
```

CSS for cursor (append to `base.css`):
```css
.cursor{position:fixed;top:0;left:0;width:14px;height:14px;margin:-7px 0 0 -7px;
  border-radius:var(--r-pill);background:var(--coral);pointer-events:none;z-index:9999;
  mix-blend-mode:normal;transition:width .2s,height .2s,background .2s}
.cursor--active{width:64px;height:64px;margin:-32px 0 0 -32px;background:var(--ink)}
.cursor--active::after{content:attr(data-label);position:absolute;inset:0;display:grid;
  place-items:center;color:var(--cream);font:500 11px/1 var(--font-body);text-transform:uppercase;letter-spacing:1px}
@media (pointer: coarse){.cursor{display:none}}
```

- [ ] **Step 3: Create `src/lib/magnetic.ts`**

```ts
import { prefersReducedMotion } from './scroll';
import gsap from 'gsap';

export function magnetize(node: HTMLElement, radius = 80): void {
  if (prefersReducedMotion() || matchMedia('(pointer: coarse)').matches) return;
  node.addEventListener('mousemove', (e) => {
    const r = node.getBoundingClientRect();
    const mx = e.clientX - (r.left + r.width / 2);
    const my = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(mx, my) < radius + Math.max(r.width, r.height) / 2)
      gsap.to(node, { x: mx * 0.3, y: my * 0.3, duration: 0.4, ease: 'power3.out' });
  });
  node.addEventListener('mouseleave', () =>
    gsap.to(node, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.4)' }));
}
```

- [ ] **Step 4: Create `src/styles/sections.css`** with the nav + section frame:

```css
.nav{position:fixed;top:0;left:0;right:0;z-index:9000;display:flex;justify-content:space-between;
  align-items:center;padding:var(--s4) clamp(16px,4vw,48px);transition:transform .4s ease}
.nav--hidden{transform:translateY(-110%)}
.nav__logo{font-family:var(--font-display);font-weight:700;font-size:28px}
.nav__dot{color:var(--coral)}
.lang{display:flex;gap:var(--s1);font:500 13px/1 var(--font-body)}
.lang button{background:none;border:0;cursor:pointer;opacity:.5;padding:6px}
.lang button[aria-current="true"]{opacity:1;color:var(--coral)}
.section{position:relative;max-width:var(--maxw);margin-inline:auto;
  padding:clamp(96px,16vh,180px) clamp(16px,4vw,48px)}
.section--full{min-height:100vh;display:grid;align-content:center}
.btn{display:inline-block;font:700 18px/1 var(--font-body);color:var(--white);
  background:var(--coral);padding:18px 32px;border-radius:var(--r-pill);
  box-shadow:var(--pop);border:0;cursor:pointer;text-decoration:none;will-change:transform}
.btn:active{background:var(--coral-pressed)}
.card{background:var(--white);border-radius:var(--r-xl);box-shadow:var(--clay);padding:var(--s5)}
```

- [ ] **Step 5: Rewrite `src/main.ts`** to mount the nav + an empty ordered list of section containers, then wire i18n/scroll/cursor:

```ts
import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import { detectLocale, applyI18n, t, type Locale } from './lib/i18n';
import { initSmoothScroll, revealOnScroll } from './lib/scroll';
import { initCursor } from './lib/cursor';
import { magnetize } from './lib/magnetic';
import { el } from './lib/dom';

const SECTION_IDS = ['hero','thesis','how','phone','library','night','proof','safety','download','footer'] as const;

function mountNav(locale: Locale) {
  const setLang = (l: Locale) => { applyI18n(l);
    document.querySelectorAll<HTMLButtonElement>('.lang button')
      .forEach((b) => b.setAttribute('aria-current', String(b.dataset.l === l))); };
  const nav = el('header', { class: 'nav' },
    el('a', { class: 'nav__logo', href: '#hero', 'aria-label': 'bloop' },
      'bloop', el('span', { class: 'nav__dot' }, '.')),
    el('nav', { class: 'lang', 'aria-label': 'language' },
      Object.assign(el('button', { 'data-l': 'fr' }, 'FR'), { onclick: () => setLang('fr') }),
      Object.assign(el('button', { 'data-l': 'en' }, 'EN'), { onclick: () => setLang('en') })));
  document.body.prepend(nav);
  setLang(locale);
}

async function main() {
  const app = document.getElementById('app')!;
  const locale = detectLocale();
  for (const id of SECTION_IDS) app.append(el('section', { id, class: 'section' }));
  mountNav(locale);
  // skip-link for a11y
  const skip = el('a', { href: '#hero', class: 'skip' }, 'aller au contenu');
  document.body.prepend(skip);

  // sections are filled by Phase-B tasks; placeholder so the page is non-empty:
  document.getElementById('hero')!.append(
    el('h1', { class: 'h-hero', 'data-reveal': '' }, 'bloop', el('span', { class:'nav__dot' }, '.')));

  applyI18n(locale);
  initCursor();
  initSmoothScroll();
  document.querySelectorAll<HTMLElement>('.section').forEach(revealOnScroll);
  document.querySelectorAll<HTMLElement>('.btn').forEach((b) => magnetize(b));
}
main();
```

Add to `base.css`:
```css
.skip{position:fixed;left:-9999px;z-index:10000;background:var(--ink);color:var(--cream);
  padding:10px 16px;border-radius:var(--r-md)}
.skip:focus{left:16px;top:16px}
```

- [ ] **Step 6: Verify**

Start dev server; Playwright MCP `browser_navigate` + `browser_snapshot`. Expected: nav with `bloop.` + FR/EN toggle, 10 empty sections, hero heading. Click EN → toggle marks EN current, `<html lang>` becomes `en`. `browser_console_messages` clean.

- [ ] **Step 7: Commit**

```
git add r2/bloop/apps/marketing/src
git commit -m "feat(marketing): app shell — nav, FR/EN toggle, cursor, magnetic, sections"
```

---

### Task 6: Hero section

**Files:**
- Create: `r2/bloop/apps/marketing/src/sections/hero.ts`
- Modify: `r2/bloop/apps/marketing/src/main.ts` (call `buildHero`)

- [ ] **Step 1: Create `src/sections/hero.ts`**

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { splitChars } from '../lib/splitText';
import gsap from 'gsap';
import { prefersReducedMotion } from '../lib/scroll';

export function buildHero(root: HTMLElement, locale: Locale): void {
  root.classList.add('section--full', 'hero');
  const head = el('h1', { class: 'h-hero hero__head', 'data-i18n': 'hero.headline' }, t('hero.headline', locale));
  const cta = el('a', { class: 'btn', href: '#download', 'data-i18n': 'hero.cta', 'data-cursor': 'go' }, t('hero.cta', locale));
  root.append(
    el('p', { class: 'overline', 'data-i18n': 'hero.eyebrow' }, t('hero.eyebrow', locale)),
    head,
    el('p', { class: 'hero__sub', 'data-i18n': 'hero.sub' }, t('hero.sub', locale)),
    cta,
  );
  const chars = splitChars(head);
  if (!prefersReducedMotion())
    gsap.from(chars, { yPercent: 120, opacity: 0, duration: 0.9, ease: 'power4.out', stagger: 0.03, delay: 0.2 });
}
```

CSS (append to `sections.css`):
```css
.hero__head{max-width:14ch;margin:var(--s3) 0}
.hero__sub{font-size:clamp(18px,2vw,24px);max-width:48ch;margin-bottom:var(--s5);opacity:.85}
```

- [ ] **Step 2: Wire it in `main.ts`** — replace the hero placeholder block with:

```ts
import { buildHero } from './sections/hero';
// …after sections are mounted:
buildHero(document.getElementById('hero')!, locale);
```

- [ ] **Step 3: Verify**

Dev server + Playwright MCP screenshot. Expected: eyebrow, big Fredoka headline (chars animate in), sub, coral magnetic CTA. Toggle EN swaps copy. Console clean.

- [ ] **Step 4: Commit**

```
git add r2/bloop/apps/marketing/src
git commit -m "feat(marketing): hero section with split-text headline + magnetic CTA"
```

---

### Task 7: Thesis section (pinned/scrubbed takeover — the screenshot moment, DOM layer)

**Files:**
- Create: `r2/bloop/apps/marketing/src/sections/thesis.ts`
- Modify: `r2/bloop/apps/marketing/src/main.ts`

- [ ] **Step 1: Create `src/sections/thesis.ts`** — a pinned section whose vote rows fill and whose line slams in on scrub. (The metaball droplet handoff is added in Task 18; this builds the DOM + scrub.)

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { pinScrub, prefersReducedMotion } from '../lib/scroll';
import gsap from 'gsap';

export function buildThesis(root: HTMLElement, locale: Locale): void {
  root.classList.add('section--full', 'thesis');
  const line = el('h2', { class: 'h-display thesis__line', 'data-i18n': 'thesis.line' }, t('thesis.line', locale));
  const echo = el('p', { class: 'thesis__echo', 'data-i18n': 'thesis.echo' }, t('thesis.echo', locale));
  const rows = ['63%', '37%'].map((p, i) =>
    el('div', { class: 'vote', 'data-vote': String(i) },
      el('span', { class: 'vote__bar', style: `--p:${p}` }),
      el('span', { class: 'vote__pct' }, p)));
  const stage = el('div', { class: 'thesis__stage' }, ...rows);
  root.append(stage, line, echo);

  const tl = pinScrub(root);
  if (!prefersReducedMotion()) {
    tl.from('.vote__bar', { scaleX: 0, transformOrigin: 'left', stagger: 0.15, duration: 0.4 })
      .from(line, { scale: 0.6, opacity: 0, ease: 'back.out(2)', duration: 0.3 }, '>-0.1');
  } else {
    gsap.set('.vote__bar', { scaleX: 1 });
  }
}
```

CSS (append to `sections.css`):
```css
.thesis{text-align:center}
.thesis__stage{display:grid;gap:var(--s3);max-width:520px;margin:0 auto var(--s5)}
.vote{position:relative;background:var(--white);border-radius:var(--r-pill);box-shadow:var(--pop);
  height:56px;display:flex;align-items:center;padding:0 var(--s4);overflow:hidden}
.vote__bar{position:absolute;inset:0;background:var(--coral);transform-origin:left;
  width:var(--p);border-radius:var(--r-pill)}
.vote__pct{position:relative;margin-left:auto;font-family:var(--font-display);font-weight:700;color:var(--ink)}
.thesis__line{color:var(--ink)}
.thesis__echo{opacity:.6;margin-top:var(--s2)}
```

- [ ] **Step 2: Wire in `main.ts`:** `import { buildThesis } from './sections/thesis';` then `buildThesis(document.getElementById('thesis')!, locale);`

- [ ] **Step 3: Verify** — scroll into thesis; bars fill, line pops. Reduced-motion: bars full, no pin. Screenshot via Playwright MCP. Console clean.

- [ ] **Step 4: Commit**

```
git add r2/bloop/apps/marketing/src
git commit -m "feat(marketing): thesis pinned/scrub takeover section"
```

---

### Task 8: How-it-works (3 steps)

**Files:**
- Create: `r2/bloop/apps/marketing/src/sections/how-it-works.ts`
- Modify: `main.ts`

- [ ] **Step 1: Create `how-it-works.ts`** — three numbered cards from `how.s1/s2/s3`, each `[data-reveal]`, each with a coral index disc.

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';

export function buildHow(root: HTMLElement, locale: Locale): void {
  root.append(
    el('p', { class: 'overline', 'data-i18n': 'how.title' }, t('how.title', locale)),
    el('div', { class: 'how__grid' },
      ...(['how.s1','how.s2','how.s3'] as const).map((k, i) =>
        el('div', { class: 'card how__step', 'data-reveal': '' },
          el('span', { class: 'how__num' }, String(i + 1)),
          el('p', { 'data-i18n': k }, t(k, locale))))));
}
```

CSS:
```css
.how__grid{display:grid;gap:var(--s4);grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:var(--s4)}
.how__step{display:grid;gap:var(--s3);font-size:22px;font-family:var(--font-display);font-weight:600}
.how__num{display:grid;place-items:center;width:48px;height:48px;border-radius:var(--r-pill);
  background:var(--coral);color:var(--white);box-shadow:var(--pop)}
```

- [ ] **Step 2: Wire in `main.ts`.** **Step 3: Verify** (Playwright screenshot, reveal works, EN swap). **Step 4: Commit** `feat(marketing): how-it-works 3-step section`.

---

### Task 9: Every-phone differentiator + clean phone mockups

**Files:**
- Create: `r2/bloop/apps/marketing/src/mockups/home.ts`
- Create: `r2/bloop/apps/marketing/src/mockups/lobby.ts`
- Create: `r2/bloop/apps/marketing/src/sections/every-phone.ts`
- Modify: `main.ts`

- [ ] **Step 1: Create `src/mockups/home.ts`** — a code-built clean bloop home screen inside a phone frame (real tokens, realistic data, NO dev artifacts):

```ts
import { el } from '../lib/dom';

/** Returns a phone-framed clean bloop home screen. */
export function phoneHome(): HTMLElement {
  return el('div', { class: 'phone' },
    el('div', { class: 'phone__screen' },
      el('div', { class: 'mk-logo' }, 'bloop', el('span', { class: 'nav__dot' }, '.')),
      el('div', { class: 'mk-profile card' },
        el('span', { class: 'mk-avatar', style: 'background:#5B7BFF' }, 'N'),
        el('span', {}, 'Nacho Wizard')),
      el('p', { class: 'overline' }, 'got a code?'),
      el('div', { class: 'mk-code' }, ...['X','X','S','V'].map((c) => el('span', { class: 'mk-cell' }, c))),
      el('button', { class: 'btn', style: 'width:100%' }, 'create room')));
}
```

- [ ] **Step 2: Create `src/mockups/lobby.ts`** — room-code + squad lobby (yellow code card, avatar dots, host crown, coral Start CTA). Same `el()` pattern; realistic 3 players.

```ts
import { el } from '../lib/dom';

export function phoneLobby(): HTMLElement {
  const squad = [['You','#FFCC4D','👑'], ['Léa','#5B7BFF',''], ['Tom','#FF6B9D','']];
  return el('div', { class: 'phone' },
    el('div', { class: 'phone__screen' },
      el('div', { class: 'mk-code mk-code--yellow' }, ...['X','X','S','V'].map((c) => el('span', { class: 'mk-cell' }, c))),
      el('p', { class: 'overline' }, 'your squad · 3 of 16'),
      el('div', { class: 'mk-squad' }, ...squad.map(([n,c,k]) =>
        el('div', { class: 'mk-player' }, el('span', { class: 'mk-avatar', style: `background:${c}` }, n[0]),
          el('span', {}, n), el('span', { class: 'mk-crown' }, k)))),
      el('button', { class: 'btn', style: 'width:100%' }, 'start — tu préfères ?')));
}
```

- [ ] **Step 3: Create `src/sections/every-phone.ts`** — title `phone.title` + body `phone.body`, with the two phone mockups side by side, `[data-reveal]`.

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { phoneHome } from '../mockups/home';
import { phoneLobby } from '../mockups/lobby';

export function buildEveryPhone(root: HTMLElement, locale: Locale): void {
  root.append(
    el('h2', { class: 'h1', 'data-i18n': 'phone.title' }, t('phone.title', locale)),
    el('p', { class: 'phone__body', 'data-i18n': 'phone.body' }, t('phone.body', locale)),
    el('div', { class: 'phone__row', 'data-reveal': '' }, phoneHome(), phoneLobby()));
}
```

- [ ] **Step 4: Add phone-frame + mockup CSS to `sections.css`:**

```css
.phone{width:240px;border-radius:36px;background:var(--ink);padding:10px;box-shadow:var(--clay);flex:0 0 auto}
.phone__screen{background:var(--cream);border-radius:28px;padding:var(--s4);display:grid;gap:var(--s3);min-height:460px}
.phone__row{display:flex;gap:var(--s5);flex-wrap:wrap;justify-content:center;margin-top:var(--s5)}
.phone__body{font-size:clamp(20px,2.4vw,28px);max-width:30ch}
.mk-logo{font-family:var(--font-display);font-weight:700;font-size:26px;text-align:center}
.mk-profile{display:flex;align-items:center;gap:var(--s2);padding:var(--s2) var(--s3)}
.mk-avatar{display:grid;place-items:center;width:34px;height:34px;border-radius:var(--r-pill);color:#fff;font-weight:700}
.mk-code{display:flex;gap:var(--s2);justify-content:center}
.mk-cell{display:grid;place-items:center;width:44px;height:52px;background:var(--white);border-radius:var(--r-md);
  box-shadow:var(--pop);font-family:var(--font-display);font-weight:700;font-size:24px}
.mk-code--yellow .mk-cell{background:var(--yellow)}
.mk-squad{display:grid;gap:var(--s2)}
.mk-player{display:flex;align-items:center;gap:var(--s2)}
.mk-crown{margin-left:auto}
```

- [ ] **Step 5: Wire in `main.ts`. Step 6: Verify** (two clean phone mockups, no dev artifacts). **Step 7: Commit** `feat(marketing): every-phone differentiator + clean phone mockups`.

---

### Task 10: Game library (horizontal-scroll catalog)

**Files:**
- Create: `r2/bloop/apps/marketing/src/sections/library.ts`
- Modify: `main.ts`

- [ ] **Step 1: Create `library.ts`** — horizontal-scroll row of cards from `GAMES`; each card: name, hook, accent top-bar, optional creator chip, `SOON`/spicy badge. Drag cursor via `data-cursor`.

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { GAMES } from '../content/games';

export function buildLibrary(root: HTMLElement, locale: Locale): void {
  const track = el('div', { class: 'lib__track', 'data-cursor': 'drag' },
    ...GAMES.map((g) => el('article', { class: 'lib__card card', style: `--accent:${g.accent}` },
      el('div', { class: 'lib__bar' }),
      el('h3', {}, g.name[locale], g.spicy ? el('span', { class: 'lib__18' }, '18+') : ''),
      el('p', { class: 'lib__hook' }, g.hook[locale]),
      g.creator ? el('span', { class: 'lib__chip' }, g.creator) : '')));
  root.append(
    el('p', { class: 'overline', 'data-i18n': 'library.title' }, t('library.title', locale)),
    el('div', { class: 'lib__scroller' }, track));
}
```

CSS:
```css
.lib__scroller{overflow-x:auto;margin-top:var(--s4);scrollbar-width:none}
.lib__scroller::-webkit-scrollbar{display:none}
.lib__track{display:flex;gap:var(--s4);padding-bottom:var(--s4);width:max-content}
.lib__card{position:relative;width:280px;display:grid;gap:var(--s2);padding-top:var(--s5)}
.lib__bar{position:absolute;top:0;left:0;right:0;height:10px;background:var(--accent);
  border-radius:var(--r-xl) var(--r-xl) 0 0}
.lib__18{font:700 11px/1 var(--font-body);background:var(--ink);color:var(--cream);padding:4px 8px;
  border-radius:var(--r-pill);margin-left:8px;vertical-align:middle}
.lib__hook{opacity:.8;font-size:16px}
.lib__chip{font:500 12px/1 var(--font-body);opacity:.6}
```

- [ ] **Step 2: Wire. Step 3: Verify** (cards render bilingual, horizontal scroll works, drag cursor on hover). **Step 4: Commit** `feat(marketing): game-library catalog carousel`.

---

### Task 11: The Night + Oracle (shareable roast card)

**Files:**
- Create: `r2/bloop/apps/marketing/src/mockups/oracle.ts`
- Create: `r2/bloop/apps/marketing/src/sections/night-oracle.ts`
- Modify: `main.ts`

- [ ] **Step 1: Create `src/mockups/oracle.ts`** — the shareable superlative card (crown, "oracle of the night", 4 deadpan superlatives, group, "play at bloop.app" nudge). Built with `el()`, ink-on-cream, coral accents, `--pop`.

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';

export function oracleCard(locale: Locale): HTMLElement {
  const supers = [['the anchor','merci de ta participation. sincèrement.'],
                  ['free fall','le trône était chaud. bref.'],
                  ['the comeback','personne ne t’attendait. erreur.'],
                  ['unbreakable','toujours là. flippant.']];
  return el('div', { class: 'oracle card' },
    el('p', { class: 'overline', 'data-i18n': 'night.oracle' }, t('night.oracle', locale)),
    el('div', { class: 'oracle__crown' }, '👑'),
    el('div', { class: 'oracle__list' }, ...supers.map(([title, sub]) =>
      el('div', { class: 'oracle__row' },
        el('strong', {}, title), el('span', {}, sub)))),
    el('p', { class: 'oracle__nudge' }, 'play at bloop.app'));
}
```

- [ ] **Step 2: Create `night-oracle.ts`** — title `night.title`, copy on one-night-not-one-match, with `oracleCard()` as the focal artifact, `[data-reveal]`.

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { oracleCard } from '../mockups/oracle';

export function buildNight(root: HTMLElement, locale: Locale): void {
  root.classList.add('night');
  root.append(
    el('h2', { class: 'h1', 'data-i18n': 'night.title' }, t('night.title', locale)),
    el('div', { 'data-reveal': '' }, oracleCard(locale)));
}
```

CSS:
```css
.night{text-align:center}
.oracle{max-width:420px;margin:var(--s5) auto 0;text-align:left}
.oracle__crown{font-size:40px;text-align:center;margin:var(--s2) 0}
.oracle__list{display:grid;gap:var(--s2)}
.oracle__row{display:grid;gap:2px;padding:var(--s2);border-radius:var(--r-md);background:var(--cream)}
.oracle__row strong{font-family:var(--font-display)}
.oracle__row span{opacity:.7;font-size:15px}
.oracle__nudge{text-align:center;margin-top:var(--s3);color:var(--coral);font-weight:700}
```

- [ ] **Step 3: Wire. Step 4: Verify. Step 5: Commit** `feat(marketing): night + shareable oracle card`.

---

### Task 12: Proof of vibe (reveal / perfect-split)

**Files:**
- Create: `r2/bloop/apps/marketing/src/mockups/reveal-split.ts`
- Create: `r2/bloop/apps/marketing/src/sections/proof.ts`
- Modify: `main.ts`

- [ ] **Step 1: Create `reveal-split.ts`** — the "perfect split" reveal mockup: "the votes are in!", yellow `⚖️ PERFECT SPLIT!` banner, two result rows with coral % bars. `el()`-built.

```ts
import { el } from '../lib/dom';

export function revealSplit(): HTMLElement {
  const rows = [['taste a mystery jam every morning','50%'],
                ['taste a mystery cheese every night','50%']];
  return el('div', { class: 'phone' }, el('div', { class: 'phone__screen' },
    el('h3', { style: 'text-align:center' }, 'the votes are in!'),
    el('div', { class: 'split-banner' }, '⚖️ perfect split!'),
    ...rows.map(([label, p]) => el('div', { class: 'res' },
      el('span', {}, label), el('span', { class: 'res__bar', style: `--p:${p}` }),
      el('span', { class: 'res__pct' }, p)))));
}
```

- [ ] **Step 2: Create `proof.ts`** — title `proof.title`, the reveal mockup, short on-brand caption. `[data-reveal]`, scroll-velocity skew optional.

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { revealSplit } from '../mockups/reveal-split';

export function buildProof(root: HTMLElement, locale: Locale): void {
  root.append(
    el('h2', { class: 'h1', 'data-i18n': 'proof.title' }, t('proof.title', locale)),
    el('div', { class: 'proof__wrap', 'data-reveal': '' }, revealSplit()));
}
```

CSS:
```css
.proof__wrap{display:flex;justify-content:center;margin-top:var(--s5)}
.split-banner{background:var(--yellow);border-radius:var(--r-pill);box-shadow:var(--pop);
  text-align:center;padding:var(--s2);font-family:var(--font-display);font-weight:700}
.res{display:grid;grid-template-columns:1fr auto;align-items:center;gap:var(--s2);position:relative}
.res__bar{grid-column:1/-1;height:10px;background:var(--coral);width:var(--p);border-radius:var(--r-pill)}
.res__pct{font-family:var(--font-display);font-weight:700}
```

- [ ] **Step 3: Wire. Step 4: Verify. Step 5: Commit** `feat(marketing): proof-of-vibe reveal mockup`.

---

### Task 13: Funny-never-cruel (trust & safety)

**Files:**
- Create: `r2/bloop/apps/marketing/src/sections/safety.ts`
- Modify: `main.ts`

- [ ] **Step 1: Create `safety.ts`** — title `safety.title`, body `safety.body`, four short pill-chips: anonyme / signalement / accessible / 18+ porte d’âge. `[data-reveal]`.

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';

export function buildSafety(root: HTMLElement, locale: Locale): void {
  const chips = locale === 'fr'
    ? ['anonyme', 'signalement intégré', 'accessible (WCAG-AA)', '18+ derrière une porte d’âge']
    : ['anonymous', 'report built in', 'accessible (WCAG-AA)', '18+ behind an age gate'];
  root.append(
    el('h2', { class: 'h1', 'data-i18n': 'safety.title' }, t('safety.title', locale)),
    el('p', { class: 'safety__body', 'data-i18n': 'safety.body' }, t('safety.body', locale)),
    el('div', { class: 'safety__chips', 'data-reveal': '' },
      ...chips.map((c) => el('span', { class: 'safety__chip' }, c))));
}
```

CSS:
```css
.safety__body{max-width:46ch;opacity:.85;margin:var(--s3) 0 var(--s4)}
.safety__chips{display:flex;flex-wrap:wrap;gap:var(--s2)}
.safety__chip{background:var(--white);border-radius:var(--r-pill);box-shadow:var(--pop);
  padding:10px 18px;font-weight:500}
```

Note: `safety.body` differs FR/EN; the chips are locale-built here, so add a `localechange` listener in `main.ts` (Task 15 wires a global rebuild — see there) OR re-render chips on locale change. For now chips read the initial locale; full re-render handled in Task 15.

- [ ] **Step 2: Wire. Step 3: Verify. Step 4: Commit** `feat(marketing): funny-never-cruel safety section`.

---

### Task 14: Get-bloop (download / store badges)

**Files:**
- Create: `r2/bloop/apps/marketing/src/sections/download.ts`
- Create: `r2/bloop/apps/marketing/src/content/links.ts`
- Modify: `main.ts`

- [ ] **Step 1: Create `src/content/links.ts`** — single source of truth for store URLs, clearly marked placeholder until real ones land (spec §10 dep 1):

```ts
// TODO(real-links): replace with live store URLs when provided. Marked placeholder in UI until then.
export const STORE = {
  appStore: { url: '#app-store-coming', placeholder: true },
  googlePlay: { url: '#google-play-coming', placeholder: true },
} as const;
```

- [ ] **Step 2: Create `download.ts`** — title `download.title`, two store badges (App Store + Google Play) using `STORE`; when `placeholder`, append a small `soon` tag and `aria-disabled`. QR block (static placeholder square until a real deep-link exists).

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';
import { STORE } from '../content/links';

function badge(label: string, href: string, placeholder: boolean): HTMLElement {
  const a = el('a', { class: 'badge', href, 'data-cursor': 'go' }, label);
  if (placeholder) { a.classList.add('badge--soon'); a.setAttribute('aria-disabled', 'true'); }
  return a;
}

export function buildDownload(root: HTMLElement, locale: Locale): void {
  root.classList.add('section--full', 'download');
  root.append(
    el('h2', { class: 'h-display', 'data-i18n': 'download.title' }, t('download.title', locale)),
    el('div', { class: 'download__badges' },
      badge('App Store', STORE.appStore.url, STORE.appStore.placeholder),
      badge('Google Play', STORE.googlePlay.url, STORE.googlePlay.placeholder)),
    el('div', { class: 'qr', 'aria-hidden': 'true' }));
}
```

CSS:
```css
.download{text-align:center}
.download__badges{display:flex;gap:var(--s3);justify-content:center;margin:var(--s5) 0}
.badge{background:var(--ink);color:var(--cream);padding:16px 28px;border-radius:var(--r-pill);
  box-shadow:var(--pop);font-weight:700}
.badge--soon{opacity:.5;position:relative}
.badge--soon::after{content:'soon';position:absolute;top:-10px;right:-6px;background:var(--coral);
  color:#fff;font:700 10px/1 var(--font-body);padding:4px 6px;border-radius:var(--r-pill)}
.qr{width:120px;height:120px;margin:0 auto;border-radius:var(--r-lg);
  background:repeating-conic-gradient(var(--ink) 0 25%, var(--cream) 0 50%) 0/24px 24px}
```

- [ ] **Step 3: Wire. Step 4: Verify** (badges show "soon" tags while placeholder). **Step 5: Commit** `feat(marketing): get-bloop download section (placeholder store links)`.

---

### Task 15: Footer + preloader + global locale re-render

**Files:**
- Create: `r2/bloop/apps/marketing/src/sections/footer.ts`
- Create: `r2/bloop/apps/marketing/src/sections/preloader.ts`
- Modify: `main.ts` (mount preloader, footer, and a single `renderSections(locale)` used on locale change)

- [ ] **Step 1: Create `footer.ts`** — wordmark, FR/EN toggle (reuse nav handler via `localechange`), privacy link, `footer.tag`.

```ts
import { el } from '../lib/dom';
import { t, type Locale } from '../lib/i18n';

export function buildFooter(root: HTMLElement, locale: Locale): void {
  root.classList.add('footer');
  root.append(
    el('div', { class: 'nav__logo' }, 'bloop', el('span', { class: 'nav__dot' }, '.')),
    el('a', { href: '#', class: 'footer__link', 'data-i18n': 'footer.privacy' }, t('footer.privacy', locale)),
    el('p', { class: 'footer__tag', 'data-i18n': 'footer.tag' }, t('footer.tag', locale)));
}
```

- [ ] **Step 2: Create `preloader.ts`** — fixed overlay: `bloop.` + % counter 0→100 over ~1.8s, then the coral dot "drops" and the overlay wipes up; respects reduced-motion (instant).

```ts
import { el } from '../lib/dom';
import gsap from 'gsap';
import { prefersReducedMotion } from '../lib/scroll';

export function runPreloader(onDone: () => void): void {
  const pct = el('span', { class: 'pre__pct' }, '0');
  const overlay = el('div', { class: 'pre' },
    el('div', { class: 'pre__logo' }, 'bloop', el('span', { class: 'nav__dot' }, '.')), pct);
  document.body.appendChild(overlay);
  if (prefersReducedMotion()) { overlay.remove(); onDone(); return; }
  const o = { v: 0 };
  gsap.to(o, { v: 100, duration: 1.8, ease: 'power2.inOut',
    onUpdate: () => (pct.textContent = String(Math.round(o.v))),
    onComplete: () => gsap.to(overlay, { yPercent: -100, duration: 0.6, ease: 'power4.inOut',
      onComplete: () => { overlay.remove(); onDone(); } }) });
}
```

CSS:
```css
.pre{position:fixed;inset:0;z-index:10001;background:var(--cream);display:grid;place-items:center;gap:var(--s3)}
.pre__logo{font-family:var(--font-display);font-weight:700;font-size:64px}
.pre__pct{font-family:var(--font-display);font-weight:600;font-size:24px;color:var(--coral)}
.footer{display:grid;gap:var(--s2);text-align:center}
.footer__tag{opacity:.6;font-size:14px}
```

- [ ] **Step 3: Refactor `main.ts`** to centralize section building so a locale switch fully re-renders locale-built sections (fixes Task 13 chip note):

```ts
import { buildHero } from './sections/hero';
import { buildThesis } from './sections/thesis';
import { buildHow } from './sections/how-it-works';
import { buildEveryPhone } from './sections/every-phone';
import { buildLibrary } from './sections/library';
import { buildNight } from './sections/night-oracle';
import { buildProof } from './sections/proof';
import { buildSafety } from './sections/safety';
import { buildDownload } from './sections/download';
import { buildFooter } from './sections/footer';
import { runPreloader } from './sections/preloader';
import { magnetize } from './lib/magnetic';
import { revealOnScroll } from './lib/scroll';

const BUILDERS: Record<string, (r: HTMLElement, l: Locale) => void> = {
  hero: buildHero, thesis: buildThesis, how: buildHow, phone: buildEveryPhone,
  library: buildLibrary, night: buildNight, proof: buildProof, safety: buildSafety,
  download: buildDownload, footer: buildFooter,
};

function renderSections(locale: Locale) {
  for (const [id, build] of Object.entries(BUILDERS)) {
    const sec = document.getElementById(id)!;
    sec.innerHTML = ''; sec.className = 'section';
    build(sec, locale);
  }
  document.querySelectorAll<HTMLElement>('.section').forEach(revealOnScroll);
  document.querySelectorAll<HTMLElement>('.btn,.badge').forEach((b) => magnetize(b));
}
```

Wire `renderSections(locale)` into `main()`, call `runPreloader(() => initSmoothScroll())`, and on `localechange` call `renderSections(e.detail)`.

- [ ] **Step 4: Verify** — full page renders top-to-bottom; preloader plays once; EN toggle re-renders every section (incl. safety chips) in English. Playwright MCP screenshot of full page; `browser_console_messages` clean.

- [ ] **Step 5: Commit** `feat(marketing): preloader, footer, locale-aware full re-render`.

---

## Phase C — The liquid bloop (WebGL signature)

### Task 16: Metaball math + WebGL support detection (unit-tested)

**Files:**
- Create: `r2/bloop/apps/marketing/src/math/metaball.ts`
- Create: `r2/bloop/apps/marketing/src/webgl/fallback.ts`
- Create: `r2/bloop/apps/marketing/test/metaball.test.ts`

- [ ] **Step 1: Write `test/metaball.test.ts` (failing)**

```ts
import { describe, it, expect } from 'vitest';
import { smin, blobSchedule } from '../src/math/metaball';

describe('metaball math', () => {
  it('smin blends below both inputs near the seam', () => {
    expect(smin(1, 1, 0.5)).toBeLessThan(1);
    expect(smin(0, 5, 0.5)).toBeCloseTo(0, 1);
  });
  it('schedules one droplet per library card at increasing scroll', () => {
    const s = blobSchedule(5);
    expect(s).toHaveLength(5);
    expect(s.every((d, i) => i === 0 || d.at > s[i - 1].at)).toBe(true);
    expect(s.every((d) => d.at >= 0 && d.at <= 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `pnpm --filter @bloop/marketing test` → FAIL (module missing).

- [ ] **Step 3: Create `src/math/metaball.ts`**

```ts
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

export interface Droplet { index: number; at: number }
/** Evenly spread N droplet emissions across the mid-scroll band [0.35, 0.85]. */
export function blobSchedule(n: number): Droplet[] {
  const lo = 0.35, hi = 0.85;
  return Array.from({ length: n }, (_, i) => ({ index: i, at: lo + ((hi - lo) * i) / Math.max(1, n - 1) }));
}
```

- [ ] **Step 4: Create `src/webgl/fallback.ts`**

```ts
import { prefersReducedMotion } from '../lib/scroll';

export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
export function shouldRenderBlob(): boolean {
  return webglSupported() && !prefersReducedMotion() && !matchMedia('(pointer: coarse)').matches;
}
```

- [ ] **Step 5: Run tests, verify pass.** **Step 6: Commit** `feat(marketing): metaball math + webgl support detection (tested)`.

---

### Task 17: Metaball shaders + scene controller

**Files:**
- Create: `r2/bloop/apps/marketing/src/webgl/shaders/fullscreen.vert`
- Create: `r2/bloop/apps/marketing/src/webgl/shaders/metaball.frag`
- Create: `r2/bloop/apps/marketing/src/webgl/bloop.ts`
- Create: `r2/bloop/apps/marketing/src/types/glsl.d.ts`

- [ ] **Step 1: Create `src/types/glsl.d.ts`**

```ts
declare module '*.vert' { const s: string; export default s; }
declare module '*.frag' { const s: string; export default s; }
```

Update `vite.config.ts` to load these as strings — add `import glsl from 'vite-plugin-glsl'`? No: keep it dependency-free using `?raw`. So instead import shaders with `?raw` in `bloop.ts` (see Step 4) and skip the `.d.ts` for default import. Replace `glsl.d.ts` with:
```ts
declare module '*.vert?raw' { const s: string; export default s; }
declare module '*.frag?raw' { const s: string; export default s; }
```

- [ ] **Step 2: Create `fullscreen.vert`**

```glsl
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
```

- [ ] **Step 3: Create `metaball.frag`** (raymarched SDF, smin blend, coral clay material, cursor blob)

```glsl
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uMouse;       // -1..1
uniform float uBlobCount;  // 0..8
uniform vec3 uBlobs[8];    // xy position (-1.5..1.5), z = radius

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}
float map(vec3 p){
  float d = 1e5;
  for(int i=0;i<8;i++){
    if(float(i) >= uBlobCount) break;
    vec3 b = uBlobs[i];
    d = smin(d, length(p - vec3(b.xy, 0.0)) - b.z, 0.35);
  }
  d = smin(d, length(p - vec3(uMouse*1.2, 0.0)) - 0.16, 0.4);
  return d;
}
vec3 nrm(vec3 p){ vec2 e=vec2(0.0015,0.0);
  return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),
                        map(p+e.yxy)-map(p-e.yxy),
                        map(p+e.yyx)-map(p-e.yyx))); }
void main(){
  vec2 uv = vUv*2.0-1.0; uv.x *= uResolution.x/uResolution.y;
  vec3 ro = vec3(0.0,0.0,3.0);
  vec3 rd = normalize(vec3(uv, -2.2));
  float t=0.0; bool hit=false;
  for(int i=0;i<72;i++){
    float d = map(ro+rd*t);
    if(d<0.001){ hit=true; break; }
    if(t>6.0) break;
    t += d*0.9;
  }
  vec3 cream = vec3(0.984,0.965,0.925);
  vec4 col = vec4(cream, 0.0);             // transparent where no blob (canvas sits over cream)
  if(hit){
    vec3 p = ro+rd*t; vec3 n = nrm(p);
    float diff = clamp(dot(n, normalize(vec3(0.4,0.7,0.8))), 0.0, 1.0);
    float ao = clamp(map(p+n*0.2)/0.2, 0.0, 1.0);
    vec3 coral = vec3(1.0,0.435,0.380), coralDark = vec3(0.909,0.364,0.314);
    vec3 c = mix(coralDark, coral, diff) * (0.6+0.4*ao);
    float rim = pow(1.0-clamp(dot(n,-rd),0.0,1.0), 2.0);
    c += rim*0.15*coral;
    col = vec4(c, 1.0);
  }
  gl_FragColor = col;
}
```

- [ ] **Step 4: Create `src/webgl/bloop.ts`** (Three.js controller; transparent canvas over the page; exposes `setMouse`, `setBlobs`, `dispose`)

```ts
import * as THREE from 'three';
import vert from './shaders/fullscreen.vert?raw';
import frag from './shaders/metaball.frag?raw';

export interface Blob { x: number; y: number; r: number }

export class BloopScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.Camera();
  private mat: THREE.ShaderMaterial;
  private mouse = new THREE.Vector2(0, 0);
  private targetMouse = new THREE.Vector2(0, 0);
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.resize();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true,
      uniforms: {
        uResolution: { value: new THREE.Vector2() },
        uTime: { value: 0 }, uMouse: { value: this.mouse },
        uBlobCount: { value: 1 },
        uBlobs: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, 0, 0)) },
      },
    });
    this.mat.uniforms.uBlobs.value[0].set(0, 0, 0.55);
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    addEventListener('resize', this.resize);
    addEventListener('mousemove', (e) =>
      this.targetMouse.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)));
    this.loop(0);
  }
  private resize = () => {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.mat?.uniforms.uResolution.value.set(innerWidth, innerHeight);
  };
  setBlobs(blobs: Blob[]) {
    const arr = this.mat.uniforms.uBlobs.value as THREE.Vector3[];
    blobs.slice(0, 8).forEach((b, i) => arr[i].set(b.x, b.y, b.r));
    this.mat.uniforms.uBlobCount.value = Math.min(blobs.length, 8);
  }
  private loop = (ms: number) => {
    this.mouse.lerp(this.targetMouse, 0.08);
    this.mat.uniforms.uTime.value = ms / 1000;
    this.renderer.render(this.scene, this.cam);
    this.raf = requestAnimationFrame(this.loop);
  };
  dispose() { cancelAnimationFrame(this.raf); this.renderer.dispose(); }
}
```

- [ ] **Step 5: Verify typecheck + build.** `pnpm --filter @bloop/marketing typecheck && pnpm --filter @bloop/marketing build` → exit 0.

- [ ] **Step 6: Commit** `feat(marketing): raymarched metaball shaders + Three.js controller`.

---

### Task 18: Mount the blob + scroll choreography + droplet handoff

**Files:**
- Create: `r2/bloop/apps/marketing/src/webgl/droplets.ts`
- Modify: `r2/bloop/apps/marketing/src/main.ts`
- Modify: `r2/bloop/apps/marketing/src/styles/base.css` (canvas layer)

- [ ] **Step 1: Add the canvas layer CSS to `base.css`**

```css
#bloop-canvas{position:fixed;inset:0;z-index:1;pointer-events:none}
#app{position:relative;z-index:2}
.nav,.cursor,.pre{z-index:9000}
```

(Sections have `--cream` backgrounds where they must occlude the blob; the thesis/hero are transparent so the blob shows through. Add `background:var(--cream)` to `.how, .library, .safety, .download, .footer` blocks in `sections.css`, leaving `.hero` and `.thesis` transparent.)

- [ ] **Step 2: Create `src/webgl/droplets.ts`** — maps page scroll progress to blob positions + fires droplet handoffs that pop the matching DOM element:

```ts
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { blobSchedule } from '../math/metaball';
import type { BloopScene, Blob } from './bloop';

/** Drive the blob down the page and pop library cards as droplets reach them. */
export function choreograph(scene: BloopScene, cardEls: HTMLElement[]): void {
  const schedule = blobSchedule(cardEls.length);
  const main: Blob = { x: 0, y: 0, r: 0.55 };

  ScrollTrigger.create({
    trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      main.y = 0.6 - p * 1.4;                 // travels top→bottom
      main.x = Math.sin(p * Math.PI * 3) * 0.4; // weaves
      scene.setBlobs([main]);
    },
  });

  schedule.forEach((d, i) => {
    const card = cardEls[i];
    gsap.set(card, { scale: 0.6, opacity: 0 });
    ScrollTrigger.create({
      trigger: card, start: 'top 85%', once: true,
      onEnter: () => gsap.to(card, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' }),
    });
  });
}
```

- [ ] **Step 3: Wire into `main.ts`** — after sections render, if `shouldRenderBlob()` lazy-load Three.js + the scene and choreograph the library cards:

```ts
import { shouldRenderBlob } from './webgl/fallback';

async function mountBlob() {
  if (!shouldRenderBlob()) return;           // fallback path: no canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'bloop-canvas'; canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const [{ BloopScene }, { choreograph }] = await Promise.all([
    import('./webgl/bloop'), import('./webgl/droplets'),
  ]);
  const scene = new BloopScene(canvas);
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.lib__card'));
  choreograph(scene, cards);
}
```

Call `mountBlob()` at the end of `main()` (after `renderSections`), and re-run card wiring after a locale re-render is fine because library cards persist structurally.

- [ ] **Step 4: Verify** — desktop: a coral blob follows the cursor and travels down-page through the hero/thesis; library cards pop in as you reach them; 60fps in devtools. Use Playwright MCP `browser_navigate`, scroll via `browser_evaluate('window.scrollTo(0, 2000)')`, `browser_take_screenshot`, `browser_console_messages` clean. Verify the `prefers-reduced-motion` path renders NO canvas (emulate reduced motion then reload).

- [ ] **Step 5: Commit** `feat(marketing): mount liquid-bloop + scroll choreography + droplet handoff`.

---

### Task 19: Fallback hero shape (no-WebGL / reduced-motion / mobile)

**Files:**
- Modify: `r2/bloop/apps/marketing/src/sections/hero.ts`
- Create: `r2/bloop/apps/marketing/src/assets/blob.svg`

- [ ] **Step 1: Create `src/assets/blob.svg`** — a static coral organic blob shape (single path, `fill:#FF6F61`), ~600×600 viewBox.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" aria-hidden="true">
  <path fill="#FF6F61" d="M300 60c90 0 170 50 205 130s20 180-50 240-180 80-265 45S60 380 70 285 120 110 210 75c30-10 60-15 90-15Z"/>
</svg>
```

- [ ] **Step 2: In `hero.ts`,** when `!shouldRenderBlob()`, append the static SVG blob behind the headline so the hero never looks empty:

```ts
import { shouldRenderBlob } from '../webgl/fallback';
import blobUrl from '../assets/blob.svg';
// …inside buildHero, after appending content:
if (!shouldRenderBlob()) {
  const img = el('img', { class: 'hero__blob', src: blobUrl, alt: '', 'aria-hidden': 'true' });
  root.prepend(img);
}
```

CSS:
```css
.hero__blob{position:absolute;right:-4%;top:14%;width:min(46vw,520px);z-index:-1;
  opacity:.9;animation:float 6s ease-in-out infinite}
@keyframes float{50%{transform:translateY(-18px)}}
@media (prefers-reduced-motion: reduce){.hero__blob{animation:none}}
```

- [ ] **Step 3: Verify** — emulate reduced-motion (Playwright MCP `browser_evaluate` to set, or DevTools): canvas absent, static coral blob present and content fully legible. **Step 4: Commit** `feat(marketing): static blob fallback for no-webgl/reduced-motion/mobile`.

---

## Phase D — Assets, performance, accessibility, deploy

### Task 20: Logo SVG, favicon, OG card, meta tags

**Files:**
- Create: `r2/bloop/apps/marketing/public/favicon.svg`
- Create: `r2/bloop/apps/marketing/public/og.svg` (then export `og.png` 1200×630)
- Modify: `r2/bloop/apps/marketing/index.html`

- [ ] **Step 1: Create `public/favicon.svg`** — coral dot on cream:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#FBF6EC"/><circle cx="32" cy="40" r="12" fill="#FF6F61"/></svg>
```

- [ ] **Step 2: Create `public/og.svg`** — 1200×630 cream card, `bloop.` wordmark (Fredoka — embed as text; convert to `og.png` for cross-platform via the Bash `rsvg-convert`/`sharp` if available, else keep SVG + a raster fallback). Headline "le jeu qui expose ton groupe". If a rasterizer is unavailable, document that `og.png` must be produced from `og.svg` and reference the SVG meanwhile.

- [ ] **Step 3: Add meta tags to `index.html` `<head>`**

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<meta property="og:type" content="website" />
<meta property="og:title" content="bloop — le jeu qui expose ton groupe" />
<meta property="og:description" content="chaque manche démarre une dispute en 30 secondes. 2–16 joueurs, zéro compte." />
<meta property="og:image" content="/og.png" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

- [ ] **Step 4: Verify** favicon + tags present (`browser_navigate`, check `document.title` + favicon link). **Step 5: Commit** `feat(marketing): logo/favicon/OG assets + meta tags`.

---

### Task 21: Performance pass (lazy chunks, font preload, image dims) + budget check

**Files:**
- Modify: `index.html`, `vite.config.ts`, font import strategy

- [ ] **Step 1:** Confirm Three.js loads as its own chunk. In `vite.config.ts` add manualChunks for `three`:

```ts
build: { target: 'es2020', sourcemap: false, rollupOptions: {
  output: { manualChunks: { three: ['three'] } } } },
```

- [ ] **Step 2:** Preload the two hero fonts (Fredoka 700, DM Sans 400). Add to `<head>` (paths come from the built `@fontsource` assets; use the woff2 the build emits, or `<link rel="preload" as="font">` via a small inline once known). Set `font-display:swap` (already default in @fontsource).

- [ ] **Step 3:** Ensure all `<img>` (blob fallback, any raster) have explicit `width`/`height` to keep CLS < 0.1.

- [ ] **Step 4: Build + measure.** `pnpm --filter @bloop/marketing build` then `pnpm --filter @bloop/marketing preview`. With Playwright MCP open the preview URL and run `browser_evaluate` to read `performance.getEntriesByType('navigation')` and confirm the `three` chunk is a separate request loaded after first paint (check `browser_network_requests`). Record bundle sizes from the build output. Expected: initial JS (excluding three chunk) < ~150KB gz; three chunk lazy.

- [ ] **Step 5: Commit** `perf(marketing): code-split three.js, preload fonts, fix CLS`.

---

### Task 22: Accessibility pass + smoke checks

**Files:**
- Modify: section builders as needed (landmarks, alt, aria), `base.css` (focus)

- [ ] **Step 1:** Audit landmarks/headings: `index.html` has one `<main>`; nav is `<header>`; footer is `<footer>` (change footer section tag/role). Exactly one `<h1>` (hero); all others `<h2>/<h3>`. Skip-link present (Task 5).
- [ ] **Step 2:** Add `aria-label`s: canvas `aria-hidden`, cursor `aria-hidden`, lang toggle `aria-current`, store badges `aria-disabled` while placeholder. Alt text on all images.
- [ ] **Step 3:** Contrast verify (spec §4 note): in `browser_evaluate`, check the hero headline uses ink (not coral) at body sizes; coral only on large display/CTA. Fix any coral-on-cream body text to ink.
- [ ] **Step 4:** Keyboard: Tab order reaches nav → skip-link → CTA → lang → all links; visible focus ring everywhere. Verify with Playwright MCP `browser_press_key('Tab')` repeatedly + `browser_snapshot`.
- [ ] **Step 5:** Reduced-motion end-to-end: emulate; confirm no canvas, no scrubbed pin, content static and complete, timers/labels legible.
- [ ] **Step 6: Commit** `a11y(marketing): landmarks, focus, contrast, reduced-motion, keyboard`.

---

### Task 23: Vercel deploy config + final verification

**Files:**
- Create: `r2/bloop/apps/marketing/vercel.json`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm --filter @bloop/marketing build",
  "outputDirectory": "apps/marketing/dist",
  "installCommand": "pnpm install",
  "framework": null,
  "headers": [
    { "source": "/(.*)", "headers": [{ "key": "X-Content-Type-Options", "value": "nosniff" }] }
  ]
}
```

(If deploying with the project root set to `apps/marketing`, simplify to `buildCommand: "pnpm build"`, `outputDirectory: "dist"`. Document both in a comment in the PR description, not the JSON.)

- [ ] **Step 2: Final full-site verification.** Build + preview; Playwright MCP walkthrough top→bottom: preloader plays, hero animates, blob threads the scroll, thesis pins, library scrolls, mockups are clean (no dev artifacts), download badges show "soon", footer present. FR↔EN toggle re-renders everything. `browser_console_messages` clean across the scroll.
- [ ] **Step 3:** Run the repo's gate from `r2/bloop`: `pnpm --filter @bloop/marketing typecheck && pnpm --filter @bloop/marketing test && pnpm --filter @bloop/marketing build`. All green.
- [ ] **Step 4: Commit** `chore(marketing): vercel static deploy config` and stop. (Deploying to Vercel and swapping real store links are owner actions — surface them, don't perform them unasked.)

---

## Self-Review

**1. Spec coverage**
- Signature liquid bloop → Tasks 16–19 (math, shaders, controller, choreography, fallback). ✔
- 11 sections (preloader→footer) → Tasks 5–15. ✔ (preloader Task 15, hero 6, thesis 7, how 8, phone 9, library 10, night 11, proof 12, safety 13, download 14, footer 15)
- Brand tokens / type / sticker-pop shadow → Task 2 + `sections.css`. ✔
- Motion (Lenis, ScrollTrigger, cursor, magnetic, split-text, reduced-motion) → Tasks 4, 5, 6, 18. ✔
- i18n FR-default + EN toggle, native copy → Task 3 + Task 15 re-render. ✔
- Assets generated (logo/favicon/OG, clean code-built mockups) → Tasks 9, 11, 12, 20. ✔
- Honesty guardrails (placeholder store links, no fake proof, in-person framing) → Task 14 + `links.ts`. ✔
- Performance targets + lazy three → Task 21. ✔
- Accessibility → Task 22. ✔
- Location `apps/marketing`, Vercel deploy → Tasks 1, 23. ✔

**2. Placeholder scan** — `links.ts` carries a `TODO(real-links)` that is an explicit, spec-tracked open dependency (§10), not a plan gap; the `og.png` rasterization caveat in Task 20 has a concrete fallback. No `TBD`/"handle edge cases"/"write tests for the above" without code. ✔

**3. Type consistency** — `t(key, locale)` and `detectLocale(navLang?)` signatures match across Tasks 3/5/6+; `BloopScene.setBlobs(Blob[])` / `Blob {x,y,r}` consistent between Tasks 17 and 18; `blobSchedule(n)`/`smin(a,b,k)` consistent between Tasks 16 and 18; `el(tag, attrs, ...children)` used uniformly; section builder signature `(root, locale)` uniform and registered in `BUILDERS` (Task 15). ✔

No gaps found.
