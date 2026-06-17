# RaceLab — Brand Identity v1 (logo, colour, type)

**Date:** 2026-06-17 · **Branch:** `theo/racelab` · **Status:** approved (visual sign-off via brainstorm), implementing

## 1. Intent

Replace the placeholder identity (stock Expo "Λ" icon on light-blue, a coral `#FF5A26` accent, and a disconnected red-diamond marketing favicon) with one coherent, **premium-motorsport** identity. North star reference world (user-chosen): **premium motorsport / F1** — Brembo, AMG, Akrapovič, F1 teams. Engineered, restrained, "whispers money."

Three rules that define the look (learned the hard way during brainstorm):
1. **Flat colour, never chrome.** Brushed-metal gradients read cheap; premium is flat Ink + flat Red on Carbon.
2. **The wordmark leads**, the mark supports — logotype-first, not a lone letter in a box.
3. **Restraint.** Lots of space, one precise red detail, fine rules. Red is rare.

Name is **RaceLab**. ("GripLab" was only ever a placeholder — drop it. The `griplab://` URL scheme stays as an internal technical identifier, but public "griplab.app" copy in marketing should be cleaned up to RaceLab — tracked as a follow-up, out of scope for this brand pass.)

## 2. Logo system

**Primary mark — the "R" plate badge.** A rounded-square plate: flat **Carbon** fill, a flat **Steel** outline (~1.5–2 px at icon scale) with a 1 px inner bezel hairline for a machined edge, the letter **R** set in **Chakra Petch Bold** (Ink), and a single **Race Red** "sensor" square at the top-right. No gradients, no texture.

**Lockup.** Badge + **RACELAB** set in **Saira SemiBold**, letter-spacing ≈ 0.14em, Ink.
- *Horizontal* (primary): badge left, wordmark right, optical gap ≈ 0.3× badge width.
- *Stacked*: badge centered above wordmark.

**Variants.**
- *Full colour* — Carbon plate / Ink R / Steel outline / Red dot (default).
- *Monochrome* — Ink only (outline, R and dot all Ink), for single-colour contexts.
- *Red-fill alt* — Red plate, Carbon R + dot, for stickers / high-contrast / favicons where the outline would disappear.

**Clear space:** ≥ half the badge height on all sides. **Min size:** badge legible to 24 px (verified in brainstorm at 30 px); below ~20 px use the red-fill alt.

## 3. Colour

Flat palette — no chrome.

| Token | Hex | Role |
|---|---|---|
| Carbon | `#0B0C0E` | App background, icon plate |
| Graphite | `#16181C` | Cards / surfaces |
| Steel | `#5B626C` | Outlines, hairlines, dividers |
| Ink | `#ECEFF2` | Primary text, the mark |
| Sub | `#8A9099` | Secondary text |
| **Race Red** | `#E10600` | **Accent — sparing:** sensor dot, primary CTA, live/REC, new-PB |
| Go | `#3DDC84` | Faster / positive (app semantics) |
| Podium | `#FFD700` | Best lap / medal |

**Usage rule:** Race Red appears on roughly one element per screen. Everything else is Carbon + Ink + Steel. The restraint is the premium.

**Replaces:** accent `#FF5A26` (coral, removed); marketing favicon `#FF2A2A`; Expo adaptive-icon background `#E6F4FE`.

Red is the bright **F1 red `#E10600`** (sign-off default; a deeper `#C8102E` was offered and can be revisited, but bright is locked for v1).

## 4. Typography

- **Chakra Petch** — the mark + display/headings. Squared, technical, race-tech.
- **Saira** — the wordmark (RACELAB) + UI labels / data readouts.
- **Body copy** — system (SF Pro / Roboto) for legibility; brand fonts are for headings/labels/logo. Adopting Chakra/Saira into app UI via `expo-font` is a later, optional step (not required for this brand pass).

## 5. Application — file map

Live worktree: `C:\Users\Admin\Documents\wt-theo-racelab\RaceLab`.

| File | Change |
|---|---|
| `apps/mobile/src/theme.ts` | Palette → the table above (accent coral → Race Red, bg → Carbon, add Steel/Ink mapping) |
| `apps/mobile/app.json` | `adaptiveIcon.backgroundColor` `#E6F4FE` → `#0B0C0E` |
| `apps/mobile/assets/brand/racelab-mark.svg` | **New** — master vector of the mark (source of truth) |
| `apps/mobile/assets/icon.png` | Regenerated — full-bleed Carbon, R + red sensor, inset bezel |
| `apps/mobile/assets/android-icon-foreground.png` | Regenerated — mark in adaptive safe zone, transparent |
| `apps/mobile/assets/android-icon-background.png` | Regenerated — solid Carbon |
| `apps/mobile/assets/android-icon-monochrome.png` | Regenerated — Ink silhouette, transparent (themed icons) |
| `apps/mobile/assets/favicon.png` | Regenerated — mark (red-fill alt for small size) |
| `apps/mobile/assets/splash-icon.png` | Regenerated — mark, transparent, centered |
| `apps/web/assets/favicon.svg` | Replace red diamond → new mark |
| `apps/web/styles/base.css` | `--accent` coral → `#E10600` |

## 6. Asset generation

Master `racelab-mark.svg` is the single source. PNGs are rasterized from a self-contained HTML render of the mark (Chakra Petch loaded via web font) using headless Chromium (Playwright), at the exact pixel sizes Expo expects (1024 icon/foreground/background/monochrome, 48 favicon, 200 splash). No `sharp`/ImageMagick on this host, so Chromium is the rasterizer of record.

## 7. Verification

- `npx tsc --noEmit` clean for the mobile app after `theme.ts` edit.
- Marketing: `npx next build` (or the site's check) green after `base.css` + favicon.
- Visual: every regenerated PNG inspected at size; favicon/adaptive checked for transparency and safe-zone.
- Emulator pass on `bloop_pixel` (per project workflow) is the final eye-gate — proposed as a follow-up once assets land.

## 8. Out of scope / follow-ups

- Clean up public-facing `griplab.app` copy in marketing → RaceLab.
- Optional: adopt Chakra Petch / Saira into in-app UI via `expo-font`.
- Optional: deeper-red `#C8102E` exploration.
- Live emulator verification of the new icon + accent across screens.
