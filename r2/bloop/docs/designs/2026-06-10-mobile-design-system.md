# Bloop — Mobile Design System & App-Shell Design

**Date:** 2026-06-10
**Status:** Proposed (feeds Plan 3 implementation directly)
**Owners:** Théo (+ William)
**Inputs:** Architecture spec (`2026-06-09-party-game-platform-architecture-design.md`), engine contract (`packages/engine/src/types.ts`), tracer reference game (`packages/games/tracer`), wire protocol (`packages/protocol/src/messages.ts`), moodboards (`docs/da/moodboard-1-aesthetic-reference.png`, `docs/da/moodboard-2-visual-ingredients.png`).

This document is the authoritative visual + structural contract for the Plan 3 app shell. It does not modify any existing file. Where it touches code shapes (tokens, theme module, navigation), those are targets for implementation, not yet-built files.

---

## 0. North Star

The moodboards declare it explicitly at the bottom of both pages: **Fun · Social · Expressive · Inclusive · Easy to Learn.** Every token, component, and screen below is judged against that line. Bloop is a thing you hand a stranger at a party and they "get it" in three seconds, on their own phone, with no account and no tutorial.

Design constraints inherited from the architecture (non-negotiable, they shape the UI):

- **2–16 players, same room, each on their own phone.** Layouts must read at arm's length and survive 16 avatars in a lobby.
- **Fully anonymous forever.** No photos, no real names — avatars are preset, nicknames are device-local. The avatar system (§5) is a hard product requirement, not decoration.
- **Rooms via 4-char code / QR.** The room-code display and QR are first-class hero components, not utility text.
- **Ads between rounds.** There is a dedicated interstitial slot screen in the shell (§4) — the design must make the ad feel like a deliberate "intermission," not a failure state.
- **Server-side profanity filter on all player text.** Nickname entry and any future text-entry game need an inline "rejected, try again" affordance.
- **Short rounds / party pacing.** Motion is snappy (150–250ms), timers are visible, reveals are simultaneous and loud.
- **`phaseKey(state): string` is coming** (known contract gap). The shell will use it to detect phase transitions generically and drive transition animations + the "should we show an ad now?" decision. The design assumes a `phaseKey` exists; see §4.5.

---

## 1. Chosen Aesthetic Direction

### Primary: **Balanced Bubblegum** as the structural base, with **Sticker Pop** as the accent/celebration layer.

**Justification (3 sentences):** The boards themselves point here — direction 1 ("Balanced Bubblegum") is described as *"clean, friendly, and just the right amount of playful,"* which is exactly the readable, inclusive, easy-to-learn baseline a 2-to-16-person same-room app needs so 16 avatars and a room code never turn into visual noise. Sticker Pop supplies the high-energy, cut-out, "CHALLENGE ACCEPTED / DARE MODE" burst language that the reveal and badge moments demand, and crucially it reuses the *same* bright primary palette and rounded geometry as Bubblegum, so it layers on top rather than fighting it. The other four directions are either too quiet for a party (Soft Clay), too niche/illustrative to scale across many unknown future games (Comic Doodle), too chaotic as a full system (Memphis Party — we borrow its confetti as a motion accent only), or are reserved for a mode rather than the default (Night Pop Lite).

**One-line rule for the team:** *Bubblegum is the room you live in; Sticker Pop is what happens when something exciting fires.* Default surfaces, lobby, settings, and navigation are Bubblegum-clean. Reveals, win states, badge unlocks, "Dare Mode," and the round-win celebration get the Sticker Pop sticker/burst treatment (hard outlines, slight rotation, pop-in spring, confetti).

### Secondary modes

- **Night Pop Lite → dark/evening mode (Plan 4+, designed-for now).** Direction 6 is explicitly *"nighttime energy with deep tones and vibrant pops."* It is not a separate aesthetic — it is the same component set re-themed onto the dark navy neutral (`#10142A` family) with the accent palette pushed to higher saturation/glow. Because all tokens flow through a single theme module (§6), shipping a `dark` theme later is a token-swap, not a redesign. We reserve the navy now and keep all contrast ratios passing on both themes so the dark mode is a config flip, not a rebuild.
- **Memphis Party → motion-accent only.** We harvest its confetti/squiggle/dot energy for the celebration motion layer (§2.7) but do not adopt its full geometric-poster system as a base — it's too busy under 16 simultaneous avatars.

---

## 2. Design Tokens (TypeScript)

These are the source of truth. They become the theme module in §6 (`apps/mobile/src/theme/`). Hex values are sampled/approximated from the two boards — Bubblegum primary row, Sticker Pop accents, and board-2 "Color Systems" (Primary / Accent / Neutrals incl. the dark navy).

### 2.1 Color palette

```ts
// apps/mobile/src/theme/colors.ts

/** Raw, theme-agnostic palette sampled from the moodboards. */
export const palette = {
  // --- Primary (Bubblegum brights, board-2 "Primary Palette" row) ---
  blurpleberry: '#5B6CFF', // the Bloop logo / primary brand blue-violet
  bubblegum:    '#FF5DA2', // hot pink — "Join", energy
  tangerine:    '#FF7A3C', // orange — Sticker Pop "Dare", warmth
  sunbeam:      '#FFC23C', // golden yellow — XP, badges, stars
  limeade:      '#6FD66B', // fresh green — "Truth", success
  aqua:         '#36C5D0', // teal — secondary actions, calm accent

  // --- Accent (board-2 "Accent Palette", softer pops) ---
  skyMist:      '#8FD3F4', // soft sky
  lilac:        '#C3A7FF', // lavender
  blush:        '#FFB3C9', // soft pink tint
  mint:         '#BFE9C8', // soft mint
  butter:       '#FFE39A', // soft yellow

  // --- Neutrals (warm paper → ink, board-2 "Neutrals" row) ---
  paper:        '#FFF9F0', // app background, warm off-white (NOT pure white)
  cloud:        '#FFFFFF', // raised card surface
  fog:          '#F1ECE3', // subtle fills, disabled, dividers
  pebble:       '#D9D2C7', // borders on paper
  slate:        '#8A8478', // muted text / icons
  graphite:     '#4A4742', // secondary text
  ink:          '#23201C', // primary text on light

  // --- Dark navy family (board-2 dark swatch → reserved for Night Pop Lite) ---
  midnight:     '#10142A', // dark-mode background base
  abyss:        '#0A0D1F', // dark-mode deepest
  navySurface:  '#1B2147', // dark-mode raised card
  navyBorder:   '#2C3566', // dark-mode hairline

  // --- Semantic singletons ---
  success:      '#3FB75E',
  warning:      '#FF9F1C',
  danger:       '#F4453E',
  white:        '#FFFFFF',
  black:        '#000000',
  stickerLine:  '#1A1714', // the hard near-black outline on Sticker Pop elements
} as const;

export type PaletteColor = keyof typeof palette;
```

```ts
// apps/mobile/src/theme/themes.ts
// Semantic tokens — components reference THESE, never raw palette.

export interface ColorTheme {
  bg: string;            // screen background
  surface: string;       // card / sheet
  surfaceAlt: string;    // nested / inset surface
  border: string;        // hairline / card outline
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnBrand: string;   // text on a brand-filled button

  brand: string;         // primary brand (Join Game)
  brandPressed: string;
  accent: string;        // secondary brand (Invite Friends)
  truth: string;         // category chip "Truth"
  dare: string;          // category chip "Dare" / Dare Mode
  xp: string;            // progress / XP bar fill
  success: string;
  danger: string;
  warning: string;

  // Sticker Pop layer
  stickerOutline: string;
  burst: string;         // confetti/burst base
}

export const lightTheme: ColorTheme = {
  bg: palette.paper,
  surface: palette.cloud,
  surfaceAlt: palette.fog,
  border: palette.pebble,
  textPrimary: palette.ink,
  textSecondary: palette.graphite,
  textMuted: palette.slate,
  textOnBrand: palette.white,

  brand: palette.blurpleberry,
  brandPressed: '#4655E6',
  accent: palette.aqua,
  truth: palette.limeade,
  dare: palette.tangerine,
  xp: palette.sunbeam,
  success: palette.success,
  danger: palette.danger,
  warning: palette.warning,

  stickerOutline: palette.stickerLine,
  burst: palette.bubblegum,
};

// Night Pop Lite — reserved, shippable as a token swap (see §1).
export const darkTheme: ColorTheme = {
  bg: palette.midnight,
  surface: palette.navySurface,
  surfaceAlt: palette.abyss,
  border: palette.navyBorder,
  textPrimary: '#F4F2FF',
  textSecondary: '#C6C9E8',
  textMuted: '#8B90C0',
  textOnBrand: palette.white,

  brand: '#7B8AFF',      // brighter on dark
  brandPressed: '#6675FF',
  accent: '#46D6E0',
  truth: '#7CE87A',
  dare: '#FF8C4D',
  xp: '#FFD24D',
  success: '#5BD17A',
  danger: '#FF5A52',
  warning: '#FFB13C',

  stickerOutline: '#000000',
  burst: '#FF6FB0',
};
```

**Contrast notes (enforced):** `paper (#FFF9F0)` + `ink (#23201C)` ≈ 14:1 (AAA). The brights (`bubblegum`, `tangerine`, `sunbeam`) are used as *fills behind dark or white text chosen per-fill*, never as text on `paper`. `sunbeam (#FFC23C)` and `limeade (#6FD66B)` always carry `ink` text (white-on-yellow fails). `blurpleberry` and `bubblegum` carry `white` text. See §6 accessibility for the lint rule.

### 2.2 Spacing scale

4px base grid. Party UI is touch-first at arm's length, so the rhythm is generous.

```ts
// apps/mobile/src/theme/spacing.ts
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,   // default gutter
  xl: 20,
  xxl: 24,  // section gap
  xxxl: 32,
  huge: 40,
  giant: 56,
} as const;

// Screen edge gutter and min touch target are constants, not ad-hoc.
export const layout = {
  screenPadding: spacing.lg,   // 16
  cardPadding: spacing.xl,     // 20
  minTouchTarget: 48,          // accessibility floor (see §6)
  maxContentWidth: 480,        // tablet / large phone clamp
} as const;
```

### 2.3 Radii (rounded / pill language)

Board 2 lists *"Rounded Corners · Pills & Buttons"* as core shapes. Everything is round; primary actions are full pills.

```ts
// apps/mobile/src/theme/radii.ts
export const radii = {
  none: 0,
  sm: 8,
  md: 14,    // chips, small tiles
  lg: 20,    // cards (the default card radius)
  xl: 28,    // hero cards, sheets
  xxl: 36,   // large modal / room-code panel
  pill: 999, // buttons, avatars chips, badges
} as const;
```

### 2.4 Type scale + font strategy

`"Bloop Grotesk"` does not exist. Strategy:

- **Display / headings → `Baloo 2`** (Google Fonts, free, OFL). It is a rounded, friendly, chunky display family that matches the board-2 "Display Font" sample (`Bloop Grotesk — AaBbCc`, rounded + bold). Loaded via `@expo-google-fonts/baloo-2` (weights 600/700/800). This is the closest free, production-grade stand-in for the bespoke wordmark feel. (Alternates if Baloo 2 reads too heavy: `Fredoka` or `Nunito` 800 — both free, both rounded.)
- **UI / body → `Inter`** (board-2 explicitly names *"Inter SemiBold"* for headings/UI and *"Inter Regular"* for body). Loaded via `@expo-google-fonts/inter`.
- **The wordmark/logo** ("BLOOP") stays a static SVG/PNG asset (the sticker-outlined logo from the boards), never live text — so the font substitution never touches the brand mark.

```ts
// apps/mobile/src/theme/typography.ts
export const fontFamily = {
  display: 'Baloo2_800ExtraBold',  // hero numbers, screen titles, "BLOOP!" shouts
  displaySemi: 'Baloo2_600SemiBold',
  ui: 'Inter_600SemiBold',         // buttons, labels, list items
  body: 'Inter_400Regular',        // paragraphs, helper text
  bodyMedium: 'Inter_500Medium',
} as const;

export const type = {
  // role:        { size, lineHeight, family, letterSpacing }
  displayXL: { fontSize: 48, lineHeight: 52, fontFamily: fontFamily.display, letterSpacing: 0.5 }, // room code, win score
  displayL:  { fontSize: 36, lineHeight: 40, fontFamily: fontFamily.display, letterSpacing: 0.3 },
  titleL:    { fontSize: 28, lineHeight: 34, fontFamily: fontFamily.display, letterSpacing: 0 },   // screen titles
  titleM:    { fontSize: 22, lineHeight: 28, fontFamily: fontFamily.displaySemi },
  headline:  { fontSize: 18, lineHeight: 24, fontFamily: fontFamily.ui },
  body:      { fontSize: 16, lineHeight: 24, fontFamily: fontFamily.body },
  bodyStrong:{ fontSize: 16, lineHeight: 24, fontFamily: fontFamily.bodyMedium },
  label:     { fontSize: 14, lineHeight: 18, fontFamily: fontFamily.ui, letterSpacing: 0.2 },       // chips, buttons
  caption:   { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.body },
  overline:  { fontSize: 11, lineHeight: 14, fontFamily: fontFamily.ui, letterSpacing: 1.2 },       // ALL-CAPS tags
} as const;
```

### 2.5 Shadow / elevation

Light theme uses soft, warm, low-spread shadows (Bubblegum = clean, not heavy). Sticker Pop elements get a *hard offset* shadow (no blur) to read as cut-out stickers.

```ts
// apps/mobile/src/theme/elevation.ts
export const elevation = {
  none: {},
  // Soft card shadows (iOS shadow* + Android elevation)
  e1: { shadowColor: '#3A2E1E', shadowOpacity: 0.06, shadowRadius: 6,  shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  e2: { shadowColor: '#3A2E1E', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  e3: { shadowColor: '#3A2E1E', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  // Sticker Pop hard shadow — no blur, hard offset, reads as a cut sticker.
  sticker: { shadowColor: '#1A1714', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
} as const;
```

### 2.6 Border / outline language

Sticker Pop uses a 2–3px hard outline (`stickerOutline`). Bubblegum cards use a 1px hairline (`border`) or no border + `e1`. Two named patterns so the team is consistent:

```ts
export const outline = {
  hairline: { borderWidth: 1, borderColor: 'border' },            // resolves via theme
  sticker:  { borderWidth: 3, borderColor: 'stickerOutline' },    // Sticker Pop only
} as const;
```

### 2.7 Motion — durations & easings

Board 2 "Texture & Motion Cues" names exactly five motions: **Pop · Bounce · Slide · Pulse · Float.** These become the motion vocabulary, implemented with `react-native-reanimated` (springs) + `Easing`.

```ts
// apps/mobile/src/theme/motion.ts
import { Easing } from 'react-native-reanimated';

export const duration = {
  instant: 80,
  fast: 150,    // chip select, button press
  base: 220,    // default enter/leave, phase cross-fade
  slow: 320,    // sheet, modal
  reveal: 480,  // vote reveal, score count-up
  celebrate: 900, // confetti / win burst lifetime
} as const;

export const easing = {
  // standard UI motion
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
  // playful overshoot for "pop"
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

// Named spring presets map 1:1 to the board's five motion cues.
export const spring = {
  pop:    { damping: 12, stiffness: 320, mass: 0.7 }, // scale 0.6→1, button/sticker entrance
  bounce: { damping: 9,  stiffness: 180, mass: 0.9 }, // avatar join, badge land
  slide:  { damping: 20, stiffness: 240, mass: 1   }, // sheets, screen-to-screen content
  pulse:  { damping: 6,  stiffness: 120, mass: 0.6 }, // timer ring "hurry up", live dot
  float:  { damping: 8,  stiffness: 40,  mass: 1.2 }, // idle hero / mascot bob (looped)
} as const;
```

**Motion rules:**
- Every interactive element uses `pop` on press (scale to ~0.96 down, spring back).
- Avatars entering the lobby use `bounce` (they "land").
- Phase transitions (driven by `phaseKey` change, §4.5) cross-fade content at `duration.base` and slide the new phase in with `slide`.
- The timer ring `pulse`s in its final 5 seconds and shifts toward `danger`.
- Reveal moments fire confetti (`celebrate`) — borrowed from Memphis Party energy.
- **Honor `prefers-reduced-motion`** (`AccessibilityInfo.isReduceMotionEnabled`): springs collapse to a 120ms fade, confetti is suppressed. See §6.

---

## 3. Component Inventory (mapped from the boards)

Components live in `apps/mobile/src/components/`. Each maps to a specific board element. All consume tokens from §2 via the theme hook (§6). Naming is from board-2 "UI Component Snippets."

| Component | Board source | Spec |
|---|---|---|
| **`PrimaryButton`** ("Join Game") | Board 2, snippet "Primary Button: Join Game" (filled blurple pill) | Full pill (`radii.pill`), `brand` fill, `Inter SemiBold` label in `textOnBrand`, `elevation.e2`, `pop` on press. Loading + disabled states. Min height 56. Optional leading icon. |
| **`SecondaryButton`** ("Invite Friends") | Board 2, snippet "Secondary Button: Invite Friends" (outlined pill) | Pill, transparent/`surface` fill, 2px `brand` border, `brand` label. Same press motion. Used for share/invite, "Maybe later." |
| **`StickerButton`** | Board 1 Sticker Pop "Join" / "Dare" | Pill with `outline.sticker` + `elevation.sticker`, slight rotation (-2°), `pop` entrance. For celebratory CTAs only (e.g. "LET'S BLOOP!"). |
| **`Avatar`** | Board 2 Mascot Directions + Player Card | Circular, preset emoji/mascot (see §5), size variants `sm 32 / md 48 / lg 72 / hero 112`. Optional ring (host = `sunbeam` ring, "you" = `brand` ring), connection dot. |
| **`PlayerCard`** | Board 2 "Player Card: DJ Bloop + Online" | Row: `Avatar md` + nickname (`bodyStrong`) + status (`Online`/`grey`) + optional host crown + optional kick affordance (host only). `e1`, `radii.lg`. |
| **`PlayerRow` / `SquadList`** | Board 1 "Your Squad" (avatar cluster) | Horizontal avatar cluster for compact display (lobby header, results); wraps to grid for the full lobby. Handles 2–16 with graceful "+N" overflow chip. `bounce` on join. |
| **`RoomCodeDisplay`** | Room code is core to join flow | Hero panel: 4 chars in `displayXL`, each char in its own rounded tile (`surface`, `radii.lg`), kerned. Tap-to-copy with toast. Subtitle "Tap to copy." |
| **`QRPanel`** | Join via QR (spec §6) | `RoomCodeDisplay` + generated QR (room deep link `bloop://join/ABCD`) on `cloud` card, `radii.xl`. The reverse (scanner) is `QRScanner` using `expo-camera` (§4). |
| **`CategoryChip`** ("Truth / Dare") | Board 1 Comic Doodle "Truth / Dare", Board 2 "Category Chip: Truth · Dare · Would You" | Pill chip, `radii.pill`, two visual states. `truth` = green fill, `dare` = orange fill, neutral = `surfaceAlt`. Selectable (multi/single). `pop` select. Used for game-mode/category selection per game. |
| **`QuickMatchTile`** / **`GameTile`** | Board 1 "Quick Play / Quick Match", Board 6 "Quick Match" | Large rounded tile, game art/icon, title (`titleM`), player-count meta ("2–8 players"), lightning glyph for Quick. `radii.xl`, `e2`, `pop`. The home grid is these. |
| **`ProgressBar` / `XPBar`** | Board 1 "Level Up! +120 XP", Board 2 "Progress Bar + XP" | Rounded track (`surfaceAlt`) + `xp` (sunbeam) fill, animated width (`slide`), optional `+XP` floating label that `bounce`s on gain. |
| **`Badge`** ("Dare Mode") | Board 1 "Dare Mode", Board 2 "Mode Badge: DARE MODE" | Sticker-styled tag: `dare` fill, `outline.sticker`, `overline` ALL-CAPS label, slight rotation. Generic enough for any unlock ("HOT SEAT", "EPIC", "NO FILTER" from Sticker Pop board). `pop` on award. |
| **`TimerRing`** | Party pacing / phase deadlines (`deadlineAt` in protocol) | Circular SVG progress ring driven by `deadlineAt` from the `view` message. Counts down, `pulse`s + recolors to `danger` in final 5s. Center shows seconds in `displayL`. Reduced-motion → numeric only. |
| **`VoteCard`** | Tracer game vote phase / Board "vote" UIs | Tappable card = a target player (`Avatar` + nickname). Selected = `brand` ring + checkmark. Disabled after `myVote` set. Maps directly to tracer `view.hasVoted` / `myVote`. |
| **`RevealCard`** | Tracer reveal phase, Sticker Pop reveal energy | Flips/pops to show tally; vote counts count-up (`reveal` duration); winner gets confetti + `Badge`. Simultaneous across phones (server broadcasts reveal atomically per spec §6). |
| **`Modal` / `BottomSheet`** | Board's rounded surfaces | `radii.xxl` top corners, `slide` up, scrim `ink @ 40%`, drag-to-dismiss. Used for: consent, settings, confirm-leave, host kick confirm, error recovery. |
| **`Toast` / `Banner`** | Lightweight feedback | Top inset pill toast (`e2`, `pop` in / fade out, 2.5s). Variants: success (limeade), info (aqua), error (danger). Used for "Code copied," profanity rejection, reconnecting. |
| **`Mascot`** | Board 2 Mascot Directions, Board 3/Soft Clay blob ("Bloop") | The Bloop character (friendly blob, see §5). Reused as empty-state, loading (`float` bob), and reveal reactions. |
| **`ConfettiBurst`** | Board 5 Memphis Party + Sticker Pop bursts | Reanimated particle burst (`celebrate`), fired on wins/unlocks. Suppressed under reduced motion. |
| **`ConsentSheet`** | Spec §2/§8 (AdMob UMP / ATT) | Bottom sheet wrapping Google UMP form trigger + plain-language summary, with a settings re-entry (§4.7). |
| **`AdInterstitialScreen`** | Spec "interstitial ad slot between rounds" | Full-screen "intermission" container hosting the AdMob interstitial; see §4.5. |

### 3.1 Iconography

Board 2 "Icon Language" names the set: **People · Party · Games · Trophy · Rewards · Chat · Lightning · Fire · Star · Crown · Heart · Smiley · Shuffle · Plus · Check · Info.** Implement as a single `Icon` component backed by a curated icon font/SVG set (recommend `lucide-react-native` for the UI-utility icons, plus a small custom SVG set for the playful party glyphs — fire, crown, lightning — to match the board's filled/rounded style). One `name` union type, one `size`/`color` prop, color resolved from theme.

---

## 4. Screen Map — App Shell (Plan 3 scope)

The shell is the "backbone v0 build list" UI from spec §8: lobby, version handshake feedback, ads, settings/consent — plus the home and join surfaces. It renders per-game screens generically from `ClientView` (the redacted `view` message). It is onboarding-less: first launch goes straight to Home with an inline nickname+avatar picker.

### 4.1 Navigation structure (`expo-router`)

File-based routing. Single stack with a few modal routes. No tab bar (party app is a linear flow, not a content app).

```
apps/mobile/app/
  _layout.tsx                 # Root: ThemeProvider, fonts, SafeArea, AdMob+UMP init, Sentry
  index.tsx                   # HOME (nickname+avatar picker, Quick Match grid, Create / Join)
  create.tsx                  # CREATE ROOM (POST /rooms → code) → routes to lobby
  join/
    index.tsx                 # JOIN hub (Scan QR | Enter code)
    scan.tsx                  # QR SCANNER (expo-camera)            [modal-ish, full screen]
  room/
    [code]/
      _layout.tsx             # Room session provider: PartySocket, hello handshake, reconnect
      lobby.tsx               # LOBBY (squad list, host controls, game picker)
      play.tsx                # GAME CONTAINER (renders per-game screen from ClientView)
      interstitial.tsx        # BETWEEN-ROUNDS AD SLOT (intermission)
      results.tsx             # ROUND/GAME RESULTS (scores, rematch)
  settings/
    index.tsx                 # SETTINGS (consent mgmt entry, nickname, sound, about) [modal]
  modal/
    upgrade.tsx               # UPGRADE_REQUIRED (OTA update gate)  [full-screen modal]
    error.tsx                 # generic recoverable error / room-gone [modal]
```

**Why no onboarding:** spec mandates anonymous, no accounts; the fastest path to "playing with friends" is Home → pick avatar inline → Create/Join. The nickname+avatar picker is a card on Home, persisted to device storage (`expo-secure-store`/`AsyncStorage`), editable later in Settings.

### 4.2 HOME (`index.tsx`)

- Bloop wordmark (static asset) + `float`ing `Mascot`.
- **Identity card** (top): current `Avatar hero` + nickname; tap → inline editor (avatar grid + text field with live profanity check). This is the only "onboarding."
- **Quick Match grid**: `QuickMatchTile` / `GameTile`s (board "Quick Play / Quick Match"). In Plan 3 this lists the available games (tracer first; the 4 upcoming games slot in as tiles via the KV catalog manifest).
- Primary `PrimaryButton` "Create Room" + `SecondaryButton` "Join with Code."
- Footer: tiny Settings gear → `settings/`.

### 4.3 CREATE (`create.tsx`)

Optional pre-create choices (which game / category chips), then `POST /rooms` → receives 4-char code → navigates to `room/[code]/lobby` as host. Shows `RoomCodeDisplay` immediately so the host can read the code aloud while it routes.

### 4.4 JOIN (`join/index.tsx`, `join/scan.tsx`)

- **`join/index`**: two big choices — **Scan QR** (`PrimaryButton`, camera glyph) and **Enter Code** (4-tile code input, auto-advance, auto-uppercase, validates length). On submit → WS connect with `hello` (carries `{nickname, avatar, protocolVersion, reconnectToken}` per protocol).
- **`join/scan`**: `expo-camera` `CameraView` with barcode scanning (`qr`). On scan of `bloop://join/ABCD`, parse code → join. Permission-denied state offers fallback to code entry. Torch toggle. Frame overlay + scan-line (`slide`).

### 4.5 GAME CONTAINER + INTERSTITIAL — the generic per-game renderer

This is the load-bearing shell piece. The server sends `{ type:'view', gameId, view, deadlineAt }` (protocol §). The container:

1. Looks up the **client renderer** for `gameId` from a **game registry** (`apps/mobile/src/games/registry.ts`) — each upcoming game ships a client package exporting a typed `<GameScreen view={...} deadlineAt={...} onAction={...} />`. The shell knows nothing game-specific; it just routes the redacted view to the matching renderer. This is where **each of the 4 upcoming games plugs in**: add a game package (server reducer + client screen + content pack), register the client screen under its `gameId` here and the server reducer in the KV catalog (spec §4 "Adding a game"). No shell change.
2. Wraps the game screen with shared chrome: `TimerRing` (driven by `deadlineAt`), score `PlayerRow`, leave/host affordances.
3. **Phase-transition + ad decision via `phaseKey`** (the known contract gap): the shell tracks `phaseKey(state)` deltas. On a phase change it plays the transition motion (§2.7). When `phaseKey` crosses a *round boundary* (e.g. `reveal:N` → `vote:N+1`, or game-over), the shell consults remote-config ad frequency caps and, if due, routes to **`interstitial.tsx`** before mounting the next phase. This keeps the "ad between rounds" rule (spec §5/§8) entirely in the shell, generic across all games. Until `phaseKey` lands, the shell falls back to detecting `gameOver`/round increments from the view payload — but `phaseKey` is the designed-for path and the registry contract assumes it.

```ts
// apps/mobile/src/games/registry.ts  (shape only)
export interface GameClient<View, Action> {
  gameId: string;
  Screen: React.ComponentType<{
    view: View;
    deadlineAt: number | null;
    onAction: (a: Action) => void;
  }>;
  // optional: map a phaseKey to a transition style / "is this a round boundary?"
  isRoundBoundary?(prevPhaseKey: string, nextPhaseKey: string): boolean;
}
export const gameRegistry: Record<string, GameClient<unknown, unknown>> = {
  tracer: tracerClient,
  // <game-2>, <game-3>, <game-4>, <game-5> plug in here
};
```

### 4.6 INTERSTITIAL (`room/[code]/interstitial.tsx`)

The "intermission" screen, designed so the ad feels intentional:
- Branded background (Bubblegum), `Mascot` `float`ing, "Next round in a sec…" copy, a round-progress indicator (Round 2 of 5).
- Hosts the AdMob interstitial (`react-native-google-mobile-ads`). On ad close / no-fill / consent-declined, auto-advances to the next phase.
- Frequency-capped via remote config (spec §5). Never blocks gameplay correctness — the server state has already advanced; the screen is purely a client-side gate before re-mounting the game container.

### 4.7 LOBBY (`room/[code]/lobby.tsx`)

- Hero `RoomCodeDisplay` + `QRPanel` ("Invite Friends" via `SecondaryButton` → native share sheet of the deep link).
- **Squad list**: `PlayerCard` grid for all connected players (`bounce` as each joins), host gets a crown, "you" is ringed. Greyed seats for disconnected-in-grace players (spec §6 reconnect).
- **Host controls** (only if `isHost` from the `lobby` message): game picker (`GameTile`s / `CategoryChip`s), kick (`PlayerCard` affordance → confirm modal — note: kick is a Plan 2 message deferral per protocol comment, so the UI is present-but-gated by capability), and the big `PrimaryButton` "Start Game" (sends `startGame {gameId}`).
- Non-hosts see "Waiting for host to start…" with a `float`ing mascot.

### 4.8 RESULTS (`room/[code]/results.tsx`)

Final scoreboard: ranked `PlayerCard`s, winner gets `ConfettiBurst` + `Badge`, XP bar gains animate. CTAs: "Play Again" (rematch → back to lobby/next game) and "Leave."

### 4.9 SETTINGS (`settings/index.tsx`)

- Edit nickname + avatar (same inline editor as Home).
- Sound/haptics toggles.
- **Consent management entry** (spec §8 compliance): "Privacy & Ads" → re-opens the UMP consent form (`AdsConsent`) + ATT status; plain-language "no accounts, nothing stored about you on our servers" copy (spec §11 honest framing).
- About / version / report-a-problem (links the report endpoint, spec §8 moderation).

### 4.10 UPGRADE / ERROR modals

- **`modal/upgrade`**: triggered by `UPGRADE_REQUIRED` error code (protocol). Friendly "Bloop got an update!" → runs `Updates.fetchUpdateAsync()` + `reloadAsync()`, then rejoins (spec §6 handshake).
- **`modal/error`**: room gone / connection lost / server error. Mascot + "That room popped!" + "Back to Home." Maps `ROOM_FULL`, `BAD_MESSAGE`, generic disconnect.

---

## 5. Avatar System (anonymous-friendly)

**Hard requirement from architecture:** fully anonymous, no photos, nickname + avatar stored on-device only. So avatars are a **fixed preset library**, not user uploads.

### Design

- **Bloop characters (mascot set):** the primary avatars are a roster of the "Bloop" mascot in variations — drawing on board-2 "Mascot Directions" (Friendly & Chill, Bold & Social, Witty & Smart, Creative & Quirky) and the Soft Clay blob. A curated set of ~24–36 mascots: different colors (from the bright palette), expressions (board's expression range: smiley / cool / surprised / heart-eyes / etc.), and simple accessories (cap, glasses, headphones — echoing "DJ Bloop"). Each is a flat SVG asset, theme-tinted where possible so they read on both light and Night Pop Lite backgrounds.
- **Emoji fallback / quick pick:** a parallel preset of expressive emoji-style faces for users who want a one-tap pick. Both live in one picker grid.
- **Identity model:** the avatar is stored as a **stable string id** (e.g. `"bloop:cap-aqua"` or `"emoji:partyface"`), which is exactly what the protocol expects — `playerProfileSchema.avatar: z.string().max(64)`. The `Avatar` component resolves the id → asset. No image bytes ever cross the wire; the receiving phones already have the asset bundle, so 16 avatars cost 16 short strings.
- **Color/ring semantics:** host = `sunbeam` ring + crown; "you" = `brand` ring; disconnected = desaturated + grey dot. Consistent across lobby, game, results.
- **Picker UX:** grid of mascots + emoji, `pop` on select, randomize-shuffle button (board "Shuffle" icon) for instant anonymous identity. Default on first launch = a random mascot + a random fun nickname suggestion (still editable, still profanity-checked).

### Asset pipeline

Avatars ship in the app bundle (so they work offline and cost nothing on the wire) and are versioned with the app. New avatars are an OTA-able asset drop (EAS Update). Mascot art is the one place we'll need real illustration work — the board's mascot directions are the brief.

---

## 6. Expo Implementation Notes

### 6.1 Package choices

| Concern | Package | Why |
|---|---|---|
| Navigation | **`expo-router`** | File-based, matches §4.1; deep-link (`bloop://join/ABCD`) support for QR/share is first-class. |
| Animation | **`react-native-reanimated`** (+ `react-native-gesture-handler`) | Implements the five motion cues (§2.7) on the UI thread; springs for pop/bounce/float, worklets for the timer ring and confetti. |
| QR scan | **`expo-camera`** (`CameraView`, `barcodeScannerSettings: { barcodeTypes: ['qr'] }`) | Scanner for join; permissions handled via Expo. |
| QR generate | **`react-native-qrcode-svg`** | Renders the room deep-link QR in the lobby/`QRPanel`. |
| Fonts | **`@expo-google-fonts/baloo-2`**, **`@expo-google-fonts/inter`** + `expo-font` | Display (Baloo 2) + UI (Inter) per §2.4; loaded at root with a splash hold. |
| Icons | **`lucide-react-native`** + custom SVG party glyphs | Icon language §3.1. |
| Storage | **`@react-native-async-storage/async-storage`** (+ `expo-secure-store` for reconnectToken) | Device-local nickname/avatar/reconnectToken (anonymous, on-device only). |
| Ads + consent | **`react-native-google-mobile-ads`** | Interstitials + `AdsConsent` (UMP) + ATT (spec §5); requires dev builds (already needed). |
| Realtime | **`partysocket`** | Auto-reconnect WS client to the RoomDO (spec §3). |
| Validation | **`zod`** (via `@bloop/protocol`) | Shared wire types — client renders only typed `ClientView`s; the import firewall (spec §4 rule 3) forbids importing game *server* logic. |
| Analytics/crash | **PostHog RN**, **`@sentry/react-native`** | Anonymous events + crash, PII scrubbing on (spec §3/§8). |
| OTA | **`expo-updates`** | `UPGRADE_REQUIRED` flow + staged rollout (spec §6/§8). |

### 6.2 Tokens → theme module

```
apps/mobile/src/theme/
  colors.ts        # palette (raw) + lightTheme/darkTheme (semantic) — §2.1
  spacing.ts       # spacing + layout — §2.2
  radii.ts         # §2.3
  typography.ts    # fontFamily + type scale — §2.4
  elevation.ts     # shadows — §2.5
  motion.ts        # duration/easing/spring — §2.7
  index.ts         # `export const tokens = { colors, spacing, radii, type, elevation, motion }`
  ThemeProvider.tsx# React context: { theme: ColorTheme, mode: 'light'|'dark', tokens }
  useTheme.ts      # hook → typed theme + tokens
```

- **`ThemeProvider`** holds the active `ColorTheme` (light now; `darkTheme`/Night Pop Lite is a swap, defaulting to light in Plan 3, with a hook for system `Appearance` + a Settings override later).
- Components call `const { theme, tokens } = useTheme()` and never reference raw `palette` directly — that's what makes the Night Pop Lite swap a one-line change.
- **Styling approach:** `StyleSheet.create` factories that take `theme` (or a thin styled helper). Avoid heavy CSS-in-JS at party scale; keep it RN-native for perf on the 16-phone low-end devices.
- Semantic color names (`brand`, `truth`, `dare`, `xp`) are resolved in `outline`/`elevation` helpers via the theme, so the §2.6 `outline.hairline = { borderColor: 'border' }` strings resolve at component time.

### 6.3 Accessibility

- **Contrast:** all text/background pairs target WCAG AA (4.5:1 body, 3:1 large). The bright fills are a known trap — encode the safe pairings in tokens (e.g. a `onColor(fill)` helper returning `ink` for `sunbeam`/`limeade`/`butter` and `white` for `blurpleberry`/`bubblegum`/`tangerine`) and add a **CI/lint check** that flags any `<Text>` placed on a bright fill without going through the helper. The §2.1 contrast notes are the spec for this check.
- **Dynamic Type:** the `type` scale uses `fontSize`/`lineHeight` pairs; respect OS font scaling via `allowFontScaling` (default on) with `maxFontSizeMultiplier` clamps on tight chrome (timer, code tiles) so layouts survive XXL accessibility sizes. Test at 130% and 200%.
- **Touch targets:** `layout.minTouchTarget = 48` is the floor for every interactive element (buttons, chips, avatars-as-vote-targets).
- **Reduced motion:** read `AccessibilityInfo.isReduceMotionEnabled`; springs collapse to a 120ms cross-fade, `ConfettiBurst`/`pulse` suppressed, `TimerRing` shows numerals only. The `motion.ts` presets are gated behind a `useMotion()` hook that returns no-op springs when reduced motion is on.
- **Screen readers:** every `Avatar`/`PlayerCard` has an `accessibilityLabel` (nickname + role + connection). The room code is announced char-by-char. Vote cards announce "Vote for {nickname}, {state}."
- **Color independence:** never rely on color alone — host has crown + ring, "you" has ring + label, truth/dare chips carry text labels, timer urgency adds the `pulse` + numeral, not just red.
- **Tap-to-copy & large code:** the room code is `displayXL` precisely so it reads across a noisy room; copy + share reduce manual entry errors.

---

## 7. Open items handed to Plan 3 implementation

1. **`phaseKey(state): string`** must be added to the engine contract (it is the designed-for path for §4.5 transitions + ad gating). Until then the shell uses a documented fallback.
2. **Mascot illustration set** (§5) is the one external art dependency — brief = board-2 Mascot Directions; deliver ~24–36 SVGs + an emoji preset.
3. **Game client registry contract** (§4.5) — finalize the `GameClient` interface alongside the first non-tracer game so the 4 upcoming games have a stable plug-in shape.
4. **Night Pop Lite** ships as a theme swap post-Plan-3; keep both themes contrast-passing from day one so it stays a config flip.
5. **Wordmark + key art** ("BLOOP" sticker logo) as static assets, never live font.
