# 07 — App Skeleton Audit (2026-06-11, ultracode workflow)

> Produced by the two audit agents of workflow `racelab-skeleton-complete` (run wf_9a5c609a). The two P0s (sessions domain, persistent outcome capture) were **built and shipped the same day (D22)**. Everything below is the remaining backlog, ordered by leverage. Statuses: ⬜ open · 🔶 partially addressed.

## P1 — committed V1 features with no skeleton home yet

| Gap | Note |
|---|---|
| 🔶 Learning-loop READ half | OutcomeRecords now persist (D22) with condition snapshots, but `ContextBundle.history` is never populated — the chat doesn't yet *use* past outcomes. Next slice: map active-session + same-track outcomes into `history` when building/updating the bundle. |
| ⬜ Track entity | Engineer's no-session fallback track is hardcoded "My track". Committed: track CRUD (name, GPS, surface, indoor/outdoor, photos, notes). Session start form is the seed — extract a tracks store. |
| ⬜ Weather wiring | No Open-Meteo fetch, no weather in the bundle, no offline backfill (02 §2.3, 04 §2). |
| ⬜ Garage = real garage | Single hardcoded MP11; "Add a car" card is dead UI; no Car entity (name/photo/notes), no multi-car store keys, no template picker. |
| ⬜ Comments on sheets/changes | 02 §2.1 "not optional polish"; V1 DoD includes "apply it, comment it"; `note` fields exist in both packages but have no UI. |
| ⬜ Tires/engine/electronics sheet sections | MP11 template has zero tire/engine/body fields — yet the engineer's fallback is "look at tires". Template data + a Tires section matcher. |
| ⬜ Structured feedback tag chips | `bundle.feedback.tags` only ever set by NLU; no symptom×phase chip UI (04 §2 taxonomy). |
| ⬜ Structured advice card + apply-to-sheet | Recommendations are plain text bubbles; no card UI, no one-tap "apply change to draft" (04 §5). High demo value. |
| ⬜ PDF export entry point | packages/pdf works; the app has no export/share button. |
| ⬜ Sharing pillar | No publish/share-link/import entry points anywhere (02 Pillar 4, D10). |
| ⬜ Auth skeleton | No sign-in, no cached-user-id concept (02 cross-cutting; airplane-mode-48h invariant needs a home). |
| ⬜ Backup/outbox + storage decision | AsyncStorage blobs today; D11 names sqlite + append-only outbox. Decide before the domains multiply. |
| ⬜ i18n wiring | Every string hardcoded EN — D17 explicitly forbids retrofit. Worst-drifting invariant. |
| ⬜ Settings/About screen | Home for account deletion, privacy policy, locale, backup status (D17 compliance in Phase 2). |
| ⬜ Onboarding + skill signal | 04 §2 input 6 has nowhere to be asked/stored. |

## P2 — polish

Version rename/archive UI (op exists in packages/sheets), sheet photos, persistent race-day/practice mode indicator, track-temp input, empty states for garage, Add-a-car affordance.

## Integration-review leftovers (should-fix, not yet applied)

- Two AsyncStorage stores write independently — a kill between writes can leave a dangling `setup_version_id` (mitigated by denormalized `setup_name`); consider `multiSet` ordering.
- Grip chips in no-session mode now update in place (fixed), but a visible race-day/practice mode indicator is still missing.
