# bloop — Marketing Website Design

_Spec · 2026-06-14 · Awwwards-level promotional site for the bloop party-game app_

## 0 · Decisions locked (this spec is built on these)

| Decision | Choice |
|---|---|
| Deliverable | Single-page immersive marketing site, production-deployable to Vercel |
| Experience stack | **Vite + TypeScript + Three.js + GSAP/ScrollTrigger + Lenis**, custom CSS (no UI frameworks) |
| Signature moment | **Liquid bloop** — one continuous, faceless coral metaball threading the whole scroll |
| Launch framing / CTA | **Live store links** — App Store + Google Play badges. Real URLs TBD; ship clearly-labelled placeholders and swap in on receipt |
| Public copy edge | **Full transgressive** — the deadpan-instigator voice, the « TOI t'as voté ça ?! » register. Innuendo ceiling for ad/store safety; never explicit |
| Language | **Bilingual, FR default + EN toggle**, locale auto-detect. Copy transcreated natively per locale, never translated |
| Location | New package `r2/bloop/apps/marketing/` (deploys independently; future `bloop.app/j/:code` join page can live here) |

## 1 · What we're building & why

bloop is "Jackbox built for the TikTok-native French + English party": same-room party games where **every phone is the controller *and* the stage** (no shared TV), anonymous-forever (no accounts), ads-only. ~18 game tiles played across a ~45-minute "Night" that ends in a shareable **"Oracle of the Night"** roast card.

The site's job is **download intent**, earned by making a stranger *feel* the product's payoff: the moment the votes land with names attached and someone yells **« TOI t'as voté ça ?! »**. It is not a feature list; it is a descent into one round, ending in the verdict.

**Big Idea — "Receipts."** The room is a courtroom, every phone holds evidence, and bloop is *the instigator* that slides it across the table. Visually: cream-and-ink calm, punctuated by coral sticker-pop bursts — a confession dropped into a quiet room.

### Goals
- A single "stop-and-screenshot" signature moment within the first two scroll-lengths.
- Communicate the only-we's in one breath: no TV, no accounts, in-person, edge-native, one-night-not-one-match.
- Convert to store/CTA without faking proof the product can't yet back.

### Non-goals (out of scope for v1)
- No web-playable game (app is app-only; the site must never imply browser play).
- No blog/CMS, no account/auth, no live backend. Waitlist capture only if store links aren't ready.
- No fabricated social proof (download counts, star ratings) until real numbers exist.
- The `bloop.app/j/:code` join-redirect page is *designed-for* (same package) but not built in v1.

## 2 · The signature: one continuous coral metaball ("liquid bloop")

A single WebGL element persists across the page and transforms on scroll — both the unforgettable moment and the connective thread.

**Brand reconciliation (important):** the Brand Book retires a *character* mascot (a blob with eyes/personality). This is **faceless** — the coral action-colour rendered as a liquid substance, no anthropomorphism. The hook: **the coral `.` in `bloop.` IS the liquid bloop** — it detaches from the wordmark in the hero and becomes the one living, reactive element on an otherwise calm cream-and-ink page. Coral is canonically "the only action colour"; making it the only thing *alive* is the brand's own logic taken literally. It is a motif, not a mascot.

**Render approach**
- Primary: raymarched SDF metaball in a fullscreen fragment shader — smooth-min (`smin`) blended spheres, soft-clay/glossy coral material, in-shader soft shadow + AO. Cursor-attracted (mouse contributes a metaball centre).
- Fallback if raymarch is heavy on mid-range GPUs: Three.js `MarchingCubes` addon for the same gooey-merge read at lower fidelity.
- Coral material derives from `--coral #FF6F61`; specular/clay shading only — never glossy-plastic, never gradient-on-wordmark.

**Scroll choreography (the thread)**
1. Hero — coral dot drips off `bloop.`, forms the blob, idles with a wobble + cursor attraction.
2. Thesis — blob spits a vote-spread; the takeover lands. (Screenshot moment.)
3. How-it-works — blob splits into 3 droplets = 3 steps.
4. Game library — blob "bloops" droplets that hand off (GSAP) to DOM game cards.
5. Night/Oracle — blob coalesces into the roast/crown card.
6. Get bloop — blob settles into the coral app-icon/CTA.

**Fallbacks (first-class, not afterthoughts)**
- `prefers-reduced-motion` → no raymarch, no scroll-spawned motion; static coral hero shape, cards fade/slide in.
- Mobile → redesigned lightweight version (small static or low-amplitude wobble, no cursor coupling, capped DPR), never the full raymarch.
- No-WebGL / context-lost → static SVG coral shape; all content fully functional.

## 3 · Scroll narrative — sections & jobs

| # | Section | Job | Notes |
|---|---|---|---|
| 0 | Preloader | Ceremony, mask asset load | `bloop.` assembles, coral dot drops + liquefies, % counter, 1.5–3s even if loaded |
| 1 | Hero | Land the one-claim + primary CTA | Huge Fredoka headline, eyebrow `2–16 joueurs · zéro compte`, magnetic coral **Get bloop**, blob alive behind |
| 2 | Thesis (pinned, scrubbed) | The « TOI t'as voté ça ?! » takeover | The signature payoff; names land, line slams, on-brand 12-pc confetti |
| 3 | How it works (3 steps) | Kill the "accounts? TV?" friction | Crée un salon → tes potes scannent le code → démarre le chaos. The one place voice explains |
| 4 | Every phone is the stage | The only-we (no TV / anonymous / each phone = controller+stage) | Code-built phone mockups |
| 5 | Game library | Depth & replay; show the range | Horizontal-scroll catalog, real hooks + "inspired by" creator chips, drag cursor, blooped in |
| 6 | The Night + Oracle | One night, not one match; surface the viral artifact | Placement XP, streak, shareable superlative card |
| 7 | Proof of vibe | Sell the feeling (the argument, the eye contact) | Perfect Split banner, podium — cleaned device mockups |
| 8 | Funny, never cruel | Reassure reviewers/parents without going soft | Anonymity, age-gate, report/kick, accessibility — in voice, brief |
| 9 | Get bloop | Convert | App Store + Google Play badges (placeholder→real), QR |
| 10 | Footer | Wrap | FR/EN toggle, privacy, wordmark, "built with chaos · 2026" |

### Copy direction (full-transgressive; display may break the in-app lowercase law for impact, body stays lowercase-deadpan)

- **Hero headline (primary):** FR « le jeu qui expose ton groupe » · EN "the party game that exposes your group"
- **Hero sub:** FR « chaque manche est conçue pour démarrer une dispute en 30 secondes. 2–16 joueurs. zéro compte, rien de stocké sur toi. » · EN "every round is built to start a 30-second argument. 2–16 players. no accounts, nothing stored about you."
- **Thesis line:** « TOI t'as voté ça ?! » (kept in FR in both locales as a signature — EN gets a transcreated echo beneath: "wait — YOU voted that?!")
- **Every-phone:** FR « pas de télé. pas de comptes. chaque téléphone est la manette ET l'écran. » · EN "no TV. no accounts. every phone is the controller AND the screen."
- **CTA:** FR « choper bloop » / EN "get bloop" (label TBD-confirmable; both lowercase)
- **Forbidden everywhere:** Title Case, exclamation hype, "HILARIOUS", coy "something spicy / quelque chose de coquin", the 😂 emoji (the laugh is 💀), `rizz/skibidi/no cap` filler.
- **On-brand seasoning (max one token/line):** "Cheh." · "Red flag." · "Justifie." · "Validé." · "W ou L."

## 4 · Visual system → web tokens

Canonical source: Brand Book v1.0 (supersedes the older blurpleberry/Baloo direction and the in-app cyan bubble glyph — site ships canonical).

```css
:root{
  /* base */
  --ink:#0F1633; --cream:#FBF6EC; --cream-100:#F4EAD5; --white:#FFFFFF;
  /* action — the ONLY primary action colour */
  --coral:#FF6F61; --coral-pressed:#E85D50;
  /* brights (section/category accents only) */
  --yellow:#FFCC4D; --teal:#4ECDC4; --cobalt:#5B7BFF; --lavender:#B6A8FF; --pink:#FF6B9D;
  --yellow-soft:#FFE08A; --lavender-soft:#D6CCFF; --pink-soft:#FFC2D6;
  /* semantic */
  --success:#3DC97A; --danger:#E5503F; --warning:#FDC700;
  /* radius */
  --r-sm:10px; --r-md:14px; --r-lg:22px; --r-xl:28px; --r-pill:999px;
  /* signature depth: hard sticker-pop offset, NO blur */
  --pop:0 4px 0 0 var(--ink);
  --clay:0 6px 0 rgba(15,22,51,.18), 0 10px 18px rgba(15,22,51,.12);
  /* spacing */
  --s1:8px; --s2:12px; --s3:16px; --s4:24px; --s5:32px;
}
```

- **Type:** Fredoka (display/logo, 600/700) · DM Sans (body, 400/500/700) · Caveat (sticker asides only, 600). Web ramp: hero `clamp(48px, 9vw, 132px)` Fredoka 700 with split-text char animation; Display 60 / H1 44 Fredoka 600; body 16–18 DM Sans; overline 11px DM Sans 500 `letter-spacing:1.2px` uppercase; line-height 1.1 headlines / 1.6 body.
- **Texture:** SVG grain over cream (kills digital flatness); halftone/dot-grid as *accent only*; scroll-driven background tint between sections; **never** texture or gradient on the wordmark.
- **Components:** full-pill buttons (coral fill / white label / `--pop`), large rounded cards (`--r-lg`/`--r-xl`) with `--pop` or `--clay`. Flat bright fills, never glossy.
- **Contrast note to verify in build:** coral-on-cream for large display type must clear WCAG-AA large (3:1); body text uses ink-on-cream/white. Where coral fails on body sizes, fall back to ink.

## 5 · Motion & interaction

- **Lenis** smooth scroll, easing `(t)=>Math.min(1,1.001-Math.pow(2,-10*t))`, duration ~1.2s; `lenis.on('scroll', ScrollTrigger.update)`; `scroll-behavior:auto` in CSS.
- **GSAP ScrollTrigger:** every section a scroll-triggered entrance (`start:"top 80%"`, `power3.out`, 80–120ms stagger); thesis section **pinned + scrubbed**; scroll-velocity skew on media; counters animate on entry.
- **Custom cursor:** lerp-delay dot; scales/morphs to "vote" / "drag" over interactive elements; hidden under `prefers-reduced-motion` and on touch (native).
- **Magnetic CTAs:** coral buttons drift toward cursor within ~80px.
- **FR/EN swap:** View Transitions API (graceful fallback to a coral wipe).
- **Discipline:** animate only `transform`/`opacity`; full `prefers-reduced-motion` path disables parallax/scrub/cursor/blob-motion while keeping content and timers legible.

## 6 · Assets (none exist clean today — we generate them)

- **`bloop.` logo** — SVG wordmark (Fredoka) + coral dot; mono/dark/on-color variants; favicon; app-icon export; OG/social card (1200×630). The dot is the metaball seed.
- **App-screen mockups rebuilt in HTML/CSS** with the real tokens — pixel-faithful, crisp at any res, animatable, and **free of dev artifacts** (no "Add bot (dev)", "0 pts", "Bot 1/2", "???" avatars, OS status bar). Realistic names/avatars. Screens to rebuild: Home, Lobby (room code + squad), Reveal/Perfect-Split, Oracle/podium. Raw screenshots used only as reference/where a rebuild isn't worth it.
- **Textures:** grain + halftone as inline SVG/CSS.
- **Deliberately excluded:** AI/stock lifestyle photography — the brand is type-driven and no-mascot; faked people-shots cheapen it. Bloom-generated brand art can be added later if desired.

## 7 · i18n

- Tiny JSON dictionaries `content/fr.json` + `content/en.json`; `lib/i18n.ts` auto-detects `navigator.language` (FR default), persists choice, visible FR/EN toggle in nav + footer.
- Copy authored **natively per locale** (FR elision/spoken cadence; EN lowercase texting register, lightly UK-neutral). Both locales carry the full-transgressive register. The « TOI t'as voté ça ?! » signature stays FR in both, with an EN echo.
- `<html lang>` updated on switch; OG/meta per default locale.

## 8 · Tech architecture & file layout

```
r2/bloop/apps/marketing/
  index.html · package.json · vite.config.ts · tsconfig.json · vercel.json
  public/            fonts (woff2 subsets), og image, favicon, raster fallbacks
  src/
    main.ts
    styles/          tokens.css · base.css · sections/*.css
    lib/             lenis.ts · scroll.ts · cursor.ts · magnetic.ts · splitText.ts · i18n.ts
    webgl/           bloop.ts (scene controller) · droplets.ts (pinch-off→DOM handoff)
                     fallback.ts · shaders/metaball.frag · shaders/fullscreen.vert
    sections/        preloader · hero · thesis · how-it-works · every-phone · library
                     night-oracle · proof · safety · download · footer  (.ts each)
    mockups/         home · lobby · reveal-perfect-split · oracle  (.ts, code-built screens)
    content/         fr.json · en.json · games.ts (catalog: name FR/EN, hook, accent, creator)
    assets/          logo.svg · grain.svg
```

- Keep files focused/<500 lines; the WebGL controller, scroll controller, and i18n are independent units with clear interfaces.
- **Performance budget:** initial route JS < ~150KB gz before WebGL; **lazy-load Three.js + the blob on idle/after first paint** (`import()`); fonts preloaded woff2 subsets + `font-display:swap`; all raster assets WebP/AVIF with explicit `width`/`height`.
- **Targets:** LCP < 2.5s, CLS < 0.1, 60fps desktop during animation, 45+fps mid-range mobile.
- **Deploy:** static build, Vercel. `vercel.json`/config minimal; no server runtime needed.

## 9 · Accessibility & honesty guardrails

- WCAG-AA contrast (verified in build), full keyboard nav + visible focus, semantic heading hierarchy + landmarks, skip-to-content link, ARIA labels on custom cursor / canvas / toggle, alt text on all media.
- `prefers-reduced-motion` honored end-to-end.
- **Honesty:** no fabricated metrics; store badges marked placeholder until real URLs land; "in-person / same-room" framing only (no "play anywhere"); privacy line is "no accounts, nothing stored about you on our servers" (not "no data collection," since ad SDK collects device signals once wired).

## 10 · Open dependencies (non-blocking; tracked)

1. **Real App Store + Google Play URLs** — until provided, placeholders labelled in code.
2. **Final CTA label** — `choper bloop` / `get bloop` assumed; confirmable.
3. **Creator-credit chips** ("inspired by Squeezie / McFly & Carlito / Théo Delemazure") — assumed cleared for public marketing; if rights aren't cleared, they stay generic ("inspired by the internet").
4. **Domain** — `bloop.app` assumed; affects canonical/OG URLs only.
5. **18+ spicy tier** — surfaced as a single age-gated mention in §8, never a banner.

## 11 · Success criteria

- A first-time visitor reaches the thesis moment and *wants to screenshot it*.
- The only-we (no TV / no accounts / in-person / edge-native) is unmissable.
- Lighthouse: performance & accessibility both strong; perf hard targets met.
- Zero brand violations: canonical palette, Fredoka/DM Sans, lowercase-deadpan body, faceless coral motif, no fabricated proof.
- Deploys to Vercel from `apps/marketing` with one command.
