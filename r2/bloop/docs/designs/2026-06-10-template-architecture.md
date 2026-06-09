# Template Architecture — Reconciling the "Templates + JSON configs" Vision with the Engineering Designs

**Date:** 2026-06-10
**Status:** Architecture decision (source of truth for the catalog / `game_config` format)
**Author:** Platform architect
**Scope:** Reconciles the product vision in `docs/games_ideas.md` (templates + `game_config` JSON,
"5 templates", AI auto-packaging) with the implemented engine contract (`packages/engine/src/types.ts`,
50 tests green), the four game designs (`impostor`, `rank-friends`, `hot-seat`, `truth-or-dare`), the
cross-game synthesis (`docs/designs/2026-06-10-cross-game-synthesis.md`), the server shell
(`docs/designs/2026-06-10-server-shell-design.md`, §4.5 `RoomMeta`, §2 `/config`), and the mobile
design system (`docs/designs/2026-06-10-mobile-design-system.md`, §2 tokens, §4.5 game registry).

> **Authority note.** This doc does not modify any existing file. It is the definitive ruling on
> (1) the canonical TEMPLATE↔GAME mapping, (2) the `game_config` zod schema, (3) the nine-concept
> template registry, (4) the KV catalog + Home-injection format, (5) the impact on the build order,
> and (6) the AI-packaging validation gate. Where the vision doc and the engineering docs disagree on
> a word ("template", "5 templates", "no code"), this doc rules and says why. Open *product* calls are
> collected in §7 and nowhere else.

---

## 0. The one-sentence reconciliation

The vision's **TEMPLATE** is exactly an engineering **`GameModule` package** (parameterized by its
typed `Config` + a `ContentPack`); the vision's **GAME** (a Home tile) is exactly a **`game_config`
JSON catalog entry** that names a template, pins a content pack, and overrides template params/theming
— injected into Home via the KV catalog manifest the shell already serves at `/config`, with **no
recompile** of the app *and no new server deploy* once the template module is shipped. The only honesty
correction to the vision: **"95% of concepts need zero code" is true only for templates that already
exist as modules. Of the named templates, only `VOTE`, `SECRET_ROLE`, and `RANKING` are designed;
`INPUT_GUESS` is designed by no doc and is genuinely new code. So the real claim is "once the 5
templates exist, ~95% of *future* concepts are config-only" — and building 3 of them
(`VOTE`/`RANKING`/`SECRET_ROLE`) as parameterized templates yields 4 of the 5 vision concepts almost
for free (see §5/§6).**

---

## 1. Template = GameModule, game = config instance

### 1.1 The canonical mapping

| Vision term (`games_ideas.md`) | Engineering object | Lives in | Parameterized by |
|---|---|---|---|
| **TEMPLATE** (`VOTE`, `SECRET_ROLE`, `RANKING`, `INPUT_GUESS`, …) | `GameModule<S, A, V, C>` **package** | `packages/games/<template>/` | its typed `Config` (defaults baked, overridable) + `ContentPack<C>` |
| **GAME** (a Home tile: "Pass the Bloop", "Guess My Rank") | **`game_config` JSON** catalog entry + content-pack ref | KV `client-config.catalog[]` (manifest) + R2 (pack) | n/a — it *is* the parameters |
| **template params** (VOTE reveal style, SECRET_ROLE ratios…) | a partial of the module's `Config` | `game_config.params` | typed per template (§2.4) |
| **content** (prompts, word pairs, questions) | `ContentPack<C>.data` | R2, versioned JSON | n/a |
| **theming** (color/icon/badge) | catalog display metadata | `game_config.theme` | resolved against mobile design tokens (§2.5) |

The crucial invariant the synthesis already enforces and we adopt verbatim: **a template module is
pure, JSON-safe, identity-free, and configured only through `init(seed, players, content)` + its
`Config`.** A template never hard-codes a single game's flavor; the flavor is 100% in the
`game_config` + the content pack. This is what makes one module (e.g. `VOTE`) back several catalog
games (tracer-style "who's most likely", "Pass the Bloop", future polls) with no code change.

### 1.2 Two distinct version axes (do not conflate)

- **Template/module version** — `GameModule.version` (integer). Code identity. Bumped only when the
  reducer/contract changes. The shell registry keys on `${id}@${version}` (server-shell §4.1).
- **Content-pack version** — `ContentPack.version` (integer, monotonic, immutable per R2 object;
  synthesis §3.2). Content identity. Bumped on every pack edit.

A `game_config` references **both**: a `template` id + a **`templateVersion` compatibility range**
(§2.3), and a `contentPackRef` pinning `{ packId, version }`. This lets a catalog game ride a patched
template (`impostor@2`) without editing every config, while still refusing a template that broke its
config shape.

### 1.3 Where it slots into the existing pipeline (spec §4, server-shell §4.5)

The spec's "Adding a game" pipeline is five steps; the template model **splits it into two cadences**:

**Cadence A — ship a TEMPLATE (engineering, ~once per new mechanic; requires a deploy):**
1. `pnpm create-game <template>` scaffolds `packages/games/<template>/{server,client,shared}` (spec §4).
2. Write reducer + views + zod action schema; pure Vitest; client `GameScreen` against typed view.
3. Register module in the server `REGISTRY` (`${id}@${version}` → `{ module, actionSchema }`,
   server-shell §4.1) **and** the mobile `gameRegistry` (`gameId` → `GameClient`, mobile §4.5).
4. `wrangler deploy` + `eas update`. **This is the only step that requires shipping code.**

**Cadence B — ship a GAME / `game_config` (content op, many per template; NO deploy):**
1. Upload the content pack JSON to R2 at `content/<template>/<packId>@<version>.json` (spec §4 step 3;
   server-shell §1.2 `<gameId>/<contentId>@<version>.json`).
2. Add/append a `game_config` entry to the KV `client-config.catalog[]` manifest (§4), with
   `template`, `templateVersion` range, `theme`, `params`, `contentPackRef`, gating, `rolloutPct`,
   `enabled`.
3. Flip the KV flag (`enabled`/`rolloutPct`). It appears on Home at the next `/config` fetch
   (`max-age=60`, server-shell §2) — **no `wrangler deploy`, no `eas update`, no schema migration.**

The runtime binding (server-shell §4.5 `RoomMeta`) already carries exactly the fields a `game_config`
resolves to at `startGame`:

```
RoomMeta.gameId        ← game_config.template            // which module
RoomMeta.gameVersion   ← resolved from templateVersion range against the live REGISTRY
RoomMeta.contentRef    ← game_config.contentPackRef       // { gameId(template), contentId, version } → R2
RoomMeta.seed          ← shell-generated at startGame     // unchanged
RoomMeta.roster        ← frozen connected players at init // unchanged
```

The **one shell change** the template model requires (small, additive, §4.3): `startGame` must carry
the **catalog entry id** (the `game_config.id`), not just the template id, so the shell can resolve
`params` + `contentPackRef` from the manifest and pass the **merged `Config`** into the module. Today
`startGame { gameId }` (protocol Plan-1) passes a bare module id; we extend it to
`startGame { configId }` and the shell looks `configId` up in the catalog. This keeps params in KV (no
client trust) and is forward-compatible (the catalog can be enriched without an app update).

---

## 2. The definitive `game_config` schema (zod + TypeScript)

This completes the truncated example in `games_ideas.md` (which ended after `"badge": "TRENDING",`).
It is the **source-of-truth catalog entry shape**. It lives in `packages/protocol` (shared
client↔server, so the compiler enforces it end-to-end) as `gameConfigSchema`, and an array of these is
the KV catalog manifest (§4).

### 2.1 Top-level schema

```ts
// packages/protocol/src/catalog.ts  (NEW, shared client+server)
import { z } from 'zod';

/** ISO-639-1 launch locales. Single-language per pack (synthesis §3.1). */
export const localeSchema = z.enum(['fr', 'en']);

/** Content rating tier, drives catalog filtering + store-compliance gating (synthesis §3.1). */
export const toneSchema = z.enum(['classic', 'spicy']);

/** Known templates. Adding a template = a code deploy + this enum grows (§1.3 Cadence A). */
export const templateIdSchema = z.enum([
  'VOTE',        // tracer-lineage simultaneous single-vote  (rank-friends is RANKING, not VOTE)
  'RANKING',     // ordered Borda ballot
  'SECRET_ROLE', // hidden-role + secret word + clue/vote loop
  'HOT_SEAT',    // rotating spotlight + predict-the-subject
  'TRUTH_DARE',  // turn rotation + group verdict
  'INPUT_GUESS', // free-text blitz / collaborative one-word (NEW — see §3.3)
] as const);
export type TemplateId = z.infer<typeof templateIdSchema>;

/** Localizable string: a map of locale → text. MUST cover every launch locale the config targets. */
export const localizedSchema = z.record(localeSchema, z.string().min(1).max(280));

/** Catalog display badge (mobile Badge component, §2.5). null = no badge. */
export const badgeSchema = z.enum(['TRENDING', 'NEW', 'HOT', 'CLASSIC', 'BETA']).nullable();

export const gameConfigSchema = z.object({
  /** Stable catalog id, kebab+year (the vision's "pass-the-bloop-2026"). The startGame key. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).min(3).max(64),
  /** Schema version of THIS config shape (not the template, not the pack). For forward-compat. */
  schemaVersion: z.literal(1),

  // ── presentation (vision: name/description/color/icon/badge) ──────────────
  /** Display name. Short, SHOUTY-friendly ("PASS THE BLOOP"). Localizable. */
  name: localizedSchema,
  /** One-line tile subtitle. Localizable. */
  description: localizedSchema,

  // ── template binding (vision: "template") ─────────────────────────────────
  template: templateIdSchema,
  /** Compatible module versions, inclusive. The shell resolves the live module in [min,max]. */
  templateVersion: z.object({ min: z.number().int().positive(), max: z.number().int().positive() })
    .refine(v => v.min <= v.max, 'min must be <= max'),

  // ── visual theming (vision: color/icon/badge), resolved vs mobile tokens (§2.5) ──
  theme: z.object({
    /** Dominant color: a SEMANTIC token name (preferred) or a raw #RRGGBB (vision uses raw hex). */
    color: z.union([
      z.enum(['brand', 'bubblegum', 'tangerine', 'sunbeam', 'limeade', 'aqua', 'lilac']),
      z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    ]),
    /** Icon id from the mobile Icon set (§3.1 of mobile doc): people|party|games|trophy|fire|… */
    icon: z.string().min(1).max(32),
    badge: badgeSchema,
  }),

  // ── typed template params (the partial Config override) — see §2.4 ────────
  params: z.unknown(), // refined per-template by templateParamsSchema(template) at validation time

  // ── content binding ───────────────────────────────────────────────────────
  contentPackRef: z.object({
    /** R2 pack id, e.g. "tod-classic-fr". One pack id is ONE locale (synthesis §3.1/§3.3). */
    packId: z.string().min(1).max(64),
    /** Pinned, immutable pack version (synthesis §3.2). */
    version: z.number().int().positive(),
  }),

  // ── player-count overrides WITHIN template bounds (§2.6) ───────────────────
  /** Optional overrides; MUST stay within [module.minPlayers, module.maxPlayers]. */
  minPlayers: z.number().int().min(2).max(16).optional(),
  maxPlayers: z.number().int().min(2).max(16).optional(),

  // ── gating / classification ───────────────────────────────────────────────
  /** Vibe tier for catalog filtering & age gate. spicy → requires age-gate + flag (synthesis §3, ToD §6). */
  tone: toneSchema.default('classic'),
  /** Minimum self-attested age to surface/launch this game. spicy SHOULD be 18. */
  minAge: z.number().int().min(0).max(21).default(0),
  /** Locale(s) this config targets; every locale here MUST be covered by name/description + a pack. */
  locales: z.array(localeSchema).min(1),

  // ── rollout (mirrors KV staged-rollout, §4) ───────────────────────────────
  /** Hard on/off kill switch (synthesis §3.2, spec §3/§4). false = hidden + un-startable. */
  enabled: z.boolean().default(false),
  /** Staged rollout 0..100 (spec §4 "flag 5% → 100%"). Hashed on install UUID, NOT identity. */
  rolloutPct: z.number().int().min(0).max(100).default(0),
  /** Home ordering weight; higher = earlier in the grid. Ties broken by id (deterministic). */
  sort: z.number().int().default(0),
})
.superRefine((cfg, ctx) => {
  // (a) player-count overrides are coherent
  if (cfg.minPlayers && cfg.maxPlayers && cfg.minPlayers > cfg.maxPlayers)
    ctx.addIssue({ code: 'custom', message: 'minPlayers > maxPlayers', path: ['minPlayers'] });
  // (b) params validate against the template's param schema
  const r = templateParamsSchema(cfg.template).safeParse(cfg.params);
  if (!r.success) ctx.addIssue({ code: 'custom', message: `params invalid for ${cfg.template}`, path: ['params'] });
  // (c) spicy implies an age gate
  if (cfg.tone === 'spicy' && cfg.minAge < 18)
    ctx.addIssue({ code: 'custom', message: 'spicy tone requires minAge >= 18', path: ['minAge'] });
});
export type GameConfig = z.infer<typeof gameConfigSchema>;
```

### 2.2 The completed vision example (Pass the Bloop)

The truncated `games_ideas.md` JSON, finished against this schema:

```jsonc
{
  "id": "pass-the-bloop-2026",
  "schemaVersion": 1,
  "name":        { "en": "PASS THE BLOOP", "fr": "PASSE LE BLOOP" },
  "description": { "en": "The viral 'Passing the phone' TikTok trend, for your friend group",
                   "fr": "La trend TikTok 'Passe le téléphone', version ta bande de potes" },
  "template": "VOTE",
  "templateVersion": { "min": 1, "max": 1 },
  "theme": { "color": "#FF6B8A", "icon": "phone", "badge": "TRENDING" },
  "params": { "revealStyle": "flip-one-by-one", "totalRounds": 5, "selfVoteAllowed": false },
  "contentPackRef": { "packId": "pass-the-bloop-en", "version": 1 },
  "tone": "classic",
  "minAge": 0,
  "locales": ["en", "fr"],
  "enabled": true,
  "rolloutPct": 5,
  "sort": 100
}
```

### 2.3 `templateVersion` resolution rule

At `startGame`, the shell picks the highest live `module.version` in `[templateVersion.min, max]`
present in the server `REGISTRY`. If none is live (kill-switched / not yet deployed) →
`err('UNKNOWN_GAME')` and the tile is suppressed on the next `/config`. This decouples content ops
(Cadence B) from code ops: a config pinned to `{min:1,max:2}` keeps working when `impostor@2` ships and
`@1` is retired, with no config edit.

### 2.4 Per-template `params` (typed PER TEMPLATE)

`params` is a partial of each module's `Config` (the modules already define full `Config` with defaults
— impostor §3.1, hot-seat §3.1, ToD §3, rank §3). The catalog only carries **overrides**; unspecified
keys fall back to `DEFAULT_CONFIG`. A `templateParamsSchema(template)` switch (in `packages/protocol`,
imported by both the shell validator and the AI gate §6) returns the right zod object:

```ts
export function templateParamsSchema(t: TemplateId): z.ZodType<unknown> {
  switch (t) {
    case 'VOTE': return z.object({
      totalRounds: z.number().int().min(1).max(10).optional(),
      /** flip-one-by-one = the "Pass the Bloop" tension reveal; instant = tracer-style. */
      revealStyle: z.enum(['instant', 'flip-one-by-one']).optional(),
      selfVoteAllowed: z.boolean().optional(),
    }).strict();

    case 'RANKING': return z.object({
      totalRounds: z.number().int().min(1).max(10).optional(),
      rankSize: z.number().int().min(2).max(8).optional(),          // ballot size (rank §3)
      fullRankThreshold: z.number().int().min(2).max(8).optional(), // small-group full-rank cutoff
      selfRankAllowed: z.boolean().optional(),
    }).strict();

    case 'SECRET_ROLE': return z.object({
      /** roles ratio: 'decoy' (impostor gets a related word) | 'blank' (impostor gets nothing). */
      impostorWordMode: z.enum(['decoy', 'blank']).optional(),
      maxImpostors: z.number().int().min(1).max(4).optional(),      // ratio cap (impostor §4.0)
      clueTurnMs: z.number().int().min(5_000).max(60_000).optional(),
      discussMs: z.number().int().min(15_000).max(120_000).optional(),
    }).strict();

    case 'HOT_SEAT': return z.object({
      roundsPerPlayer: z.number().int().min(1).max(3).optional(),
      scoreboardEvery: z.number().int().min(1).max(8).optional(),   // ad cadence (hot-seat §2.1)
      matchPoints: z.number().int().min(1).max(1000).optional(),
      readPoints: z.number().int().min(1).max(1000).optional(),
    }).strict();

    case 'TRUTH_DARE': return z.object({
      totalRounds: z.number().int().min(1).max(8).optional(),
      passesPerPlayer: z.number().int().min(0).max(5).optional(),   // skip economy (ToD §3)
      allowedIntensities: z.array(z.enum(['soft', 'party', 'spicy'])).min(1).optional(),
      verdictThreshold: z.number().min(0).max(1).optional(),
    }).strict();

    case 'INPUT_GUESS': return z.object({
      /** the two designed-for modes (§3.3): blitz timer-validation vs collaborative one-word. */
      mode: z.enum(['blitz', 'collab-one-word']),                   // REQUIRED (mode-selecting)
      blitzMs: z.number().int().min(3_000).max(15_000).optional(),  // "Name 3 in 5s" timer
      validation: z.enum(['peer-tap', 'auto-none']).optional(),     // how a blitz answer is judged
      dedupeExactMatches: z.boolean().optional(),                   // "Just One Word" duplicate elim
      totalRounds: z.number().int().min(1).max(10).optional(),
    }).strict();
  }
}
```

`.strict()` everywhere so an unknown/typo'd param is a validation error, not a silent no-op — the
catalog is the source of truth and must fail loudly.

### 2.5 Theming reconciled with the mobile design tokens

The vision uses raw hex (`#FF6B8A`, `#45D0E8`, …). The mobile design system (§2.1) is **token-first**:
components consume semantic tokens (`brand`, `bubblegum`, `tangerine`, …), never raw palette, so Night
Pop Lite is a one-line theme swap. **Ruling:** `theme.color` accepts **either** a semantic token name
(preferred — survives the dark-mode swap) **or** a raw `#RRGGBB` (allowed, because trend configs and
the AI pipeline will mint colors that aren't in the palette). Mapping of the vision's colors:

| Vision hex | Concept | Closest token | Catalog `theme.color` recommendation |
|---|---|---|---|
| `#FF6B8A` Pass the Bloop | rose/social | `bubblegum #FF5DA2` | `"bubblegum"` (or keep raw for exact brand) |
| `#45D0E8` Name 3 in 5s | cyan/speed | `aqua #36C5D0` | `"aqua"` |
| `#FF6B6B` NPC Infiltrator | coral/tension | `danger #F4453E` / `tangerine` | raw `#FF6B6B` (tension, no exact token) |
| `#FF9F43` Guess My Rank | orange/compete | `tangerine #FF7A3C` / `sunbeam` | `"tangerine"` |
| `#5DDEB4` Just One Word | mint/trust | `limeade #6FD66B` / `mint` | `"limeade"` |

`theme.icon` is a **mobile `Icon` name** (`phone`, `fire`, `crown`, `lightning`, `trophy`, `shuffle`,
… — mobile §3.1), NOT a raw asset path, so a config can't reference an icon the app doesn't bundle (the
AI gate §6 validates `icon ∈ knownIconSet`). `theme.badge` maps 1:1 to the mobile **`Badge`** component
(sticker-styled, `dare`-fill, ALL-CAPS — mobile §3 table). `TRENDING`/`NEW`/`HOT` are the ordering +
badge signals (§4).

### 2.6 Player-count overrides within template bounds

`game_config.minPlayers/maxPlayers` are **optional tighteners**, never wideners. Validation clamps them
to `[module.minPlayers, module.maxPlayers]` (the per-template floor the synthesis §5.7 says to catalog:
impostor/rank/hot-seat = 3, ToD = 2, INPUT_GUESS = TBD §3.3). A config may say "this VOTE game wants
4–10" but can never say "2" if the module floor is 3. The lobby gates "Start" on the **effective**
`minPlayers = max(module.minPlayers, config.minPlayers ?? module.minPlayers)` (synthesis §5.7 — the
catalog manifest must carry it and the lobby already reads it).

### 2.7 Intensity / age / locale gating

- **`tone`** (`classic` | `spicy`) is the catalog-level vibe (synthesis §3.1). `spicy` forces
  `minAge >= 18` (schema refinement (c)) and is additionally a runtime gate: a `TRUTH_DARE` config can
  set `params.allowedIntensities` but `spicy` is still off behind the host/region flag (ToD §6 — the
  config *requesting* spicy ≠ spicy *playing*).
- **`minAge`** gates whether the tile surfaces given the device's self-attested age (anonymous, on
  device — spec identity rule). It is advisory + store-compliance, never an account check.
- **`locales`** must each be covered by `name`/`description` keys **and** an available pack id (the AI
  gate §6 enforces parallel coverage; synthesis §3.3 "FR/EN parallel"). One pack id = one locale, so a
  bilingual catalog game references **one `contentPackRef` per locale via sibling configs OR** a config
  whose `contentPackRef` is locale-resolved by the shell at `startGame` from the room locale. **Ruling:**
  the shell selects the locale-correct pack id at `startGame` (synthesis §3.3 "shell-owned pack
  selection"); the `game_config` lists `locales` and a **pack family** by convention (`<base>-<locale>`),
  and `contentPackRef.packId` carries the base; the shell appends the room locale. (Concretely:
  `packId: "pass-the-bloop"` + room `en` → `pass-the-bloop-en`. Configs that only ship one locale list
  one entry in `locales`.) This keeps `init` locale-free (synthesis §3.3 rejects "init filters by
  locale").

---

## 3. The template registry — all NINE concepts mapped

The vision claims "5 templates". After reconciliation the honest count is **6 templates** (the 5 named
+ `HOT_SEAT` and `TRUTH_DARE`, which the vision's 5 concepts don't name but which two shipped designs
require — the vision under-counts because it only enumerated templates its 5 sample concepts touch).
`VOTE` and `RANKING` are distinct templates (rank-friends is a *Borda ballot*, not a single vote — its
own doc calls itself a "direct evolution of tracer" but with ranking math, so it is `RANKING`, not
`VOTE`).

### 3.1 Template inventory & design status

| Template | Backing design doc | Status | Note |
|---|---|---|---|
| `VOTE` | `tracer` (implemented) + cross-game synthesis | **Shipped** (tracer) | needs param-generalization (`revealStyle`, `selfVoteAllowed`) for "Pass the Bloop" — small |
| `RANKING` | `rank-friends` design | **Designed** | build #1 (synthesis §4) |
| `HOT_SEAT` | `hot-seat` design | **Designed** | build #2 |
| `TRUTH_DARE` | `truth-or-dare` design | **Designed** | build #3 |
| `SECRET_ROLE` | `impostor` design | **Designed** | build #4 |
| `INPUT_GUESS` | **none** | **MISSING — new code** | scoped at design-brief level in §3.3 |

### 3.2 The nine concepts → template, config-vs-code, effort

Effort legend: **config-only** (existing template + a number/enum tweak); **content-only** (existing
template + a new R2 pack, no param change); **new-params** (template needs a new param + small reducer
branch); **new-template** (no module exists — full design + build).

| # | Concept | Source | Template | Config vs code | Effort |
|---|---|---|---|---|---|
| 1 | **Impostor / NPC Infiltrator** (the designed flagship) | impostor doc | `SECRET_ROLE` | the template itself is the code; configs select `impostorWordMode`/ratios + word-pair pack | **new-template** (designed) — then config-only per variant |
| 2 | **The NPC Infiltrator** (vision concept) | games_ideas §3 | `SECRET_ROLE` | config (`impostorWordMode:'blank'` ≈ "NPC knows nothing") + a *group-identity* content pack | **content-only + new-params** (see ⚠) |
| 3 | **Rank Your Friends** (designed) | rank-friends doc | `RANKING` | template is the code; configs tune `rankSize`/`totalRounds` + prompt pack | **new-template** (designed) — then config-only |
| 4 | **Guess My Rank** (vision concept) | games_ideas §4 | `RANKING` | config (`rankSize`, self-rank?) + an ego/psychology prompt pack | **content-only** (+ maybe `selfRankAllowed` param ⚠) |
| 5 | **Hot Seat** (designed) | hot-seat doc | `HOT_SEAT` | template is the code; configs tune `roundsPerPlayer` + question pack | **new-template** (designed) — then config-only |
| 6 | **Truth or Dare** (designed) | truth-or-dare doc | `TRUTH_DARE` | template is the code; configs tune intensities/passes + prompt pack | **new-template** (designed) — then config-only |
| 7 | **Pass the Bloop** (vision concept) | games_ideas §2 | `VOTE` | config (`revealStyle:'flip-one-by-one'`) + a "passing the phone" sentence pack | **new-params + content-only** (small) |
| 8 | **Name 3 in 5s** (vision concept) | games_ideas §1 | `INPUT_GUESS` (`mode:'blitz'`) | template is missing; needs blitz timer + peer-tap validation | **new-template** |
| 9 | **Just One Word** (vision concept) | games_ideas §5 | `INPUT_GUESS` (`mode:'collab-one-word'`) | template is missing; needs hidden one-word buffer + duplicate elimination | **new-template** |

⚠ **Honesty flags (where the vision's "zero code" overstates):**
- **#2 NPC Infiltrator is NOT a pure config of impostor as-designed.** Impostor gives everyone the
  *same secret word* and one player a *decoy/blank word* from the same theme. NPC Infiltrator gives a
  **group a behavioral identity** ("toxic fitness influencers") and the infiltrator **nothing** — there
  is no civilian/decoy *word* pair, there's a *theme directive*. That maps onto `SECRET_ROLE` with
  `impostorWordMode:'blank'` **only if** the content pack's "word" becomes a "group directive string"
  and the civilian word is the shared directive. That is a **content-pack shape variant** (directive
  text instead of a one-token word) and likely a small param (`secretKind: 'word' | 'directive'`) so
  the reveal card renders a sentence, not a token. So: **content-only + one new param**, not zero code.
  Mark as a fast follow once `SECRET_ROLE` ships.
- **#4 Guess My Rank** is *almost* a pure `RANKING` config, BUT the vision wants **self-ranking** ("each
  player ranks *himself* secretly, then the group; points = gap between self-perception and group
  perception"). Rank-friends §9 Q2 explicitly defaults self-ranking **OFF** and the scoring is Borda,
  not perception-gap. So Guess My Rank needs **(a)** `selfRankAllowed:true` (a param rank-friends
  already flags as future) **and (b)** a *perception-gap scoring mode* the current `RANKING` reducer
  does not have. **Ruling:** the basic "rank your friends on an ego criterion" is content-only; the
  *perception-gap* mechanic is **new-params** (a `scoring: 'borda' | 'perception-gap'` mode) — schedule
  it as a `RANKING@2` enhancement, not a launch blocker.
- **#7 Pass the Bloop** needs `VOTE` to grow a `revealStyle:'flip-one-by-one'` param (tracer reveals
  instantly). Tiny reducer/view branch (the reveal already buffers votes; flip-one-by-one is a
  multi-beat reveal like rank-friends' podium walk, which proves the pattern). New-params, small.

**Net:** of 9 concepts, **4 are designed templates** (1,3,5,6), **2 are near-free configs of a designed
template with a small param/content variant** (2 on SECRET_ROLE, 4 on RANKING), **1 is a small new-param
on VOTE** (7), and **2 require the genuinely missing `INPUT_GUESS` template** (8,9). The vision's "95%
config" is directionally right *for future concepts on existing templates* but **2 of its own 5
flagship concepts (Name 3, Just One Word) need new code today.**

### 3.3 The MISSING template: `INPUT_GUESS` (design-brief level)

No doc designs it. It is the one true code gap among the vision's named templates. Scoping it now so it
slots into the contract with zero amendments (it fits the engine + the synthesis kit exactly).

**Decision: ONE template with two MODES, not two templates.** Both modes share: free-text player input
(the platform's *first* gameplay-text moderation surface — routes through the DO `obscenity` filter
before `reduce`, synthesis §1.8/spec §6), a hidden simultaneous buffer (`HiddenBuffer` convention,
synthesis §1.5), an atomic reveal, and the same `phaseKey`/`phaseDurationMs`/redaction discipline.
They differ only in the *reveal/scoring math*, which is exactly the "modes within one template" pattern
(cf. impostor `impostorWordMode`, ToD intensities). A `params.mode: 'blitz' | 'collab-one-word'`
discriminant selects the branch.

**Shared shape (both modes):**
- **Phases:** `prompt → input → reveal → (next round | over)` (collab adds a `guess` beat; blitz folds
  validation into `reveal`). `phaseKey = `${phase}:${round}`` (blitz) / with a `turnSeq` if collab
  rotates a guesser (synthesis §1.6 rule).
- **Hidden state:** `inputs: Record<PlayerId, string>` HIDDEN until reveal (the buffer); never in any
  non-owner `view()`; owner echo is `inputs[viewer] ?? null` (synthesis §1.5).
- **Text path:** every submitted string is profanity-filtered at the DO boundary *before* it enters
  state (so the censored text is event-sourced → deterministic replay, server-shell §4.2). This is the
  **first template with player gameplay text** — its redaction + moderation tests are load-bearing.

**Mode `blitz` ("Name 3 in 5s"):** the app spotlights one random player + a stressful prompt; a very
short timer (`blitzMs`, default 5000) runs; the *others* tap **green (valid) / red (failed/too slow)**
— `validation: 'peer-tap'`. Scoring: the spotlit player scores if the peer-tap majority is green within
the timer. There is **no text typed in blitz** (the answer is shouted IRL); the "input" is the peer-tap
verdict buffer (a `HOT_SEAT`/`TRUTH_DARE`-style sub-vote over the non-spotlit set, `allActed` over
`expected = connected minus spotlit`). So blitz is actually closer to a **timed verdict** than a text
game — `dedupeExactMatches` is irrelevant here.

**Mode `collab-one-word` ("Just One Word"):** one player is the "Guesser"; the app shows the *others* a
secret word; each non-guesser secretly types **one** word of clue into the hidden buffer; on reveal the
reducer **eliminates exact-duplicate clues** (`dedupeExactMatches:true`, compared via the synthesis
`normalizeText` helper §1.8 so "Noir" == "noir") *before* the Guesser sees the surviving clues; the
Guesser then guesses. Scoring: collaborative (everyone scores if the Guesser gets it; the duplicate-elim
is the comedic constraint, not a scoring axis). This is the mode that exercises the real text buffer +
the **duplicate-elimination mechanic**.

**One template or two?** One. The duplicate-elimination (`collab`) and the timed-peer-validation
(`blitz`) are different reveal resolvers behind one `mode` param sharing 80% of the skeleton (hidden
buffer, atomic reveal, the text/moderation surface for collab). Splitting them doubles the package +
client-registry + catalog surface for no reuse gain. **Open product call** (§7 Q1): whether blitz —
being a peer-tap timed verdict with *no typed text* — is better modeled as a `HOT_SEAT`/verdict cousin
than as `INPUT_GUESS`; if so, `INPUT_GUESS` collapses to just the collab text game and blitz becomes a
`TIMED_VERDICT` template. The author's recommendation: keep both under `INPUT_GUESS` for v1 (the vision
groups them), revisit if the blitz reducer shares nothing with collab in practice.

**Contract impact:** zero amendments. `INPUT_GUESS` fits the existing `GameModule` + the approved
`phaseKey` (synthesis A1) + the shared kit. Its only *new* platform surface is **gameplay text
moderation**, which the spec already mandates at the DO boundary and the synthesis already routes
(§1.8). Build it **after** the four designed games (it is the highest-risk-newest, and it is the first
to need the gameplay-text moderation path battle-tested — see §5).

---

## 4. Catalog + Home injection (KV manifest, ordering, kill switches, rollout)

Consistent with the spec's remote-config (spec §3/§4) and the server-shell `/config` (§2) +
`gameRegistry`/Home grid (mobile §4.2/§4.5).

### 4.1 KV catalog manifest format

The front door serves `CONFIG.get('client-config', 'json')` at `/config` (server-shell §2,
`max-age=60`). We define `client-config` as:

```jsonc
// KV key: "client-config"  (the ONE blob the app fetches over HTTPS before WS)
{
  "minAppVersion":      42,        // spec §4 minAppVersion gate; below → UPGRADE_REQUIRED-style nudge
  "minProtocolVersion": 1,         // server-shell handshake
  "adFrequency": { "interstitialEveryRounds": 2, "maxPerSession": 6 },  // spec §5 ad caps
  "catalog": [ /* GameConfig[] — validated by gameConfigSchema (§2) */
    { "id": "pass-the-bloop-2026", "template": "VOTE", "enabled": true, "rolloutPct": 5, "sort": 100, /* … */ },
    { "id": "rank-your-friends",   "template": "RANKING", "enabled": true, "rolloutPct": 100, "sort": 90, /* … */ },
    { "id": "the-impostor",        "template": "SECRET_ROLE", "enabled": false, "rolloutPct": 0, "sort": 80, /* … */ }
  ]
}
```

- The catalog is an **array of `GameConfig`**; the app filters/sorts it into the Home `GameTile` grid
  (mobile §4.2 "lists available games … via the KV catalog manifest"). No per-game app code: the
  generic shell renders a tile from `{ name, description, theme, minPlayers..maxPlayers, badge }` and
  routes `startGame { configId: id }` (§1.3, §4.3).
- A config whose `template` is not in the live server `REGISTRY` (not yet deployed, or a typo) is
  **filtered out client-side** (the tile would be un-startable) AND rejected by the AI gate (§6) before
  it ever reaches KV. The app must tolerate unknown templates gracefully (skip the tile) so a KV push
  can't brick Home for older app versions — pair `templateVersion.min` with `minAppVersion` so a config
  using a brand-new template is only surfaced to apps that bundle its client renderer.

### 4.2 Ordering & badging (TRENDING / NEW)

- **Order:** Home grid sorts by `sort` desc, then `id` (deterministic), filtered by `enabled &&
  rolloutPct-bucket && minAge && device-locale ∈ locales`. `TRENDING`/`HOT` configs get a high `sort`;
  `NEW` is both a `badge` and a `sort` boost set by the content op.
- **Badge:** `theme.badge` renders the mobile `Badge` sticker (mobile §3). `TRENDING` and `NEW` are
  pure metadata — no code, set/cleared by editing the KV config. This is how the AI pipeline (§6)
  "injects a trending concept into Home": append a `GameConfig` with `badge:'TRENDING'`, high `sort`,
  `rolloutPct:5`, `enabled:true`.

### 4.3 Kill switches & staged rollout

- **Kill switch:** `enabled:false` (per-config) hides the tile AND makes `startGame` for that
  `configId` return `err('UNKNOWN_GAME')` (server-shell §4.1 catalog-removed path) — a bad game or bad
  pack is yanked region-wide by one KV edit, **no deploy** (synthesis §3.2, spec §3/§4). A separate
  **pack** kill switch is the same edit at the `contentPackRef` granularity (bump to a known-good
  version or disable the config).
- **Staged rollout:** `rolloutPct` (0..100) is bucketed on the **rotatable per-install UUID** (spec §3
  — never identity), so "flag 5% → 100%" (spec §4 step 5) is a KV number change. Server-side, the
  `startGame` handler re-checks `enabled` + bucket as defense-in-depth (a client that ignored the
  filter still can't start a disabled game).
- **Mid-game safety:** a kill switch flipped *during* a live room does NOT tear down that room (it
  finishes on its pinned `RoomMeta.gameVersion`/`contentRef`, server-shell §5 replay determinism); it
  only prevents *new* rooms. This matches the spec's "room pinned at creation" rule.

### 4.4 The one protocol/shell change (restated)

`startGame { gameId }` → `startGame { configId }`; the shell resolves the `GameConfig` from KV,
validates it (`gameConfigSchema`), merges `params` over the module `DEFAULT_CONFIG`, resolves the
locale pack id, and pins all of it into `RoomMeta`. Additive to protocol Plan-1; no engine change.
**Open product call** (§7 Q4): whether the host can pick `params` at lobby time (e.g. spicy toggle) or
whether params are 100% catalog-fixed; default = catalog-fixed, host gets only the documented toggles
(intensity, rounds) the config marks `hostTunable` (a future field).

---

## 5. Impact on the build order

The synthesis §4 build order is **rank-friends → hot-seat → truth-or-dare → impostor**, chosen for a
reuse gradient (each game seeds kit helpers the next reuses) and demo value. **Does the template lens
change it? No — it confirms it, and it adds two appendices.**

### 5.1 The designed-four order is UNCHANGED

The template view does not reorder the four designed games. Their order is driven by *engine-risk*
gradient (redaction surface, kit-helper seeding) which is orthogonal to the catalog model. rank-friends
still goes first (closest to tracer, proves `phaseKey` + multi-beat reveal), impostor still last
(highest redaction stakes). The template work *rides along* each game build: when you build
`RANKING`, you write its `Config` with the catalog params in mind (`rankSize`, `selfRankAllowed`); when
you build `SECRET_ROLE`, you parameterize `impostorWordMode` (already in its `Config`). No reorder.

### 5.2 What the template lens ADDS (quantified): templates → vision concepts nearly free

This is the synthesis's predicted insight, now quantified. Building the three *vision-named* templates
as **parameterized** modules (not hard-coded single games) yields the vision's 5 flagship concepts at a
fraction of the cost:

| Build the template… | …and these vision concepts become… | Marginal cost beyond the template |
|---|---|---|
| `RANKING` (build #1, for rank-friends) | **Guess My Rank** (#4) | 1 prompt pack + 1 config (+ `RANKING@2` perception-gap for the full mechanic) → **content-only for the basic, new-param later** |
| `VOTE` (already shipped as tracer) | **Pass the Bloop** (#7) | 1 `revealStyle` param + 1 sentence pack + 1 config → **~1 day** |
| `SECRET_ROLE` (build #4, for impostor) | **NPC Infiltrator** (#2) | 1 `secretKind:'directive'` param + 1 directive pack + 1 config → **content-only + 1 small param** |

So **3 of the 5 vision concepts (Pass the Bloop, Guess My Rank, NPC Infiltrator) ship as
config/content/tiny-param riders on templates we are building anyway** — roughly **1 day to 1 week each
on top of the designed game**, versus a full game build (~1–2 weeks each) if each were bespoke. The
remaining **2 vision concepts (Name 3 in 5s, Just One Word) require the new `INPUT_GUESS` template** —
real work, but ONE template covers BOTH (its two modes). Net: **5 vision games for the cost of ~1 new
template + 3 small riders**, exactly the leverage the vision claims (just not "zero").

### 5.3 Appendix to the build order

- **5th build = `INPUT_GUESS`** (after impostor). Rationale: it is the newest mechanic *and* the first
  to need gameplay-text moderation hardened; landing it on the proven kit + a battle-tested redaction
  harness (post-impostor) is the same "save the riskiest for the most-hardened toolkit" logic the
  synthesis applies to impostor. Build `collab-one-word` mode first (it's the true text game), `blitz`
  mode second (or split per §7 Q1).
- **VOTE param-generalization** (`revealStyle`, `selfVoteAllowed`) is a **cheap parallel task** — it can
  land any time after rank-friends proves the multi-beat reveal, since flip-one-by-one is the same
  pattern. Schedule it whenever a "Pass the Bloop" launch is wanted, independent of the main line.
- **The catalog/`game_config` plumbing** (this doc's §2/§4: `gameConfigSchema` in protocol, the KV
  `client-config.catalog`, `startGame { configId }`, the Home grid reading the manifest) should land
  **alongside rank-friends** (the first real catalog game beyond tracer), so the second game onward is
  added as a config, proving Cadence B end-to-end early.

---

## 6. What the AI-packaging pipeline needs (future, design-brief level)

The vision's AI pipeline (Claude API auto-packaging a trending concept into a `game_config` + content
pack, then flipping a KV flag) is **a content-op automation, not a code path** — it must produce
artifacts that pass the *same* validation a human content op's would, then stage behind a flag. It must
NEVER be able to flip a config live without passing the gate. The gate (all stages must pass before
`enabled` may go true / `rolloutPct` may rise):

1. **Schema validation (hard):** the generated `game_config` parses `gameConfigSchema` (§2) AND its
   `params` parse `templateParamsSchema(template)` (§2.4). `template` must be a **live** template in the
   server `REGISTRY` within `templateVersion` range (§2.3) — the AI cannot invent a template; it can
   only configure an existing one. `theme.icon ∈ knownIconSet`, `theme.color` token-or-hex, every
   `locales` entry covered by `name`/`description` + a referenced pack id.
2. **Content-pack validation (hard):** the generated `ContentPack<C>.data` parses the template's own
   content zod schema (impostor `WordPair`, hot-seat `hotSeatContentSchema`, ToD `TodContent`, rank
   `RankContent`, INPUT_GUESS's pack schema), is **single-locale** (synthesis §3.1), and meets the
   **authoring sizing lint** (`>= maxPlayers × totalRounds` drawable entries per pool, synthesis §3.5)
   so a max room never exhausts mid-session.
3. **Profanity / safety scan (hard):** every string in the pack (and `name`/`description`) passes the
   server `obscenity` filter (spec §6) — the same filter players' text hits, run at authoring time so
   no slur ships in author-vetted content. Spicy content forces `tone:'spicy'` + `minAge>=18` + the
   age-gate flag (it cannot quietly ship as `classic`). Optionally a stronger LLM-judge pass for
   policy categories the regex filter misses (hate, self-harm, sexual-minor) — this is where the AI
   pipeline must be most conservative.
4. **Determinism / replay smoke (hard):** load the module with the generated `{config, pack, seed}`,
   run a scripted full game via `replay()`, assert it reaches `over` without throwing and the redaction
   audit (`leakedSecrets`) finds no leak — i.e. the generated artifacts don't crash or leak on the
   real reducer. (Cheap: the modules are pure Vitest-testable.)
5. **Playtest checklist (soft → human gate before 100%):** a human (or a curation LLM with a rubric)
   confirms: prompts are *fun and on-brand*, the param choices read at a party (timers not absurd,
   `rankSize`/`rounds` pace right), FR/EN are both *natural* (not machine-translated mush), and the
   tile copy/theme is appealing. This gate is what `rolloutPct: 5` is for — ship to 5%, watch
   `round_completed`/abandon analytics (anonymous, spec §3), then a human promotes to 100% or kills it.

**The flag flip is the LAST step and is gated on 1–4 passing + a human sign-off for 5.** The pipeline
writes the pack to R2 and the config to KV with `enabled:false, rolloutPct:0`; only after the gate does
a human/automation set `enabled:true, rolloutPct:5`. This keeps the AI inside the same safety envelope
as a human content op, with no new privileged code path.

---

## 7. Open product questions (decisions needed; not engineering blockers)

1. **`INPUT_GUESS`: one template or split?** Recommended: one template, two modes (`blitz`,
   `collab-one-word`) for v1. But `blitz` is a *timed peer-tap verdict with no typed text* and may
   share little reducer code with `collab`. If they diverge in practice, split `blitz` into a
   `TIMED_VERDICT` template and let `INPUT_GUESS` be the text game only. Decide after the collab
   reducer exists.
2. **NPC Infiltrator content shape.** Confirm `SECRET_ROLE` should grow a `secretKind:'word'|'directive'`
   param so the reveal card can render a group-directive sentence (vision §3) rather than a one-token
   word — i.e. accept the small param, or ship NPC Infiltrator only as word-pairs (loses the concept's
   flavor)?
3. **Guess My Rank perception-gap scoring.** The vision's signature mechanic (points = self-perception
   vs group-perception gap) is NOT in `RANKING` as designed (Borda). Greenlight `RANKING@2` with a
   `scoring:'borda'|'perception-gap'` mode + `selfRankAllowed`, or launch Guess My Rank as plain
   ego-criterion Borda ranking (cheaper, loses the hook)?
4. **Host-tunable params.** Are catalog `params` 100% fixed, or may the host tweak a documented subset
   at lobby (spicy toggle, round count) via a `hostTunable` allowlist on the config? Default: fixed +
   the existing per-game toggles only (ToD intensity, etc.).
5. **`theme.color` policy.** Enforce semantic tokens (dark-mode-safe, but constrains the AI/trend
   palette) or allow raw hex (flexible, but a trend color may clash on Night Pop Lite)? Default: allow
   both, prefer tokens; the AI gate could require a token unless a human overrides.
6. **Catalog locale model.** Confirm the `<base>-<locale>` pack-family convention with shell-side locale
   resolution (§2.7) vs sibling per-locale configs. Default: pack-family + shell resolution (keeps one
   tile per game across locales).
7. **"5 templates" public framing.** The honest count is 6 templates (5 named + HOT_SEAT + TRUTH_DARE,
   minus that VOTE/RANKING are already 2 of the named). Align the vision doc's "5 templates" copy with
   reality, or keep "5" as a marketing round number? (Engineering uses 6.)
```