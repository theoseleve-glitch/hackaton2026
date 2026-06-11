# Plan 3b — Brand Book v1.0 Re-theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-theme `apps/mobile` from the interim "blurpleberry" moodboard theme to Bloop Brand Book v1.0 (committed at `r2/bloop/docs/da/brand/bloop-brand-book-v1.pdf`): Fredoka + DM Sans fonts, ink/cream/coral palette, sticker-pop hard shadows, initial-letter avatars (name-hashed color disc), brand-aligned game catalog.

**Architecture:** The app already routes every color through semantic tokens (`useTheme().theme.*`) and every text style through `tokens.type` roles, so this is overwhelmingly a token-layer swap. The two structural changes are: (1) the `Avatar` component switches from emoji rendering to an initial-on-color-disc (color hashed from nickname — Brand Book §5: "No mascot... Players are represented by an initial in their chosen color"), and (2) the home avatar picker is removed (avatar is now derived, not chosen). The wire protocol does NOT change: `playerProfileSchema.avatar` stays (bounded string ≤64), clients just stop reading it.

**Tech Stack:** Expo SDK 55, `@expo-google-fonts/fredoka`, `@expo-google-fonts/dm-sans`, existing vitest Tier A suite (`test-node/`).

**Canonical color values** (extracted from the brand book PDF's vector fill operators — the text layer is glyph-corrupted; these fills are exact):

| Token | Hex | Role (book §3/§15) |
|---|---|---|
| ink.900 | `#0F1633` | Primary text / grounding / shadow.pop color |
| ink.800 | `#1E2654` | Dark-mode card |
| ink.850 | `#1A2350` | Dark-mode inset surface |
| cream.50 | `#FBF6EC` | Background |
| cream.100 | `#F4EAD5` | Surface alt |
| white | `#FFFFFF` | Card |
| coral.500 | `#FF6F61` | Accent CTA (brand) |
| yellow.400 | `#FFCC4D` | Highlight / awards / XP |
| yellow.soft | `#FFE08A` | Soft highlight fill |
| teal.500 | `#4ECDC4` | Success-chill accent / "Truth" |
| cobalt.500 | `#5B7BFF` | Info / night mode accent |
| lavender.400 | `#B6A8FF` | Secondary accent |
| lavender.soft | `#D6CCFF` | Soft lavender fill |
| pink.400 | `#FF6B9D` | Burst / "Dare" / spice |
| pink.soft | `#FFC2D6` | Soft pink fill |
| success | `#3DC97A` | Semantic success |
| danger | `#E5503F` | Semantic danger |
| warning | `#FDC700` | Semantic warning |

Light→Dark mapping (book §15): background `cream.50 → ink.900`; card `#FFFFFF → ink.800`; accent coral unchanged; foreground `ink.900 → cream.50`; border `ink @ 12% → cream @ 10%`; shadow.pop `ink → black`.

**Conventions for all tasks:** pnpm is at `C:\Users\Admin\AppData\Roaming\npm\pnpm.cmd` (not on PATH in sub-shells). Run Tier A tests from repo `r2/bloop` root: `pnpm vitest run --dir apps/mobile/test-node` (or full `pnpm test`). Typecheck inside the package: `cd apps/mobile && pnpm exec tsc --noEmit`. Commit after each task. Do not touch `apps/server`, `packages/*`, or the protocol.

---

### Task 1: Fonts — Fredoka (display) + DM Sans (UI/body)

**Files:**
- Modify: `apps/mobile/package.json` (deps)
- Modify: `apps/mobile/src/theme/typography.ts`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/test-node/theme-tokens.test.ts`

- [ ] **Step 1: Swap font packages**

From `r2/bloop`:

```powershell
& "C:\Users\Admin\AppData\Roaming\npm\pnpm.cmd" --filter @bloop/mobile remove @expo-google-fonts/baloo-2 @expo-google-fonts/inter
& "C:\Users\Admin\AppData\Roaming\npm\pnpm.cmd" --filter @bloop/mobile add @expo-google-fonts/fredoka @expo-google-fonts/dm-sans
```

Then verify the exact export names (they are expected to be `Fredoka_600SemiBold`, `Fredoka_700Bold`, `DMSans_400Regular`, `DMSans_500Medium`, `DMSans_700Bold`):

```powershell
Get-ChildItem node_modules\.pnpm -Directory -Filter "@expo-google-fonts+fredoka*"
# then inspect: node -e "console.log(Object.keys(require('@expo-google-fonts/fredoka')))" run from apps/mobile
```

If an export name differs (e.g. no `600SemiBold` weight), use the nearest available weight and note it in the commit message.

- [ ] **Step 2: Update the failing test first**

In `apps/mobile/test-node/theme-tokens.test.ts`, replace the pinned font expectations (currently lines ~51–56) with:

```ts
      display: 'Fredoka_700Bold', displaySemi: 'Fredoka_600SemiBold',
      ui: 'DMSans_700Bold', body: 'DMSans_400Regular', bodyMedium: 'DMSans_500Medium',
```

and update the pinned role expectations to match (same sizes as before, new families):

```ts
    expect(type.displayXL).toEqual({ fontSize: 48, lineHeight: 52, fontFamily: 'Fredoka_700Bold', letterSpacing: 0.5 });
    expect(type.body).toEqual({ fontSize: 16, lineHeight: 24, fontFamily: 'DMSans_400Regular' });
    expect(type.overline).toEqual({ fontSize: 11, lineHeight: 14, fontFamily: 'DMSans_700Bold', letterSpacing: 1.2 });
```

- [ ] **Step 3: Run the test to verify it fails**

`pnpm vitest run --dir apps/mobile/test-node` → theme-tokens test FAILS (families still Baloo2/Inter).

- [ ] **Step 4: Update typography.ts**

```ts
// apps/mobile/src/theme/typography.ts
// Brand Book v1.0 §4: Fredoka = display & logo (rounded, friendly, bouncy);
// DM Sans = UI & body (clean, geometric). Caveat (sticker labels) lands with the
// first sticker component — YAGNI until then. Size scale kept from 3a (tuned to screens).
export const fontFamily = {
  display: 'Fredoka_700Bold',      // hero numbers, screen titles, "BLOOP!" shouts
  displaySemi: 'Fredoka_600SemiBold',
  ui: 'DMSans_700Bold',            // buttons, labels, badges (book: Button = DM Sans 700)
  body: 'DMSans_400Regular',       // paragraphs, helper text
  bodyMedium: 'DMSans_500Medium',
} as const;
```

The `type` scale below it is unchanged (roles keep their sizes; families flow from `fontFamily`).

- [ ] **Step 5: Update _layout.tsx font loading**

```tsx
import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
```

and in `useFonts({...})`:

```tsx
  const [loaded] = useFonts({
    Fredoka_600SemiBold, Fredoka_700Bold,
    DMSans_400Regular, DMSans_500Medium, DMSans_700Bold,
  });
```

- [ ] **Step 6: Run tests + typecheck, verify pass**

`pnpm vitest run --dir apps/mobile/test-node` → PASS. `cd apps/mobile && pnpm exec tsc --noEmit` → clean.

- [ ] **Step 7: Commit**

```bash
git add -A apps/mobile
git commit -m "feat(mobile): swap fonts to Fredoka + DM Sans per Brand Book v1.0 §4"
```

---

### Task 2: Palette + semantic themes

**Files:**
- Modify: `apps/mobile/src/theme/colors.ts` (full rewrite of palette + themes; `ColorTheme` interface keys UNCHANGED)
- Modify: `apps/mobile/test-node/theme-tokens.test.ts` (any pinned colors)

- [ ] **Step 1: Update pinned color expectations in the test first** (whatever the test pins — e.g. if it asserts `lightTheme.brand === '#5B6CFF'`, change to `'#FF6F61'`; if it asserts `bg === '#FFF9F0'`, change to `'#FBF6EC'`). Run → FAIL.

- [ ] **Step 2: Rewrite colors.ts**

```ts
// apps/mobile/src/theme/colors.ts

/** Raw palette — Brand Book v1.0 §3/§15. Hexes extracted from the brand book PDF
 *  vector fills (text layer is glyph-corrupted; fills are canonical). */
export const palette = {
  // --- Ink (grounding) ---
  ink:          '#0F1633', // ink.900 — primary text, shadow.pop color
  inkCard:      '#1E2654', // ink.800 — dark-mode card
  inkInset:     '#1A2350', // dark-mode inset surface

  // --- Cream (light base) ---
  cream:        '#FBF6EC', // cream.50 — app background
  creamAlt:     '#F4EAD5', // cream.100 — surface alt / inset fills
  card:         '#FFFFFF', // raised card surface

  // --- Brights ---
  coral:        '#FF6F61', // coral.500 — THE accent CTA
  coralPressed: '#E85D50', // derived −8% lightness for pressed state
  yellow:       '#FFCC4D', // yellow.400 — highlight, awards, XP
  yellowSoft:   '#FFE08A',
  teal:         '#4ECDC4', // success-chill accent, "Truth"
  cobalt:       '#5B7BFF', // info / night-mode accent
  lavender:     '#B6A8FF', // secondary accent
  lavenderSoft: '#D6CCFF',
  pink:         '#FF6B9D', // burst / "Dare" / spice
  pinkSoft:     '#FFC2D6',

  // --- Semantic singletons ---
  success:      '#3DC97A',
  warning:      '#FDC700',
  danger:       '#E5503F',
  white:        '#FFFFFF',
  black:        '#000000',
} as const;

export type PaletteColor = keyof typeof palette;

// Semantic tokens — components reference THESE, never raw palette.
// (interface unchanged from 3a so no component churn)
export interface ColorTheme {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnBrand: string;

  brand: string;
  brandPressed: string;
  accent: string;
  truth: string;
  dare: string;
  xp: string;
  success: string;
  danger: string;
  warning: string;

  stickerOutline: string;
  burst: string;
}

export const lightTheme: ColorTheme = {
  bg: palette.cream,
  surface: palette.card,
  surfaceAlt: palette.creamAlt,
  border: 'rgba(15, 22, 51, 0.12)',   // book §15: border = ink @ 12%
  textPrimary: palette.ink,
  textSecondary: 'rgba(15, 22, 51, 0.72)',
  textMuted: 'rgba(15, 22, 51, 0.48)',
  textOnBrand: palette.white,

  brand: palette.coral,                // §3: "Coral — Accent CTA"
  brandPressed: palette.coralPressed,
  accent: palette.cobalt,              // info accent (invite, toasts)
  truth: palette.teal,
  dare: palette.pink,
  xp: palette.yellow,
  success: palette.success,
  danger: palette.danger,
  warning: palette.warning,

  stickerOutline: palette.ink,
  burst: palette.pink,
};

// Night Pop Lite — book §3: "use sparingly, night-mode lobby ambience & reveals".
export const darkTheme: ColorTheme = {
  bg: palette.ink,
  surface: palette.inkCard,
  surfaceAlt: palette.inkInset,
  border: 'rgba(251, 246, 236, 0.10)', // book §15: cream @ 10%
  textPrimary: palette.cream,
  textSecondary: 'rgba(251, 246, 236, 0.72)',
  textMuted: 'rgba(251, 246, 236, 0.48)',
  textOnBrand: palette.white,

  brand: palette.coral,                // book §15: accent coral.500 → coral.500
  brandPressed: palette.coralPressed,
  accent: palette.cobalt,
  truth: palette.teal,
  dare: palette.pink,
  xp: palette.yellow,
  success: palette.success,
  danger: palette.danger,
  warning: palette.warning,

  stickerOutline: palette.black,       // book §15: shadow.pop ink → black
  burst: palette.pink,
};
```

NOTE: if any other file imports a removed palette key (`blurpleberry`, `paper`, `fog`, `tangerine`, etc.), fix the call site to a semantic theme key — grep `tokens.colors.` across `apps/mobile/src` and `apps/mobile/app`. Known: `ui.tsx` PrimaryButton uses `tokens.colors.fog` for the disabled fill → change to `theme.surfaceAlt`.

- [ ] **Step 3: Run tests → PASS; typecheck → clean.** The typecheck is the real net here: removed palette keys must produce zero errors.

- [ ] **Step 4: Commit** — `feat(mobile): ink+cream+coral palette per Brand Book v1.0 §3/§15`

---

### Task 3: Radii + sticker-pop shadows

**Files:**
- Modify: `apps/mobile/src/theme/radii.ts`
- Modify: `apps/mobile/src/theme/elevation.ts`
- Modify: `apps/mobile/src/components/ui.tsx` (PrimaryButton shadow)
- Modify: `apps/mobile/test-node/theme-tokens.test.ts` (if radii/elevation pinned)

- [ ] **Step 1: radii.ts** — book §15: sm 10 / md 14 / lg 22 / xl 28 / pill 999. Keep `xxl` (book has no equivalent; room-code panel uses it).

```ts
// apps/mobile/src/theme/radii.ts
// Brand Book v1.0 §15 radius scale (xxl is our extension for the room-code panel).
export const radii = {
  none: 0,
  sm: 10,
  md: 14,    // chips, small tiles
  lg: 22,    // cards (the default card radius)
  xl: 28,    // hero cards, sheets
  xxl: 36,   // large modal / room-code panel
  pill: 999, // buttons, avatar discs, badges
} as const;
```

- [ ] **Step 2: elevation.ts** — re-color soft shadows to ink, make `sticker` the book's `shadow.pop` (`0 4px 0 0 ink`), add `clay` (`0 6px 0 rgba(ink,.18)` — RN can't stack the second blur layer; the hard pass is the signature):

```ts
// apps/mobile/src/theme/elevation.ts
export const elevation = {
  none: {},
  // Soft card shadows (iOS shadow* + Android elevation)
  e1: { shadowColor: '#0F1633', shadowOpacity: 0.06, shadowRadius: 6,  shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  e2: { shadowColor: '#0F1633', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  e3: { shadowColor: '#0F1633', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  // Brand Book §15 shadow.pop: "0 4px 0 0 ink" — hard offset, no blur, reads as a cut sticker.
  sticker: { shadowColor: '#0F1633', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  // Brand Book §15 shadow.clay: "0 6px 0 rgba(ink,.18)" (single-layer approximation).
  clay: { shadowColor: '#0F1633', shadowOpacity: 0.18, shadowRadius: 0, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
} as const;
```

(`outline` block below stays as-is.)

- [ ] **Step 3: PrimaryButton goes sticker-pop** — in `ui.tsx`, the PrimaryButton style changes `...tokens.elevation.e2` → `...tokens.elevation.sticker` and the disabled fill `tokens.colors.fog` → `theme.surfaceAlt` (also drop the shadow when disabled):

```tsx
    <PopPressable onPress={onPress} disabled={off} style={{
      minHeight: 56, borderRadius: tokens.radii.pill, backgroundColor: off ? theme.surfaceAlt : theme.brand,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.spacing.xxl,
      ...(off ? {} : tokens.elevation.sticker),
    }}>
```

- [ ] **Step 4: tests + typecheck → PASS. Commit** — `feat(mobile): brand radii + shadow.pop sticker shadows (§7/§15)`

---

### Task 4: Initial-letter avatars (name-hashed color disc)

**Files:**
- Rewrite: `apps/mobile/src/avatars.ts`
- Modify: `apps/mobile/src/components/players.tsx` (Avatar + call sites)
- Modify: `apps/mobile/app/index.tsx` (remove picker)
- Modify: `apps/mobile/src/storage/profile.ts` (randomProfile)
- Test: `apps/mobile/test-node/avatars.test.ts` (new), existing profile tests

Brand Book §5: *"Players are represented by an initial in their chosen color — fast, neutral, infinitely scalable. Color is hashed from the name — every player gets a consistent hue across sessions. Letter is always the first character of the display name."* No mascot, no emoji identity (emoji remain fine as content/reactions).

Wire compatibility: `playerProfileSchema.avatar` stays in the protocol (bounded string). New profiles send the literal `'initial'`; old/bot values are simply ignored by rendering. NO protocol or server change.

- [ ] **Step 1: Write the failing test** — `apps/mobile/test-node/avatars.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AVATAR_DISC_COLORS, discColor, initialOf } from '../src/avatars';

describe('initial avatars (Brand Book §5)', () => {
  it('initialOf takes the first character, uppercased', () => {
    expect(initialOf('theo')).toBe('T');
    expect(initialOf('Émile')).toBe('É');
    expect(initialOf('  zoe')).toBe('Z');     // leading space trimmed
    expect(initialOf('🦖rex')).toBe('🦖');    // emoji-leading names keep the emoji (single grapheme-ish: first code point)
    expect(initialOf('')).toBe('?');
  });

  it('discColor is deterministic and stable across sessions', () => {
    expect(discColor('Theo')).toBe(discColor('Theo'));
    expect(AVATAR_DISC_COLORS).toContain(discColor('Theo'));
  });

  it('discColor varies across names (not all identical)', () => {
    const names = ['Theo', 'Emma', 'Hugo', 'Sarah', 'Liam', 'Maya', 'Zoe', 'Nina'];
    const distinct = new Set(names.map(discColor));
    expect(distinct.size).toBeGreaterThan(2);
  });

  it('is case- and whitespace-insensitive so a rename of casing keeps the hue', () => {
    expect(discColor('theo')).toBe(discColor('  THEO '));
  });
});
```

Run → FAIL (module shape doesn't exist).

- [ ] **Step 2: Rewrite avatars.ts**

```ts
/** Brand Book v1.0 §5 — no mascot, no emoji identity. A player is an initial on a
 *  color disc; the hue is hashed from the (normalized) name so it is consistent
 *  across sessions and across everyone's screens, with zero coordination.
 *  The wire field playerProfileSchema.avatar is kept for compatibility (≤64 chars)
 *  but rendering ignores it; new profiles send AVATAR_WIRE_VALUE. */

export const AVATAR_WIRE_VALUE = 'initial';

/** Brand brights with enough mutual distance; ink text passes on all of them. */
export const AVATAR_DISC_COLORS: readonly string[] = [
  '#FF6F61', // coral
  '#FFCC4D', // yellow
  '#4ECDC4', // teal
  '#5B7BFF', // cobalt
  '#B6A8FF', // lavender
  '#FF6B9D', // pink
  '#3DC97A', // green
  '#FFE08A', // soft yellow
] as const;

/** FNV-1a 32-bit — tiny, stable, good-enough spread for 8 buckets. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const normalize = (name: string): string => name.trim().toLowerCase();

export function discColor(name: string): string {
  return AVATAR_DISC_COLORS[fnv1a(normalize(name)) % AVATAR_DISC_COLORS.length]!;
}

export function initialOf(name: string): string {
  const t = name.trim();
  if (t.length === 0) return '?';
  // codePointAt keeps astral-plane leading chars (emoji) intact.
  return String.fromCodePoint(t.codePointAt(0)!).toUpperCase();
}
```

(Delete `AVATARS`, `FALLBACK_EMOJI`, `avatarEmoji`.)

- [ ] **Step 3: Run avatars test → PASS.**

- [ ] **Step 4: Rewrite the Avatar component** in `players.tsx` — new prop API takes the nickname (call sites all have `player.profile.nickname`):

```tsx
/** §5 Avatar: initial on a name-hashed brand-color disc. Ring: host = xp, "you" = brand. */
export function Avatar({ name, size = 'md', ring = null, connected }:
  { name: string; size?: keyof typeof SIZES; ring?: 'host' | 'you' | null; connected?: boolean }) {
  const { theme, tokens } = useTheme();
  const d = SIZES[size];
  const ringColor = ring === 'host' ? theme.xp : ring === 'you' ? theme.brand : 'transparent';
  return (
    <View style={{
      width: d, height: d, borderRadius: tokens.radii.pill, backgroundColor: discColor(name),
      borderWidth: ring === null ? 0 : 3, borderColor: ringColor, alignItems: 'center', justifyContent: 'center',
      opacity: connected === false ? 0.45 : 1,
    }}>
      <AppText style={{ fontSize: d * 0.46, lineHeight: d * 0.6, fontFamily: tokens.fontFamily.display, color: tokens.colors.ink }}>
        {initialOf(name)}
      </AppText>
      {connected !== undefined && (
        <View style={{
          position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6,
          backgroundColor: connected ? theme.success : theme.border, borderWidth: 2, borderColor: theme.surface,
        }} />
      )}
    </View>
  );
}
```

Imports change from `avatarEmoji` to `discColor, initialOf`. Update the in-file call sites: `PlayerCard` and `VoteCard` pass `name={player.profile.nickname}` instead of `avatarId={player.profile.avatar}`.

- [ ] **Step 5: Update index.tsx** — remove the avatar picker entirely: delete `pickerOpen` state, the `Pressable` wrapper + picker block (lines ~91–93 and ~100–108), and the `AVATARS` import. The identity card keeps the avatar (now `<Avatar name={nickDraft.trim().length > 0 ? nickDraft : profile.nickname} size="lg" ring="you" />` — using the draft means the disc/letter live-update as you type) next to the nickname input.

- [ ] **Step 6: Update profile.ts** — `randomProfile` no longer picks from `AVATARS`:

```ts
import { AVATAR_WIRE_VALUE } from '../avatars';
// ...
export function randomProfile(rng: () => number = Math.random): PlayerProfile {
  const nickname = NICKNAMES[Math.floor(rng() * NICKNAMES.length)]!;
  return { nickname, avatar: AVATAR_WIRE_VALUE };
}
```

Fix any profile test that asserted an `emoji:*` avatar id.

- [ ] **Step 7: Grep for stragglers** — `avatarEmoji|AVATARS|avatarId` across `apps/mobile` must return zero hits outside `src/dev/inAppBot.ts` / `scripts/dev-bots.mjs` (bots may keep sending any avatar string — it's ignored; simplify them to `'initial'` only if trivial).

- [ ] **Step 8: Full Tier A run + typecheck → PASS. Commit** — `feat(mobile): initial-letter avatars on name-hashed discs (§5); drop emoji picker`

---

### Task 5: Catalog re-color + 3 new brand-book modes + branded chrome

**Files:**
- Modify: `apps/mobile/src/games/catalog.ts`
- Modify: `apps/mobile/src/components/room.tsx` (RoomCodeDisplay header)
- Modify: `apps/mobile/app/index.tsx` (wordmark header)
- Test: existing catalog test if one pins colors

- [ ] **Step 1: catalog.ts** — recolor existing cards to brand palette and add the brand book's three new modes (§11) as SOON cards:

```ts
export const GAME_CATALOG: readonly GameCard[] = [
  { id: 'tracer',         name: 'Quick Vote',          tagline: 'Who fits? Tap to vote.',        emoji: '🗳️', color: '#5B7BFF', badge: 'PLAY' },
  { id: 'impostor',       name: 'The Impostor',        tagline: "Find who's faking it.",         emoji: '🕵️', color: '#FF6F61', badge: 'SOON' },
  { id: 'rank-friends',   name: 'Rank the Group',      tagline: 'Drag your squad into order.',   emoji: '🏆', color: '#FFCC4D', badge: 'SOON' },
  { id: 'hot-seat',       name: 'Hot Seat',            tagline: 'One player. Many questions.',   emoji: '🔥', color: '#FF6B9D', badge: 'SOON' },
  { id: 'who-said-that',  name: 'Who Said That?',      tagline: 'Anonymous answers. Guess who.', emoji: '🫢', color: '#4ECDC4', badge: 'SOON' },
  { id: 'truth-or-dare',  name: 'Truth or Dare',       tagline: 'Pick your poison.',             emoji: '😈', color: '#B6A8FF', badge: 'SOON' },
  { id: 'courtroom',      name: 'Courtroom',           tagline: 'Guilty or not? Group decides.', emoji: '⚖️', color: '#3DC97A', badge: 'SOON' },
  { id: 'red-flag',       name: 'Red Flag / Green Flag', tagline: 'Debate the spicy scenarios.', emoji: '🚩', color: '#E5503F', badge: 'SOON' },
  { id: 'name3',          name: 'Name 3 in 5s',        tagline: 'Blitz! Shout it out.',          emoji: '⚡', color: '#FFE08A', badge: 'SOON' },
] as const;
```

("Rank Your Friends" renamed to the book's "Rank the Group".)

- [ ] **Step 2: RoomCodeDisplay** — add the book's room-code-card header (§8) above the tiles:

```tsx
      <AppText role="overline" color="textMuted">ROOM CODE</AppText>
```

(first child inside the outer column View, before the tile row). Keep 4 plain tiles — codes stay 4 chars; the book's "BLOOP-7421" display prefix is cosmetic and can land with the share card later.

- [ ] **Step 3: Home wordmark** — in `index.tsx`, replace the `BLOOP 🫧` title line with the wordmark + coral dot (§2 "the wordmark does the work"):

```tsx
          <AppText role="displayL" style={{ textAlign: 'center', marginTop: tokens.spacing.xxl }}>
            Bloop<AppText role="displayL" color="brand">.</AppText>
          </AppText>
```

- [ ] **Step 4: tests + typecheck → PASS. Commit** — `feat(mobile): brand catalog colors + 3 new modes (§11); branded chrome`

---

### Task 6: Full verification + emulator screenshots

- [ ] **Step 1:** From `r2/bloop`: `pnpm check` (Tier A + Tier B + typecheck + billing/bundle/firewall gates) → ALL PASS. The firewall/billing gates must stay green — this plan touches only `apps/mobile`.
- [ ] **Step 2:** Reload the app on the running emulator (`bloop_pixel`, emulator-5554; Metro already running — press `r` in the Metro terminal or `adb -s emulator-5554 shell input text "RR"` via the dev menu). If Metro/wrangler died, restart: `pnpm --filter @bloop/server dev` and `pnpm --filter @bloop/mobile android`.
- [ ] **Step 3:** Screenshot Home, Lobby (with 2 bots via in-app dev bots), and a Vote screen: `adb -s emulator-5554 exec-out screencap -p > r2/bloop/docs/da/emulator-run/retheme-<screen>.png`. Eyeball: cream bg, coral CTA with hard ink shadow, Fredoka titles, initial-letter avatar discs.
- [ ] **Step 4:** Commit screenshots — `docs(da): brand book re-theme emulator screenshots`
