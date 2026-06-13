# L'Échappée — Marketing Website (Design Spec)

_2026-06-14 · single-page, awwwards-grade marketing site for the L'Échappée mobile app._

## 1. Goal & constraints

- **Primary goal:** drive **App Store / Google Play downloads** (app is live in both stores).
- **Format:** single scroll-driven landing page, French language.
- **Motion register:** full maximalist (awwwards checklist) — Lenis smooth-scroll, GSAP
  ScrollTrigger scrub/pin, split-text, magnetic CTAs, custom cursor, velocity skew.
- **Brand is sacred where it counts:** colors and typography come straight from
  `DESIGN_SYSTEM_ECHAPPEE.md`. We push *motion* hard but never the palette or voice.
- **Isolation:** lives in `r3/routecore/web/`. Does NOT touch the Flutter app, `core/`,
  `shared/`, or any product module.

## 2. Big idea

**"Le détour est la destination."** The page is a route the visitor scrolls *along* —
top = grey motorway, bottom = a golden breathing back-road. The scroll IS the journey.

## 3. Brand tokens (from DESIGN_SYSTEM_ECHAPPEE.md)

| Token | Hex | Use |
|---|---|---|
| Clay Red (primary) | `#D95F45` | CTA, active route, accent |
| Warm Cream (bg) | `#FFF7EA` | dominant background |
| Soft White (surface) | `#FFFCF5` | cards, panels |
| Deep Brown (text) | `#2B211C` | headlines, body |
| Stone Taupe | `#8A7C70` | secondary text, direct route |
| Olive (nature) | `#6F7F45` | producteurs, verified |
| Soft Gold (accent) | `#D9A441` | haltes, badges, "coup de cœur" |
| Mist Blue | `#7EA8A4` | map, water, alt routes |

- **Fonts:** Fraunces (serif, emotion — display/headlines) + Inter (sans, clarity — UI/body),
  loaded via `next/font/google` (both OFL). Mono accent for eyebrows: Inter w/ letter-spacing,
  or `Space Grotesk` for labels only.
- **Never** pure `#fff`/`#000`. Add a subtle SVG grain overlay on backgrounds.
- **Hero headline:** `clamp(40px, 9vw, 130px)`, Fraunces, fills viewport width.

## 4. Section map (single scroll)

1. **Preloader** — Clay Red route line draws on cream + % counter (~2s ceremony), then
   staggered reveal of hero. Respects `prefers-reduced-motion` (instant on, no draw).
2. **Hero** — full-viewport. Fraunces split-text headline "Le GPS des routes qui
   respirent.", kinetic entrance, custom lerp cursor, floating app mockup with subtle
   tilt, one `mix-blend-mode: difference` accent word. Magnetic primary CTA → stores.
3. **Manifeste** — "Le plus court n'est pas toujours le plus beau." Scroll-reveal lines,
   background transitions Warm Cream → deeper warm (`#F3E4CE`-ish) as you scroll in.
4. **Signature pinned map** — pinned full-screen section. Scroll-scrubbed: the L'Échappée
   route draws Lyon→Vienne across a stylized SVG map of France; golden haltes bloom along
   it; the "Combien de temps veux-tu t'offrir? — 10 / 25 / 45 min" detour selector
   animates the curve. The screenshot moment.
5. **Comment ça marche** — horizontal-scroll gallery (pinned vertical→horizontal) of 3–4
   app-screen mockups: "Où vas-tu ?" → choix du détour → "On a trouvé 4 haltes" → la route.
6. **Les haltes** — overlapping category cards (Producteurs, Marchés, Villages, Points de
   vue, Bonnes tables) with magnetic + scale hover, category-colored.
7. **Les chiffres** — animated counters on scroll-entry: 560+ haltes, horaires réels,
   péages réels France, etc. (final numbers confirmed at copy pass).
8. **Download CTA** — oversized magnetic App Store + Google Play badges on a Clay Red or
   gold field. The conversion climax.
9. **Footer** — minimal: brand line "Le GPS des routes qui respirent.", nav, legal,
   social.

## 5. Architecture

```
r3/routecore/web/
  app/
    layout.tsx          # fonts, metadata/OG, grain overlay, <Lenis> provider
    page.tsx            # composes the sections in order
    globals.css         # :root tokens, grain, reduced-motion resets
  components/
    Preloader.tsx
    SmoothScroll.tsx    # Lenis + ScrollTrigger sync (client)
    Cursor.tsx          # custom lerp cursor + magnetic hook consumers
    sections/
      Hero.tsx
      Manifeste.tsx
      SignatureMap.tsx  # the pinned scrubbed route — heaviest unit
      HowItWorks.tsx
      Haltes.tsx
      Stats.tsx
      DownloadCTA.tsx
      Footer.tsx
    ui/                 # Magnetic.tsx, SplitText.tsx, Reveal.tsx, StoreBadge.tsx
  lib/
    tokens.ts           # brand colors/spacing mirrored from the design system
    gsap.ts             # registerPlugin, shared eases
  public/
    screens/            # app screenshot mockups (placeholder → real)
    map/france.svg      # stylized map + route path for the signature moment
```

- **Each section is a self-contained client component** that registers its own
  ScrollTrigger(s) in a `useGSAP`/`useLayoutEffect` and cleans them up on unmount.
- `SmoothScroll` owns the single Lenis instance and the `lenis.on('scroll', ScrollTrigger.update)` bridge; sections never instantiate Lenis.
- `Magnetic`, `SplitText`, `Reveal` are reusable primitives so motion is consistent and
  testable in isolation.
- Heavy libs (GSAP) imported in client components only; map SVG inlined for path access.

## 6. Performance & a11y (hard targets)

- Only animate `transform`/`opacity`. LCP < 2.5s, CLS < 0.1, 60fps desktop.
- `next/image` for all raster mockups with explicit dimensions; SVG for map/badges.
- `prefers-reduced-motion`: disable Lenis smoothing, all scrub/pin/parallax, split-text →
  plain text. Each section guards on it.
- Keyboard-navigable, visible focus, skip-to-content, semantic headings, alt text,
  WCAG AA contrast (Deep Brown on Cream passes comfortably).
- Mobile: simplify/disable the pinned scrub map (static drawn route fallback), 44px tap
  targets, no custom cursor on touch.

## 7. Out of scope (first pass)

- No CMS, no i18n beyond French, no blog/multi-page, no analytics wiring (add later),
  no real backend. Waitlist not needed (app is live).

## 8. Open items (resolve at copy/asset pass)

- Real App Store + Play Store URLs.
- Final stat numbers for §7.
- Real app screenshots (drop into `public/screens/`, swap from placeholders).
- Logo SVG (use a Fraunces wordmark as placeholder until provided).
