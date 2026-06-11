# Wave 2 — Handoff / Resume Note (2026-06-11)

Session paused mid-flight (compute limit). Everything below is committed; this note is the
exact resume map.

## What is DONE and pushed (branch r3)

**Brand Book v1.0 re-theme (Plan 3b)** — tasks 1–4 of `2026-06-11-plan3b-brandbook-retheme.md`:
- Task 1 fonts Fredoka + DM Sans (`dbce8b1`, fix `3536591`)
- Task 2 ink/cream/coral palette (`3e59f4c`)
- Task 3 brand radii + shadow.pop sticker shadows (`edc799a`)
- Task 4 initial-letter avatars on name-hashed discs, emoji picker removed (`ffa72fc`)
- Tier A mobile: 7 files / 43 tests green; `tsc --noEmit` clean.
- Task 5 (catalog) is SUPERSEDED by the wave-2 17-game catalog work below.
- Task 6 (emulator verify) is BLOCKED by a Metro issue — see "Known issue" below.

**Wave 2 — 17 new games (co-founder brief of 2026-06-11)**:
- `docs/designs/wave2-raw/designs.json` — 17/17 COMPLETE structured game designs
  (id, FR/EN names+taglines, template mapping, players, phases+durations, game_config params,
  bilingual content item shape + 3 sample items each, scoring, spicy level, physical level,
  recommendations answering the co-founder's open questions, risks).
- `docs/designs/wave2-raw/videos.json` — 17/17 inspiration-video research results
  (creator, title, platform, url-or-SEARCH-query, approx views, why it matches, rights note)
  for the game-card backgrounds (thumbnail + credit, link out — never embed the video).

## What was IN FLIGHT when stopped (resume these first)

Two background workflows were stopped right before their final synthesis agents. All 34
parallel agents had finished — their results are journaled, so resuming re-runs ONLY the
last agent of each (near-zero cost):

1. Design synthesis (writes `docs/designs/2026-06-11-wave2-17-games-design.md`:
   recap table, per-game sections, template gap analysis, build order in waves,
   reconciliation with existing designs, offline-AI pipeline needs):
   `Workflow({ scriptPath: "C:\\Users\\Admin\\.claude\\projects\\C--Users-Admin-Documents-Hacktaton26-r2-bloop-apps-mobile\\b2e63dca-3065-4e5a-80db-35e6b98d9a20\\workflows\\scripts\\wave2-design-wf_e620a0a7-9d5.js", resumeFromRunId: "wf_e620a0a7-9d5" })`
2. Video compile — its agent got far enough to write
   `docs/designs/2026-06-11-wave2-inspiration-videos.md` (committed) but NOT
   `content/inspiration-videos.json`; resuming re-runs just that step (or derive the JSON
   directly from `wave2-raw/videos.json`):
   `Workflow({ scriptPath: "C:\\Users\\Admin\\.claude\\projects\\C--Users-Admin-Documents-Hacktaton26-r2-bloop-apps-mobile\\b2e63dca-3065-4e5a-80db-35e6b98d9a20\\workflows\\scripts\\wave2-video-research-wf_6a063e87-814.js", resumeFromRunId: "wf_6a063e87-814" })`

Fallback if resume is unavailable: both raw JSONs above contain everything the synthesis
agents need — hand them to a single agent each.

## Remaining pipeline (agreed scope from the co-founder message)

1. Finish the two syntheses (above).
2. Content workflow: per game, author the FR+EN gameplay packs ("hours of gameplay") from
   `contentItemShape` + `sampleItems` in designs.json → `content/packs/<gameId>.json`,
   with a moderation/QA verify stage (funny-never-cruel, spicy tagging, FR/EN parity,
   dedup; for `pires-potes` ORIGINAL texts only — no Amis de merde copy).
3. Implementation waves (per the synthesis build order): wave A = VOTE-template quick wins
   (tu-preferes, gauche-ou-droite are near-free on the tracer/VOTE machinery), then new
   templates, then loup-garou last.
4. New catalog in `apps/mobile/src/games/catalog.ts`: 17 cards, brand palette colors,
   video-thumbnail backgrounds + creator credit from `videos.json` (use YouTube thumbnail
   URLs `https://i.ytimg.com/vi/<id>/hqdefault.jpg`; tap = link out).
5. Emulator screenshots once Metro issue fixed.

## Known issue — Metro red screen (Expo Go) after font swap

`@expo-google-fonts/dm-sans` package index references ALL weights incl.
`DMSans_200ExtraLight.ttf` and Metro (pnpm setup) fails to resolve it:
"Unable to resolve ../200ExtraLight/DMSans_200ExtraLight.ttf from .../dm-sans/index.js".
Fix options (pick one next session):
- Import deep paths instead of the package index in `app/_layout.tsx`:
  `@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf`-style subpath exports
  (check package.json `exports` of dm-sans 0.4.2), same for fredoka; or
- Extend the existing Metro `resolveRequest` shim in `metro.config.cjs` to handle the
  package's internal font paths under pnpm.
Note: Tier A tests + tsc are green; this is a bundler-resolution issue only.
Also: emulator Expo Go auto-updated to SDK 56; SDK 55 client was reinstalled from
`%TEMP%\ExpoGo-55.0.7.apk` (re-download URL via https://api.expo.dev/v2/versions).

## Open design decisions already answered in designs.json

The co-founder's two open questions (devine-la-question hints; devine-l-action help
channels) have firm recommendations inside their entries in `wave2-raw/designs.json`
(`recommendations[]`).
