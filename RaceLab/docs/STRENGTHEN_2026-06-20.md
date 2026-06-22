# RaceLab — Strengthening Pass (2026-06-20, D70)

Deep 6-lens adversarial hardening pass (hunt → verify), told to skip the ~30 already-fixed D64/M2/M2b
items and dig for what survived. **26 confirmed in-zone findings (4 P1, 11 P2, 11 P3).** Status: ✅ fixed
this session · 🔒 reserved for William (tuning-direction) · ⏳ in-zone punch-list (deploy-phase / moderate).

## ✅ Fixed + committed this session (7 commits, all suites green, eval 28/28)
- **#4 (P1) determinism:** node-kb now SORTS rule filenames before reading (readdir order is FS-dependent → a non-reproducible bundled rule array). bundle.json byte-unchanged on this FS.
- **#1 (P1) ranking:** retrieval scores each symptom-tag ONCE (best address, not sum) — a rule's phase-enumeration length no longer inflates its relevance (96/417 rules carry >1 same-symptom address). Flips the canonical mid-corner-understeer #1 from front_sway_bar → front_track_width (correct: the cheaper-revert tiebreak now decides the tie); ~12 tests that codified the old inflated order updated.
- **#7 (P2) determinism:** buildRacePlan localeCompare → code-point comparator (the one banned-elsewhere comparator on the advice path).
- **#8/#16 (P2/P3) determinism:** history `bundleSignificantTags` 'cold' now mirrors conditionsToTags (air≤10 OR track≤10, was air-only) — a cold-track-only run no longer mis-segments against opposite-condition history.
- **#12 (P2) security:** Stripe mapObjectStatus fails CLOSED ('expired') on a missing/non-string status (was 'active' — a malformed-but-signed event could grant Pro).
- **#9 (P2) data-integrity:** makeRun rejects a blank feedback symptom (parseRunEntry rejects it on reload → the run quarantined; a write-accepts/read-rejects gap, now closed).
- **#25 (P3):** chat surfaces the confidence_qualifier it already computes (was dropped; the report shows it).

## 🔒 RESERVED FOR WILLIAM — grounding P1s (active grounded-or-silent tension; direction call is yours)
> The M2 session explicitly reserved the `# REVIEW`-flagged rules' true direction (**flip-to-NT1 vs confirm
> class-exception vs re-cite**). Even lowering confidence preempts "keep as class exception," so these were
> NOT changed autonomously. They ship LIVE at confidence:high TODAY — please adjudicate.
- **#2 (P1):** `kb-no-shock-rear-thinner-503` (1-10-nitro-onroad) + `kb-tc-shock-rear-thinner-403` (1-10-touring) — confidence:high, address {no_forward_bite, corner_exit}, claim thinner rear oil → MORE corner-exit rear grip. **Sole source NT1 p.11 (per the rules' own REVIEW notes) says the OPPOSITE** for corner-exit/acceleration. The bump/braking effect IS supported; only the corner-exit address inverts the cite. Options: drop the corner_exit address (keep bump effect) + lower to medium · flip · re-cite · confirm class-exception.
- **#3 (P1):** `kb-no-shock-front-thinner-501` — cures understeer@mid_corner at high confidence while NT1 (sole source) describes the move as pushing toward oversteer. Same options.
- **#5 (P2, the gate that let them through):** validate-live source-contradiction MARKERS match only 4 literal phrases (`DIRECTLY CONTRADICTS|INVERTED on NT1|appears inverted|REVIEW: CONFLICT`); ~19 high-confidence rules use uncaught phrasings (`the OPPOSITE`, `PARTIAL SUPPORT`, `NOT supported by`). Broadening it is a 1-line change BUT it then hard-fails the build on those ~19 rules → forces the #2/#3-class decisions. Do the gate-broaden + the rule adjudication together.
- **#18 (P3):** 1/8 GT centre-diff rules (537/538) anchor to a source whose own cite text admits it does NOT cover the centre diff.
- **#19 (P3, D53):** user-facing `magnitude_guidance` strings leak source attribution (`HUDY:`, `NT1:`, `AE Cheat Sheets:`) — provenance belongs in the internal `sources` field; and some on-road guidance is attributed to the off-road HUDY book D55 disqualified. In-zone but a wide rule-file edit + a per-rule provenance check.

## ⏳ Remaining in-zone punch-list (deploy-phase / moderate — none breaking an invariant)
**Server (pre-deploy hardening):** #11 entitlement mints perpetual Pro when only checkout.session.completed lands (current_period_end stays null → clamp to a short bound) · #13 backup/blob PUT lacks the tombstone gate + user-row materialization (FK already PREVENTS resurrection here, so lower severity; needs a BackupCtx seam) · #10 rate-limit keys per-IP off a forgeable x-forwarded-for and the per-account dimension is built-but-unwired (needs platform-trusted IP at deploy) · #22 share/publish PII scrub blocks only emails (phone/GPS in free-text notes reach the auth-free GET) · #23 Stripe webhook never binds the customer to the user_id (client_reference_id is attacker-chosen — bind at checkout creation).
**Engine/KB robustness (clean, low-risk — good next-session in-zone work):** #6 cross-scope contradiction OPPOSITE map omits ~14 direction families (caster/camber/toe/diff/ARB contradictions undetectable) · #14 validate-live's column-0 structural assumption + fixed marker allowlist is fragile (detect rule spans from parsed data instead) · #24 dead code (`RuleHistory.last`, `guard.invalidCitations`) · #17 raceday mergeAdjustment drops the 2nd tag/trigger when one rule is amplified on two forecast tags (latent until a non-tyre rule is multi-amplified) · #26 analyzeRuns next-plan mixes an older feedback run's symptoms with the latest run's conditions/surface (refuse or align when track_ids differ).
**Data-integrity:** #20 applyMigration aborts the whole migration on the first repo put rejection (accumulate + continue) · #21 quarantine collection-blob stash uses a fixed id `__collection_blob` that overwrites prior corruption stashes for the same collection (content-address it) · #15 toEngineHistory is a footgun vs historyFromTuples (deprecate or sort-before-slice).
