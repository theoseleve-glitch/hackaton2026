# Bloop Plan 3a — Expo App Shell: Theme, Lobby Flow, Tracer Playable on the Emulator

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first visible vertical slice of the mobile app, against `docs/designs/2026-06-10-mobile-design-system.md`: (1) an **Expo SDK 55 app** at `apps/mobile` (pnpm workspace, expo-router, TS strict); (2) the **theme module** implementing the design doc's tokens hex-for-hex (light theme live; dark reserved); (3) **Home → Lobby → Game** screens rendering tracer end-to-end from per-player `view` messages; (4) a **typed net layer** (partysocket reconnecting WS + zod-parsed `ServerMessage`s + reconnect-token persistence per room code); (5) **emulator dev wiring** against local `wrangler dev` via `http://10.0.2.2:8787`. Tier A grows 27 files/136 tests → **32 files/171 tests** (+5 files, +35 pure-logic tests). Tier B unchanged **13/55**. No server/protocol changes.

**Architecture & key decisions:**
- **Expo SDK 55 (not 56).** SDK 56 went stable only weeks ago and rewrote expo-router off React Navigation — too fresh to bet a write-once plan on. SDK 55 (RN 0.83, React 19.2) is the mature previous stable: New Architecture mandatory, `autolinkingModuleResolution` enabled by default in monorepos, reanimated 4. Expo Go store availability is irrelevant on the AVD: `expo start --android` installs the SDK-matched Expo Go APK onto the emulator automatically.
- **Expo Go, no dev build.** Every 3a dependency is Expo-Go-bundled or pure JS: expo-router, AsyncStorage, @expo-google-fonts (JS+assets), react-native-reanimated 4 + react-native-worklets (bundled in Go, version-pinned by `npx expo install`), partysocket (dependency-free, lists React Native as a supported platform; no URL/EventTarget polyfills needed). No camera/AdMob/QR in 3a — room codes are typed by hand.
- **Reanimated stays (per the design doc), used minimally.** `theme/motion.ts` imports `Easing` from reanimated exactly as the doc specifies; the only 3a animation is the press-pop on buttons. If Go ever misbehaves, the swap to RN `Animated` is localized to two files. Tier-A tests never import `motion.ts` (it pulls reanimated); they test the other token leaves directly.
- **Metro + pnpm: default config + one surgical resolver.** Expo SDK 52+ auto-configures Metro for monorepos (watchFolders/nodeModulesPaths from the workspace root; symlinked pnpm isolated installs are supported — do NOT switch the repo to `nodeLinker: hoisted`). The one gap: `@bloop/*` packages ship raw TS whose relative imports are NodeNext-style (`./messages.js`); Metro does not do TS extension redirection. `metro.config.js` chains a resolver that retries `.js → .ts` only after default resolution fails (exact file in Task 1).
- **IMPORT FIREWALL (spec §4 rule 3):** mobile may import `@bloop/protocol` (runtime) and **game TYPES only** (`import type { TracerView } from '@bloop/game-tracer'`, a devDependency — erased at compile, never bundled). `@bloop/engine`, `@bloop/kit`, `@bloop/server` are forbidden entirely. Enforced two ways: the dependency graph (game-tracer is a devDep, engine/kit/server absent) and a CI lint `scripts/check-firewall.mjs` wired into `pnpm check` (Task 4).
- **Net layer = pure core + thin hook.** Everything testable is framework-free under `src/net/` + `src/games/` (message parse, session reducer/state machine, tracer view guard, countdown math) and runs as Tier-A vitest in plain Node — zero react-native imports in tested files. The only stateful glue is one hook (`useRoomSession`) owning the partysocket and re-sending `hello` on every (re)open with the AsyncStorage-persisted reconnect token (`bloop/reconnect/<CODE>`).
- **RTL/jest-expo testing: OUT for 3a.** jest-expo on Windows in a pnpm monorepo is a known time sink (haste/symlink issues, a second test runner beside vitest), and 3a screens are thin render-only maps over the tested reducer + guard. Verification = 35 pure tests + the Task-11 manual emulator checklist driven by a bot script. Revisit RTL when screens grow logic.
- **Server contract (verified against source):** `POST /rooms` → 201 `{code, protocolVersion, wsPath}`; WS `ws://host/rooms/<CODE>/ws` (code case-insensitive); client sends `hello {protocolVersion, profile{nickname≤20, avatar≤64}, reconnectToken?}` → `welcome {playerId, reconnectToken}` + `lobby` broadcast; `startGame {gameId:'tracer'}` (host only; roster 2–16 — **tracer `minPlayers` is 2**, not 3 as the task brief guessed; solo start still fails with `BAD_MESSAGE`); `action {payload:{kind:'vote', target}}`; errors `UPGRADE_REQUIRED | ROOM_FULL | BAD_MESSAGE | NOT_HOST | UNKNOWN_GAME` (rate-limit warn arrives as `BAD_MESSAGE` — the client cannot distinguish it, toast copy covers both). Fresh joins during `playing` get `ROOM_FULL`; a stored reconnect token reclaims the seat instead.

**Tech Stack:** Expo SDK 55 (blank-typescript template), expo-router, react-native-reanimated 4, @expo-google-fonts/baloo-2 + inter, @react-native-async-storage/async-storage, partysocket, @bloop/protocol (workspace). Tests: root vitest 3 (Tier A include extended to `apps/mobile/test-node/**`).

**Conventions for every task:**
- Working directory `C:\Users\Admin\Documents\Hacktaton26\r2\bloop`. pnpm 11.5.2 (`C:\Users\Admin\AppData\Roaming\npm\pnpm.cmd` if plain `pnpm` does not resolve). Node ≥ 22 (verified: v25.7.0 — the bot script uses the global `WebSocket`).
- Git: ONLY `git add r2/bloop/<paths>` from repo root or `git add .` from inside `r2/bloop`. NEVER `git add -A` at the root. Branch: **r3**.
- Baselines (verified): Tier A `pnpm test` → **27 files, 136 tests**; Tier B `pnpm --filter @bloop/server test` → **13 files, 55 tests**. Run BOTH after every task.
- Mobile Tier-A test files (`apps/mobile/test-node/**`) must NEVER import `react-native`, `expo*`, `partysocket`, or `src/theme/motion.ts`/`src/theme/index.ts` — they run in plain Node.
- Emulator: AVD `bloop_pixel` (API 35); `ANDROID_HOME`/`ANDROID_SDK_ROOT` already point at `%LOCALAPPDATA%\Android\Sdk`. The emulator reaches the host machine as `10.0.2.2`; bot scripts on the host use `127.0.0.1`.
- Run procedure (used by Tasks 1, 7, 11): **Terminal A** `pnpm --filter @bloop/server dev` (wrangler dev on :8787) · **Terminal B** boot emulator if needed (`& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd bloop_pixel`), then `pnpm --filter @bloop/mobile android` (= `expo start --android`; accept the prompt to install Expo Go on the emulator the first time; Expo Go allows cleartext http in dev).

---

### Task 1: Scaffold `apps/mobile` — Expo SDK 55 + expo-router + pnpm/Metro wiring, boots on the emulator

**Files:** Create `apps/mobile/**` (scaffold + edits below).

- [ ] **Step 1: Scaffold from the SDK-55 template (no install yet)**

```powershell
pnpm dlx create-expo-app@latest apps/mobile --template blank-typescript@sdk-55 --no-install
```

Delete the template's `apps/mobile/App.tsx` and `apps/mobile/index.ts` (expo-router replaces both). Keep `assets/` and `.gitignore` as scaffolded.

- [ ] **Step 2: Replace `apps/mobile/package.json`**

Keep the template's exact `dependencies` versions for `expo`, `react`, `react-native` (do not retype them — only change the fields shown):

```jsonc
{
  "name": "@bloop/mobile",
  "version": "0.0.1",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { /* template's expo/react/react-native — added to in Step 4 */ },
  "devDependencies": { /* template's typescript/@types/react — added to in Step 4 */ }
}
```

- [ ] **Step 3: Config files (exact contents)**

`apps/mobile/app.json` (keep the template's asset paths if its filenames differ):

```json
{
  "expo": {
    "name": "bloop",
    "slug": "bloop",
    "version": "0.0.1",
    "scheme": "bloop",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "icon": "./assets/icon.png",
    "splash": { "image": "./assets/splash-icon.png", "resizeMode": "contain", "backgroundColor": "#FFF9F0" },
    "android": { "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#FFF9F0" } },
    "plugins": ["expo-router"]
  }
}
```

`apps/mobile/metro.config.js` — the EXACT pnpm-monorepo config:

```js
// Expo SDK 52+ auto-configures Metro for monorepos (watchFolders +
// nodeModulesPaths derived from the pnpm workspace root, symlink-aware for
// pnpm's default isolated installs) — do NOT hand-roll those. The one gap:
// @bloop/* workspace packages ship raw TS source whose relative imports are
// NodeNext-style ('./messages.js'); vitest/esbuild/wrangler/tsc all redirect
// '.js' -> '.ts', Metro does not. The resolver below retries '.js' -> '.ts'
// ONLY after default resolution fails, so it is a no-op for everything else.
// Contingency (documented, not expected): if pnpm's isolated layout ever
// breaks native-package resolution, set `nodeLinker: hoisted` in the root
// pnpm-workspace.yaml and reinstall — but try `pnpm install --force` first.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (err) {
    if (/^\.\.?\/.+\.js$/.test(moduleName)) {
      return context.resolveRequest(context, moduleName.replace(/\.js$/, '.ts'), platform);
    }
    throw err;
  }
};

module.exports = config;
```

`apps/mobile/babel.config.js`:

```js
// babel-preset-expo auto-wires the reanimated/worklets plugin when installed.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
```

`apps/mobile/tsconfig.json` — extends Expo's base (Expo needs its own JSX/lib/moduleResolution; the repo's `tsconfig.base.json` strictness is mirrored explicitly):

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["app/**/*.ts", "app/**/*.tsx", "src/**/*.ts", "src/**/*.tsx", "test-node/**/*.ts", "expo-env.d.ts", ".expo/types/**/*.ts"]
}
```

- [ ] **Step 4: Install dependencies**

```powershell
pnpm install                                  # link the new workspace package
pnpm --filter @bloop/mobile add partysocket
pnpm --filter @bloop/mobile add "@bloop/protocol@workspace:*"
pnpm --filter @bloop/mobile add -D "@bloop/game-tracer@workspace:*" "vitest@^3.2.0"
Set-Location apps/mobile
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar expo-font @expo-google-fonts/baloo-2 @expo-google-fonts/inter @react-native-async-storage/async-storage react-native-reanimated react-native-worklets
Set-Location ../..
```

(`npx expo install` detects the pnpm workspace and pins SDK-55-compatible versions. If `pnpm install` reports ignored build scripts for an expo package, add it under `allowBuilds` in `pnpm-workspace.yaml` — none are expected.)

- [ ] **Step 5: Placeholder routes (replaced in Tasks 2/7/8)**

`apps/mobile/app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`apps/mobile/app/index.tsx`:

```tsx
import { Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF9F0' }}>
      <Text style={{ fontSize: 24 }}>bloop boots 🫧</Text>
    </View>
  );
}
```

- [ ] **Step 6: Verify — typecheck, suites, EMULATOR BOOT (the pnpm/Metro gate, do not skip)**

Run: `pnpm --filter @bloop/mobile typecheck` → exit 0.
Run: `pnpm test` → 27 files/136 tests; `pnpm --filter @bloop/server test` → 13/55 (untouched).
Boot per the run procedure (Terminal B only — no server needed yet): `pnpm --filter @bloop/mobile android` → Expo Go installs on `bloop_pixel`, app renders "bloop boots 🫧". This proves Metro + pnpm isolated + SDK 55 on this machine before any real code lands.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(mobile): Expo SDK 55 app shell scaffold — expo-router, pnpm/Metro monorepo wiring, boots in Expo Go"
```

---

### Task 2: Theme module — tokens hex-for-hex per the design doc (Tier A)

**Files:** Create `apps/mobile/src/theme/{colors,spacing,radii,typography,elevation,motion,index}.ts`, `ThemeProvider.tsx`, `useTheme.ts`, `apps/mobile/test-node/theme-tokens.test.ts`. Modify root `vitest.config.ts`.

- [ ] **Step 1: Extend the root Tier-A include** — in `r2/bloop/vitest.config.ts`, add to `include`:

```ts
      'apps/mobile/test-node/**/*.test.ts',
```

- [ ] **Step 2: Write the failing test**

`apps/mobile/test-node/theme-tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
// NEVER import src/theme/index.ts or motion.ts here: they pull react-native-reanimated.
import { darkTheme, lightTheme, palette } from '../src/theme/colors';
import { elevation, outline } from '../src/theme/elevation';
import { radii } from '../src/theme/radii';
import { layout, spacing } from '../src/theme/spacing';
import { fontFamily, type } from '../src/theme/typography';

describe('design-system tokens (docs/designs/2026-06-10-mobile-design-system.md §2)', () => {
  it('palette is hex-for-hex per §2.1', () => {
    expect(palette).toEqual({
      blurpleberry: '#5B6CFF', bubblegum: '#FF5DA2', tangerine: '#FF7A3C', sunbeam: '#FFC23C',
      limeade: '#6FD66B', aqua: '#36C5D0',
      skyMist: '#8FD3F4', lilac: '#C3A7FF', blush: '#FFB3C9', mint: '#BFE9C8', butter: '#FFE39A',
      paper: '#FFF9F0', cloud: '#FFFFFF', fog: '#F1ECE3', pebble: '#D9D2C7',
      slate: '#8A8478', graphite: '#4A4742', ink: '#23201C',
      midnight: '#10142A', abyss: '#0A0D1F', navySurface: '#1B2147', navyBorder: '#2C3566',
      success: '#3FB75E', warning: '#FF9F1C', danger: '#F4453E',
      white: '#FFFFFF', black: '#000000', stickerLine: '#1A1714',
    });
  });

  it('lightTheme maps semantics exactly per §2.1', () => {
    expect(lightTheme).toEqual({
      bg: '#FFF9F0', surface: '#FFFFFF', surfaceAlt: '#F1ECE3', border: '#D9D2C7',
      textPrimary: '#23201C', textSecondary: '#4A4742', textMuted: '#8A8478', textOnBrand: '#FFFFFF',
      brand: '#5B6CFF', brandPressed: '#4655E6', accent: '#36C5D0', truth: '#6FD66B',
      dare: '#FF7A3C', xp: '#FFC23C', success: '#3FB75E', danger: '#F4453E', warning: '#FF9F1C',
      stickerOutline: '#1A1714', burst: '#FF5DA2',
    });
  });

  it('darkTheme (Night Pop Lite, reserved) keeps the §2.1 anchors', () => {
    expect(darkTheme.bg).toBe('#10142A');
    expect(darkTheme.surface).toBe('#1B2147');
    expect(darkTheme.brand).toBe('#7B8AFF');
    expect(darkTheme.textPrimary).toBe('#F4F2FF');
  });

  it('spacing + layout per §2.2', () => {
    expect(spacing).toEqual({ none: 0, xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40, giant: 56 });
    expect(layout).toEqual({ screenPadding: 16, cardPadding: 20, minTouchTarget: 48, maxContentWidth: 480 });
  });

  it('radii per §2.3', () => {
    expect(radii).toEqual({ none: 0, sm: 8, md: 14, lg: 20, xl: 28, xxl: 36, pill: 999 });
  });

  it('type scale + font families per §2.4', () => {
    expect(fontFamily).toEqual({
      display: 'Baloo2_800ExtraBold', displaySemi: 'Baloo2_600SemiBold',
      ui: 'Inter_600SemiBold', body: 'Inter_400Regular', bodyMedium: 'Inter_500Medium',
    });
    expect(type.displayXL).toEqual({ fontSize: 48, lineHeight: 52, fontFamily: 'Baloo2_800ExtraBold', letterSpacing: 0.5 });
    expect(type.body).toEqual({ fontSize: 16, lineHeight: 24, fontFamily: 'Inter_400Regular' });
    expect(type.overline).toEqual({ fontSize: 11, lineHeight: 14, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2 });
  });

  it('elevation + outline per §2.5/§2.6 (sticker = hard offset, no blur)', () => {
    expect(elevation.sticker).toEqual({ shadowColor: '#1A1714', shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 }, elevation: 8 });
    expect(elevation.e2).toEqual({ shadowColor: '#3A2E1E', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 });
    expect(outline).toEqual({ hairline: { borderWidth: 1, borderColor: 'border' }, sticker: { borderWidth: 3, borderColor: 'stickerOutline' } });
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `pnpm vitest run apps/mobile/test-node/theme-tokens.test.ts` → FAIL (cannot resolve `../src/theme/colors`).

- [ ] **Step 4: Implement the token files**

`apps/mobile/src/theme/colors.ts` — copy §2.1 of the design doc VERBATIM: the full `palette` const (all 28 keys, exact hexes as asserted above) + `export type PaletteColor = keyof typeof palette;`, then the `ColorTheme` interface and `lightTheme`/`darkTheme` consts exactly as printed in the doc's `themes.ts` block (§6.2 folds both into `colors.ts`; the doc's two snippets concatenate cleanly — `themes.ts` references `palette` from the same file).

`apps/mobile/src/theme/spacing.ts`, `radii.ts` — copy §2.2 and §2.3 verbatim (`spacing`, `layout`, `radii`).

`apps/mobile/src/theme/typography.ts` — copy §2.4 verbatim (`fontFamily`, `type`). Note: `type` is a const named `type` exactly as the doc spells it (legal TS).

`apps/mobile/src/theme/elevation.ts` — copy §2.5 verbatim, then append §2.6 (the doc assigns `outline` no file; it lives here with the rest of the surface language):

```ts
/** §2.6 — borderColor strings are SEMANTIC theme keys, resolved at component time via useTheme(). */
export const outline = {
  hairline: { borderWidth: 1, borderColor: 'border' },
  sticker: { borderWidth: 3, borderColor: 'stickerOutline' },
} as const;
```

`apps/mobile/src/theme/motion.ts` — copy §2.7 verbatim (imports `Easing` from `react-native-reanimated`; `duration`, `easing`, `spring`). This file is app-only — never imported by Tier-A tests.

`apps/mobile/src/theme/index.ts`:

```ts
import { palette } from './colors';
import { elevation, outline } from './elevation';
import { duration, easing, spring } from './motion';
import { radii } from './radii';
import { layout, spacing } from './spacing';
import { fontFamily, type } from './typography';

/** §6.2 — the single tokens object. Components reach colors via useTheme().theme, never palette. */
export const tokens = {
  colors: palette, spacing, layout, radii, type, fontFamily, elevation, outline,
  motion: { duration, easing, spring },
} as const;
export type Tokens = typeof tokens;
```

`apps/mobile/src/theme/ThemeProvider.tsx`:

```tsx
import { createContext, useMemo, type ReactNode } from 'react';
import { lightTheme, type ColorTheme } from './colors';
import { tokens, type Tokens } from './index';

export interface ThemeContextValue { theme: ColorTheme; mode: 'light' | 'dark'; tokens: Tokens }

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Light-only in 3a. Night Pop Lite ships later as a token swap: thread `mode` from Appearance + a Settings override here. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ThemeContextValue>(() => ({ theme: lightTheme, mode: 'light', tokens }), []);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
```

`apps/mobile/src/theme/useTheme.ts`:

```ts
import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from './ThemeProvider';

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme outside <ThemeProvider>');
  return ctx;
}
```

- [ ] **Step 5: Verify** — `pnpm test` → PASS **28 files, 143 tests** (136 + 7). `pnpm --filter @bloop/mobile typecheck` → exit 0. `pnpm --filter @bloop/server test` → 13/55.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(mobile): design-system theme module — tokens hex-for-hex + ThemeProvider/useTheme (Tier A)"
```

---

### Task 3: Avatars + device-local profile persistence (pure helpers, Tier A)

**Files:** Create `apps/mobile/src/avatars.ts`, `apps/mobile/src/storage/profile.ts`, `apps/mobile/test-node/profile.test.ts`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/test-node/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { playerProfileSchema } from '@bloop/protocol';
import { AVATARS, avatarEmoji, FALLBACK_EMOJI } from '../src/avatars';
import {
  loadProfile, loadReconnectToken, normalizeNickname, PROFILE_KEY,
  randomProfile, reconnectKey, saveProfile, saveReconnectToken, type KV,
} from '../src/storage/profile';

function fakeKv(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: async (k) => map.get(k) ?? null, setItem: async (k, v) => void map.set(k, v) };
}

describe('avatar presets (§5: stable string ids, ≤64 chars per protocol)', () => {
  it('ids are unique, namespaced, within the wire limit', () => {
    const ids = AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(16);
    for (const a of AVATARS) {
      expect(a.id).toMatch(/^emoji:[a-z0-9-]+$/);
      expect(a.id.length).toBeLessThanOrEqual(64);
      expect(a.emoji.length).toBeGreaterThan(0);
    }
  });

  it('resolves known ids and falls back for unknown/foreign ids', () => {
    expect(avatarEmoji(AVATARS[0]!.id)).toBe(AVATARS[0]!.emoji);
    expect(avatarEmoji('bloop:cap-aqua')).toBe(FALLBACK_EMOJI); // mascot set is a later asset drop
    expect(avatarEmoji('')).toBe(FALLBACK_EMOJI);
  });
});

describe('nickname + random identity (§5 picker UX)', () => {
  it('normalizeNickname trims, collapses whitespace, clamps to the protocol max of 20', () => {
    expect(normalizeNickname('  DJ   Bloop  ')).toBe('DJ Bloop');
    expect(normalizeNickname('x'.repeat(30))).toBe('x'.repeat(20));
    expect(normalizeNickname('   ')).toBeNull();
  });

  it('randomProfile is deterministic under an injected rng and protocol-valid', () => {
    const a = randomProfile(() => 0.42);
    expect(randomProfile(() => 0.42)).toEqual(a);
    expect(playerProfileSchema.safeParse(a).success).toBe(true);
    expect(AVATARS.some((av) => av.id === a.avatar)).toBe(true);
  });
});

describe('device-local persistence (anonymous, on-device only)', () => {
  it('profile round-trips through KV and rejects corrupt JSON', async () => {
    const kv = fakeKv();
    expect(await loadProfile(kv)).toBeNull();
    await saveProfile(kv, { nickname: 'Théo', avatar: AVATARS[1]!.id });
    expect(await loadProfile(kv)).toEqual({ nickname: 'Théo', avatar: AVATARS[1]!.id });
    kv.map.set(PROFILE_KEY, '{not json');
    expect(await loadProfile(kv)).toBeNull();
  });

  it('reconnect tokens are stored per room code, case-normalized', async () => {
    const kv = fakeKv();
    expect(reconnectKey('abCD')).toBe('bloop/reconnect/ABCD');
    await saveReconnectToken(kv, 'abCD', 'tok-1');
    await saveReconnectToken(kv, 'WXYZ', 'tok-2');
    expect(await loadReconnectToken(kv, 'ABCD')).toBe('tok-1');
    expect(await loadReconnectToken(kv, 'wxyz')).toBe('tok-2');
    expect(await loadReconnectToken(kv, 'QQQQ')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run apps/mobile/test-node/profile.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`apps/mobile/src/avatars.ts`:

```ts
/** §5 — preset, anonymous-friendly avatars. 3a ships the emoji quick-pick set; the
 *  ~24–36 mascot SVGs ("bloop:*") are an external art dependency and land later.
 *  The id is the ONLY thing on the wire (playerProfileSchema.avatar ≤ 64 chars). */
export interface AvatarPreset { id: string; emoji: string; label: string }

export const AVATARS: readonly AvatarPreset[] = [
  { id: 'emoji:party', emoji: '🥳', label: 'Party' },
  { id: 'emoji:cool', emoji: '😎', label: 'Cool' },
  { id: 'emoji:zany', emoji: '🤪', label: 'Zany' },
  { id: 'emoji:hearts', emoji: '😍', label: 'Heart eyes' },
  { id: 'emoji:ghost', emoji: '👻', label: 'Ghost' },
  { id: 'emoji:alien', emoji: '👽', label: 'Alien' },
  { id: 'emoji:robot', emoji: '🤖', label: 'Robot' },
  { id: 'emoji:unicorn', emoji: '🦄', label: 'Unicorn' },
  { id: 'emoji:frog', emoji: '🐸', label: 'Frog' },
  { id: 'emoji:octopus', emoji: '🐙', label: 'Octopus' },
  { id: 'emoji:fox', emoji: '🦊', label: 'Fox' },
  { id: 'emoji:panda', emoji: '🐼', label: 'Panda' },
  { id: 'emoji:monkey', emoji: '🐵', label: 'Monkey' },
  { id: 'emoji:cat', emoji: '😺', label: 'Cat' },
  { id: 'emoji:penguin', emoji: '🐧', label: 'Penguin' },
  { id: 'emoji:dino', emoji: '🦖', label: 'Dino' },
  { id: 'emoji:pizza', emoji: '🍕', label: 'Pizza' },
  { id: 'emoji:rocket', emoji: '🚀', label: 'Rocket' },
] as const;

export const FALLBACK_EMOJI = '🫧';
const BY_ID = new Map(AVATARS.map((a) => [a.id, a.emoji]));

export function avatarEmoji(id: string): string {
  return BY_ID.get(id) ?? FALLBACK_EMOJI;
}
```

`apps/mobile/src/storage/profile.ts`:

```ts
import { playerProfileSchema, type PlayerProfile } from '@bloop/protocol';
import { AVATARS } from '../avatars';

/** Storage seam: AsyncStorage satisfies this; tests pass a Map-backed fake. */
export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const PROFILE_KEY = 'bloop/profile';
export const reconnectKey = (code: string): string => `bloop/reconnect/${code.toUpperCase()}`;

const NICKNAMES = [
  'Captain Bloop', 'Disco Potato', 'Agent Waffle', 'Major Sparkle', 'DJ Pickle',
  'Sir Bounce', 'Glitter Goblin', 'Tofu Bandit', 'Baron Wiggle', 'Nacho Wizard',
] as const;

export function normalizeNickname(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, ' ').slice(0, 20).trim();
  return t.length === 0 ? null : t;
}

/** §5: first launch = random avatar + fun nickname suggestion (editable). rng injectable for tests. */
export function randomProfile(rng: () => number = Math.random): PlayerProfile {
  const avatar = AVATARS[Math.floor(rng() * AVATARS.length)]!;
  const nickname = NICKNAMES[Math.floor(rng() * NICKNAMES.length)]!;
  return { nickname, avatar: avatar.id };
}

export async function loadProfile(kv: KV): Promise<PlayerProfile | null> {
  const raw = await kv.getItem(PROFILE_KEY);
  if (raw === null) return null;
  try {
    const parsed = playerProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveProfile(kv: KV, profile: PlayerProfile): Promise<void> {
  await kv.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function loadReconnectToken(kv: KV, code: string): Promise<string | null> {
  return kv.getItem(reconnectKey(code));
}

export async function saveReconnectToken(kv: KV, code: string, token: string): Promise<void> {
  await kv.setItem(reconnectKey(code), token);
}
```

- [ ] **Step 4: Verify** — `pnpm test` → PASS **29 files, 149 tests** (143 + 6). `pnpm --filter @bloop/server test` → 13/55.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(mobile): emoji avatar presets + device-local profile/reconnect-token persistence (pure, Tier A)"
```

---

### Task 4: Net-layer pure core (parse, session reducer, tracer guard) + import-firewall lint (Tier A)

**Files:** Create `apps/mobile/src/config.ts`, `apps/mobile/src/net/parse.ts`, `apps/mobile/src/net/session.ts`, `apps/mobile/src/games/tracer-view.ts`, `apps/mobile/test-node/{net-parse,session-reducer,tracer-view}.test.ts`, `r2/bloop/scripts/check-firewall.mjs`. Modify root `package.json`.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/test-node/net-parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeServerUrl, roomsUrl, wsUrl } from '../src/config';
import { parseServerMessage } from '../src/net/parse';

describe('server url config (emulator → host = 10.0.2.2)', () => {
  it('defaults, strips trailing slashes, derives ws:// and uppercases the code', () => {
    expect(normalizeServerUrl(undefined)).toBe('http://10.0.2.2:8787');
    expect(normalizeServerUrl('http://192.168.1.20:8787/')).toBe('http://192.168.1.20:8787');
    expect(roomsUrl('http://10.0.2.2:8787')).toBe('http://10.0.2.2:8787/rooms');
    expect(wsUrl('http://10.0.2.2:8787', 'abQ7')).toBe('ws://10.0.2.2:8787/rooms/ABQ7/ws');
    expect(wsUrl('https://bloop.example.com', 'ZZZZ')).toBe('wss://bloop.example.com/rooms/ZZZZ/ws');
  });
});

describe('parseServerMessage (zod-parse EVERY inbound frame)', () => {
  it('parses welcome', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'welcome', playerId: 'p1', reconnectToken: 't1' })))
      .toEqual({ type: 'welcome', playerId: 'p1', reconnectToken: 't1' });
  });

  it('parses lobby', () => {
    const lobby = { type: 'lobby', players: [{ id: 'p1', profile: { nickname: 'Anna', avatar: 'emoji:fox' }, connected: true, isHost: true }], gameId: null };
    expect(parseServerMessage(JSON.stringify(lobby))).toEqual(lobby);
  });

  it('parses view, preserving the opaque per-game payload', () => {
    const view = { type: 'view', gameId: 'tracer', view: { phase: 'over', scores: { p1: 2 } }, deadlineAt: null };
    expect(parseServerMessage(JSON.stringify(view))).toEqual(view);
  });

  it('parses all five error codes', () => {
    for (const code of ['UPGRADE_REQUIRED', 'ROOM_FULL', 'BAD_MESSAGE', 'NOT_HOST', 'UNKNOWN_GAME']) {
      expect(parseServerMessage(JSON.stringify({ type: 'error', code }))).toEqual({ type: 'error', code });
    }
  });

  it('rejects junk: non-string, non-JSON, unknown type, missing fields, oversized', () => {
    expect(parseServerMessage(7 as unknown as string)).toBeNull();
    expect(parseServerMessage('{nope')).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'hack' }))).toBeNull();
    expect(parseServerMessage(JSON.stringify({ type: 'welcome', playerId: 'p1' }))).toBeNull();
    expect(parseServerMessage(`"${'x'.repeat(70_000)}"`)).toBeNull();
  });
});
```

`apps/mobile/test-node/session-reducer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@bloop/protocol';
import { initialSession, reduceSession, type SessionState } from '../src/net/session';

const msg = (m: ServerMessage) => ({ type: 'message' as const, message: m });
const seq = (events: Parameters<typeof reduceSession>[1][]): SessionState =>
  events.reduce(reduceSession, initialSession);
const PLAYERS = [
  { id: 'p1', profile: { nickname: 'Anna', avatar: 'emoji:fox' }, connected: true, isHost: true },
  { id: 'p2', profile: { nickname: 'Bert', avatar: 'emoji:frog' }, connected: false, isHost: false },
];

describe('session reducer — the connection/lobby/game state machine (pure)', () => {
  it('starts connecting; socketOpen → open', () => {
    expect(initialSession.status).toBe('connecting');
    expect(seq([{ type: 'socketOpen' }]).status).toBe('open');
  });

  it('welcome stores identity + reconnect token', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'welcome', playerId: 'p1', reconnectToken: 'tok' })]);
    expect(s.playerId).toBe('p1');
    expect(s.reconnectToken).toBe('tok');
  });

  it('lobby replaces the squad list and picked game', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'lobby', players: PLAYERS, gameId: null })]);
    expect(s.players).toEqual(PLAYERS);
    expect(s.gameId).toBeNull();
  });

  it('view stores the opaque payload + gameId + deadline', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'view', gameId: 'tracer', view: { phase: 'over', scores: {} }, deadlineAt: 123 })]);
    expect(s.viewGameId).toBe('tracer');
    expect(s.view).toEqual({ phase: 'over', scores: {} });
    expect(s.deadlineAt).toBe(123);
  });

  it('UPGRADE_REQUIRED is fatal and absorbing', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'error', code: 'UPGRADE_REQUIRED' })]);
    expect(s.status).toBe('fatal');
    expect(s.fatal).toBe('UPGRADE_REQUIRED');
    const after = reduceSession(s, msg({ type: 'lobby', players: PLAYERS, gameId: null }));
    expect(after).toBe(s); // absorbed — nothing mutates a dead session
  });

  it('ROOM_FULL is fatal', () => {
    expect(seq([{ type: 'socketOpen' }, msg({ type: 'error', code: 'ROOM_FULL' })]).fatal).toBe('ROOM_FULL');
  });

  it('BAD_MESSAGE toasts (covers the rate-limit warn — the server reuses the code) and is non-fatal', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'error', code: 'BAD_MESSAGE' })]);
    expect(s.status).toBe('open');
    expect(s.toast?.kind).toBe('error');
    expect(s.toast?.seq).toBe(1);
  });

  it('NOT_HOST / UNKNOWN_GAME toast distinct copy and bump seq', () => {
    const s1 = seq([{ type: 'socketOpen' }, msg({ type: 'error', code: 'NOT_HOST' })]);
    const s2 = reduceSession(s1, msg({ type: 'error', code: 'UNKNOWN_GAME' }));
    expect(s1.toast?.text).not.toBe(s2.toast?.text);
    expect(s2.toast?.seq).toBe(2);
  });

  it('socketClosed → reconnecting (banner state), then reopen → open', () => {
    const s = seq([{ type: 'socketOpen' }, { type: 'socketClosed' }]);
    expect(s.status).toBe('reconnecting');
    expect(reduceSession(s, { type: 'socketOpen' }).status).toBe('open');
  });

  it('socketClosed after fatal stays fatal', () => {
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'error', code: 'ROOM_FULL' }), { type: 'socketClosed' }]);
    expect(s.status).toBe('fatal');
  });

  it('lobby keeps working after a game ends (back-to-lobby path)', () => {
    const over = msg({ type: 'view', gameId: 'tracer', view: { phase: 'over', scores: { p1: 1 } }, deadlineAt: null });
    const s = seq([{ type: 'socketOpen' }, msg({ type: 'lobby', players: PLAYERS, gameId: null }), over,
      msg({ type: 'lobby', players: PLAYERS.slice(0, 1), gameId: 'tracer' })]);
    expect(s.players).toHaveLength(1);
    expect(s.view).toEqual({ phase: 'over', scores: { p1: 1 } }); // view persists until the next game overwrites it
  });
});
```

`apps/mobile/test-node/tracer-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { asTracerView, secondsLeft } from '../src/games/tracer-view';

describe('tracer view guard (mobile narrows the opaque view — types only cross the firewall)', () => {
  it('accepts a vote view', () => {
    const v = { phase: 'vote', round: 0, totalRounds: 3, prompt: 'Who…?', hasVoted: { p1: true, p2: false }, myVote: null, scores: { p1: 0, p2: 0 } };
    expect(asTracerView(v)).toEqual(v);
  });

  it('accepts a reveal view', () => {
    const v = { phase: 'reveal', round: 1, totalRounds: 3, prompt: 'Who…?', tally: { p1: 2, p2: 0 }, scores: { p1: 1, p2: 0 } };
    expect(asTracerView(v)).toEqual(v);
  });

  it('accepts an over view', () => {
    expect(asTracerView({ phase: 'over', scores: { p1: 3 } })).toEqual({ phase: 'over', scores: { p1: 3 } });
  });

  it('rejects junk and near-misses', () => {
    expect(asTracerView(null)).toBeNull();
    expect(asTracerView({ phase: 'vote', round: 0 })).toBeNull(); // missing fields
    expect(asTracerView({ phase: 'lobby' })).toBeNull(); // unknown phase
    expect(asTracerView({ phase: 'vote', round: 'x', totalRounds: 3, prompt: '', hasVoted: {}, myVote: null, scores: {} })).toBeNull();
  });

  it('secondsLeft clamps at 0 and passes null through', () => {
    expect(secondsLeft(null, 1_000)).toBeNull();
    expect(secondsLeft(31_000, 1_000)).toBe(30);
    expect(secondsLeft(1_100, 1_000)).toBe(1); // ceil
    expect(secondsLeft(500, 1_000)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `pnpm vitest run apps/mobile/test-node` → the three new files FAIL on missing modules; theme + profile suites still pass.

- [ ] **Step 3: Implement**

`apps/mobile/src/config.ts`:

```ts
/** Dev wiring: the Android emulator reaches the host machine as 10.0.2.2, so the
 *  default targets local `wrangler dev` (:8787). Override per device/network via
 *  EXPO_PUBLIC_SERVER_URL (inlined by Expo at bundle time — keep the exact
 *  `process.env.EXPO_PUBLIC_SERVER_URL` member access). */
export function normalizeServerUrl(raw: string | undefined): string {
  return (raw ?? 'http://10.0.2.2:8787').replace(/\/+$/, '');
}

export const SERVER_URL: string = normalizeServerUrl(process.env.EXPO_PUBLIC_SERVER_URL);

export const roomsUrl = (serverUrl: string): string => `${serverUrl}/rooms`;

/** WS endpoint per apps/server/src/index.ts: /rooms/:code/ws (codes case-insensitive; normalize for cosmetics). */
export const wsUrl = (serverUrl: string, code: string): string =>
  `${serverUrl.replace(/^http/, 'ws')}/rooms/${code.toUpperCase()}/ws`;
```

`apps/mobile/src/net/parse.ts`:

```ts
import { serverMessageSchema, type ServerMessage } from '@bloop/protocol';

/** Every inbound frame crosses this boundary: string → JSON → zod. Junk is dropped, never thrown. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string' || raw.length > 64_000) return null;
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return null; }
  const parsed = serverMessageSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
```

`apps/mobile/src/net/session.ts`:

```ts
import type { ErrorCode, RoomPlayer, ServerMessage } from '@bloop/protocol';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'fatal';
export type FatalCode = Extract<ErrorCode, 'UPGRADE_REQUIRED' | 'ROOM_FULL'>;
export interface SessionToast { seq: number; kind: 'error' | 'info'; text: string }

export interface SessionState {
  status: ConnStatus;
  playerId: string | null;
  reconnectToken: string | null;
  players: readonly RoomPlayer[];
  gameId: string | null;
  /** Opaque per-game payload — narrowed at render time by per-game guards (firewall: types only). */
  view: unknown;
  viewGameId: string | null;
  deadlineAt: number | null;
  fatal: FatalCode | null;
  toast: SessionToast | null;
}

export const initialSession: SessionState = {
  status: 'connecting', playerId: null, reconnectToken: null, players: [], gameId: null,
  view: null, viewGameId: null, deadlineAt: null, fatal: null, toast: null,
};

export type SessionEvent =
  | { type: 'socketOpen' }
  | { type: 'socketClosed' }
  | { type: 'message'; message: ServerMessage };

const TOAST_TEXT: Record<Exclude<ErrorCode, FatalCode>, string> = {
  // Also the §7.4 rate-limit warn: the server deliberately reuses BAD_MESSAGE for it.
  BAD_MESSAGE: 'The server said no — check your nickname, or slow down a touch.',
  NOT_HOST: 'Only the host can do that.',
  UNKNOWN_GAME: "That game isn't available right now.",
};

function withToast(s: SessionState, kind: SessionToast['kind'], text: string): SessionState {
  return { ...s, toast: { seq: (s.toast?.seq ?? 0) + 1, kind, text } };
}

/** Pure: the ONLY way session state changes. The hook (Task 5) feeds it socket + parsed-message events. */
export function reduceSession(s: SessionState, e: SessionEvent): SessionState {
  if (s.fatal !== null) return s; // absorbing — a dead session never mutates
  switch (e.type) {
    case 'socketOpen': return { ...s, status: 'open' };
    case 'socketClosed': return { ...s, status: 'reconnecting' };
    case 'message': {
      const m = e.message;
      switch (m.type) {
        case 'welcome': return { ...s, playerId: m.playerId, reconnectToken: m.reconnectToken };
        case 'lobby': return { ...s, players: m.players, gameId: m.gameId };
        case 'view': return { ...s, view: m.view, viewGameId: m.gameId, deadlineAt: m.deadlineAt };
        case 'error':
          if (m.code === 'UPGRADE_REQUIRED' || m.code === 'ROOM_FULL') return { ...s, status: 'fatal', fatal: m.code };
          return withToast(s, 'error', TOAST_TEXT[m.code]);
      }
    }
  }
}
```

`apps/mobile/src/games/tracer-view.ts`:

```ts
// IMPORT FIREWALL: type-only — erased at compile time; tracer server logic never enters the bundle.
import type { TracerView } from '@bloop/game-tracer';

const isRec = (v: unknown, t: 'number' | 'boolean'): v is Record<string, never> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === t);

/** Runtime narrow of the opaque `view` payload (server view() is trusted but versions/games may drift — never crash a render). */
export function asTracerView(v: unknown): TracerView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.phase === 'over') return isRec(o.scores, 'number') ? (v as TracerView) : null;
  const roundOk = typeof o.round === 'number' && typeof o.totalRounds === 'number' && typeof o.prompt === 'string' && isRec(o.scores, 'number');
  if (o.phase === 'vote') {
    return roundOk && isRec(o.hasVoted, 'boolean') && (o.myVote === null || typeof o.myVote === 'string')
      ? (v as TracerView) : null;
  }
  if (o.phase === 'reveal') return roundOk && isRec(o.tally, 'number') ? (v as TracerView) : null;
  return null;
}

/** Countdown math for the timer chrome (TimerRing later; numerals in 3a). */
export function secondsLeft(deadlineAt: number | null, now: number): number | null {
  if (deadlineAt === null) return null;
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}
```

- [ ] **Step 4: The import-firewall lint**

`r2/bloop/scripts/check-firewall.mjs`:

```js
#!/usr/bin/env node
/**
 * IMPORT FIREWALL (spec §4 rule 3) for apps/mobile: the phone may import
 * @bloop/protocol freely and @bloop/game-* as TYPES ONLY; @bloop/engine,
 * @bloop/kit and @bloop/server never. Exit 1 on any violation.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url)); // r2/bloop

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

let violations = 0;
const flag = (file, detail) => {
  violations += 1;
  console.error(`firewall: ${relative(repo, file)}: ${detail}`);
};

for (const root of ['apps/mobile/src', 'apps/mobile/app']) {
  for (const file of files(join(repo, root))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^;]*?from\s*['"](@bloop\/[^'"]+)['"]|require\(\s*['"](@bloop\/[^'"]+)['"]\s*\)/gs) ?? []) {
      const spec = m[1] ?? m[2];
      const stmt = m[0];
      if (/^@bloop\/(engine|kit|server)/.test(spec)) flag(file, `forbidden package '${spec}'`);
      else if (/^@bloop\/game-/.test(spec) && !/^\s*(?:import|export)\s+type\b/.test(stmt)) {
        flag(file, `'${spec}' must be 'import type' — game logic never crosses to the phone`);
      }
    }
  }
}

if (violations > 0) {
  console.error(`check:firewall FAIL — ${violations} violation(s)`);
  process.exit(1);
}
console.log('check:firewall OK — mobile imports protocol + game types only');
```

In root `package.json` (`r2/bloop/package.json`), replace the `"scripts"` block with:

```json
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "typecheck": "pnpm -r --no-bail exec tsc --noEmit",
    "check:billing": "node scripts/check-billing.mjs",
    "check:firewall": "node scripts/check-firewall.mjs",
    "check": "pnpm run test && pnpm --filter @bloop/server run test && pnpm run typecheck && pnpm run check:billing && pnpm run check:firewall && pnpm --filter @bloop/server run check:bundle"
  },
```

- [ ] **Step 5: Verify**

Run: `pnpm test` → PASS **32 files, 171 tests** (149 + 6 parse + 11 session + 5 tracer-view).
Run: `pnpm check:firewall` → `check:firewall OK`. Fail-path canary: append `import { tracer } from '@bloop/game-tracer';` to `apps/mobile/src/games/tracer-view.ts`, re-run → exit 1 naming the file; revert, re-run → OK.
Run: `pnpm --filter @bloop/server test` → 13/55. `pnpm --filter @bloop/mobile typecheck` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat(mobile): typed net core — zod frame parse, session state machine, tracer view guard + import-firewall lint (Tier A)"
```

---

### Task 5: `useRoomSession` — partysocket + hello handshake + token persistence (hook, typecheck-only)

**Files:** Create `apps/mobile/src/net/useRoomSession.ts`, `apps/mobile/src/net/context.ts`.

- [ ] **Step 1: Implement the hook**

`apps/mobile/src/net/useRoomSession.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebSocket as ReconnectingWebSocket } from 'partysocket';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PROTOCOL_VERSION, type ClientMessage, type PlayerProfile } from '@bloop/protocol';
import { SERVER_URL, wsUrl } from '../config';
import { loadProfile, loadReconnectToken, saveReconnectToken } from '../storage/profile';
import { parseServerMessage } from './parse';
import { initialSession, reduceSession, type SessionState } from './session';

export interface RoomSession {
  state: SessionState;
  /** null until AsyncStorage resolves; 'missing' sends the user back Home to pick an identity. */
  profile: PlayerProfile | 'missing' | null;
  sendStartGame(gameId: string): void;
  sendVote(target: string): void;
  leave(): void;
}

export function useRoomSession(code: string): RoomSession {
  const [state, dispatch] = useReducer(reduceSession, initialSession);
  const [profile, setProfile] = useState<RoomSession['profile']>(null);
  const sockRef = useRef<ReconnectingWebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let sock: ReconnectingWebSocket | null = null;
    void (async () => {
      const [p, token] = await Promise.all([loadProfile(AsyncStorage), loadReconnectToken(AsyncStorage, code)]);
      if (disposed) return;
      if (p === null) { setProfile('missing'); return; } // no identity → no socket
      setProfile(p);
      tokenRef.current = token;
      sock = new ReconnectingWebSocket(() => wsUrl(SERVER_URL, code), [], {
        connectionTimeout: 4_000, maxRetries: 16, minReconnectionDelay: 300, maxReconnectionDelay: 4_000,
      });
      sockRef.current = sock;
      sock.addEventListener('open', () => {
        dispatch({ type: 'socketOpen' });
        // EVERY (re)open re-introduces us; the stored token reclaims our seat mid-game (§3.5).
        const hello: ClientMessage = {
          type: 'hello', protocolVersion: PROTOCOL_VERSION, profile: p,
          ...(tokenRef.current !== null ? { reconnectToken: tokenRef.current } : {}),
        };
        sock?.send(JSON.stringify(hello));
      });
      // Param typed structurally — RN tsconfigs don't load the DOM lib's MessageEvent.
      sock.addEventListener('message', (e: { data: unknown }) => {
        const m = parseServerMessage(e.data);
        if (m === null) return;
        if (m.type === 'welcome') {
          tokenRef.current = m.reconnectToken;
          void saveReconnectToken(AsyncStorage, code, m.reconnectToken);
        }
        dispatch({ type: 'message', message: m });
      });
      sock.addEventListener('close', () => dispatch({ type: 'socketClosed' }));
    })();
    return () => { disposed = true; sock?.close(); sockRef.current = null; };
  }, [code]);

  // Fatal (UPGRADE_REQUIRED / ROOM_FULL): stop partysocket's retry loop for good.
  useEffect(() => {
    if (state.fatal !== null) sockRef.current?.close();
  }, [state.fatal]);

  const send = useCallback((m: ClientMessage) => {
    const s = sockRef.current;
    if (s !== null && s.readyState === 1 /* OPEN */) s.send(JSON.stringify(m));
  }, []);

  return {
    state, profile,
    sendStartGame: useCallback((gameId: string) => send({ type: 'startGame', gameId }), [send]),
    sendVote: useCallback((target: string) => send({ type: 'action', payload: { kind: 'vote', target } }), [send]),
    leave: useCallback(() => { send({ type: 'leave' }); sockRef.current?.close(); }, [send]),
  };
}
```

`apps/mobile/src/net/context.ts`:

```ts
import { createContext, useContext } from 'react';
import type { RoomSession } from './useRoomSession';

export const RoomSessionContext = createContext<RoomSession | null>(null);

export function useRoom(): RoomSession {
  const ctx = useContext(RoomSessionContext);
  if (ctx === null) throw new Error('useRoom outside a room route');
  return ctx;
}
```

- [ ] **Step 2: Verify** — `pnpm --filter @bloop/mobile typecheck` → exit 0. `pnpm test` → 32/171. `pnpm check:firewall` → OK.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(mobile): useRoomSession — partysocket reconnect, hello-on-open, reconnect-token persistence per room"
```

---

### Task 6: UI component kit (theme consumers; typecheck-only)

**Files:** Create `apps/mobile/src/components/{ui,players,room}.tsx`. (Design-doc component NAMES are preserved as exports; 3a groups them into three files to keep the kit small.)

- [ ] **Step 1: Implement**

`apps/mobile/src/components/ui.tsx` — AppText, PrimaryButton, SecondaryButton, ToastHost:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { ColorTheme } from '../theme/colors';
import { useTheme } from '../theme/useTheme';
import type { SessionToast } from '../net/session';
import { type } from '../theme/typography';

export type TypeRole = keyof typeof type;

export function AppText({ role = 'body', color = 'textPrimary', style, children }:
  { role?: TypeRole; color?: keyof ColorTheme; style?: StyleProp<TextStyle>; children: ReactNode }) {
  const { theme, tokens } = useTheme();
  return <Text style={[tokens.type[role], { color: theme[color] }, style]}>{children}</Text>;
}

/** §2.7 motion rule: every interactive element pops on press (scale ~0.96, spring back). */
function PopPressable({ onPress, disabled, style, children }:
  { onPress?: () => void; disabled?: boolean; style: StyleProp<ViewStyle>; children: ReactNode }) {
  const { tokens } = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      onPressIn={() => { scale.value = withSpring(0.96, tokens.motion.spring.pop); }}
      onPressOut={() => { scale.value = withSpring(1, tokens.motion.spring.pop); }}>
      <Animated.View style={[anim, style]}>{children}</Animated.View>
    </Pressable>
  );
}

export function PrimaryButton({ label, onPress, disabled = false, loading = false }:
  { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const { theme, tokens } = useTheme();
  const off = disabled || loading;
  return (
    <PopPressable onPress={onPress} disabled={off} style={{
      minHeight: 56, borderRadius: tokens.radii.pill, backgroundColor: off ? tokens.colors.fog : theme.brand,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.spacing.xxl, ...tokens.elevation.e2,
    }}>
      {loading
        ? <ActivityIndicator color={theme.textOnBrand} />
        : <AppText role="headline" color={off ? 'textMuted' : 'textOnBrand'}>{label}</AppText>}
    </PopPressable>
  );
}

export function SecondaryButton({ label, onPress, disabled = false }:
  { label: string; onPress: () => void; disabled?: boolean }) {
  const { theme, tokens } = useTheme();
  return (
    <PopPressable onPress={onPress} disabled={disabled} style={{
      minHeight: 56, borderRadius: tokens.radii.pill, borderWidth: 2,
      borderColor: disabled ? theme.border : theme.brand, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: tokens.spacing.xxl, backgroundColor: 'transparent',
    }}>
      <AppText role="headline" color={disabled ? 'textMuted' : 'brand'}>{label}</AppText>
    </PopPressable>
  );
}

/** Top inset pill toast (§3): renders the session toast, auto-hides after 2.5s. */
export function ToastHost({ toast }: { toast: SessionToast | null }) {
  const { theme, tokens } = useTheme();
  const [shown, setShown] = useState<SessionToast | null>(null);
  useEffect(() => {
    if (toast === null) return;
    setShown(toast);
    const t = setTimeout(() => setShown(null), 2_500);
    return () => clearTimeout(t);
  }, [toast]);
  if (shown === null) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
      <View style={{
        backgroundColor: shown.kind === 'error' ? theme.danger : theme.accent, borderRadius: tokens.radii.pill,
        paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, maxWidth: 340, ...tokens.elevation.e2,
      }}>
        <AppText role="label" color="textOnBrand">{shown.text}</AppText>
      </View>
    </View>
  );
}
```

`apps/mobile/src/components/players.tsx` — Avatar, PlayerCard, VoteCard:

```tsx
import { Pressable, View } from 'react-native';
import type { RoomPlayer } from '@bloop/protocol';
import { avatarEmoji } from '../avatars';
import { useTheme } from '../theme/useTheme';
import { AppText } from './ui';

const SIZES = { sm: 32, md: 48, lg: 72, hero: 112 } as const;

/** §3 Avatar: ring semantics — host = sunbeam, "you" = brand; dot = connection. */
export function Avatar({ avatarId, size = 'md', ring = null, connected }:
  { avatarId: string; size?: keyof typeof SIZES; ring?: 'host' | 'you' | null; connected?: boolean }) {
  const { theme, tokens } = useTheme();
  const d = SIZES[size];
  const ringColor = ring === 'host' ? theme.xp : ring === 'you' ? theme.brand : 'transparent';
  return (
    <View style={{
      width: d, height: d, borderRadius: tokens.radii.pill, backgroundColor: theme.surfaceAlt,
      borderWidth: ring === null ? 0 : 3, borderColor: ringColor, alignItems: 'center', justifyContent: 'center',
      opacity: connected === false ? 0.45 : 1,
    }}>
      <AppText style={{ fontSize: d * 0.52, lineHeight: d * 0.66 }}>{avatarEmoji(avatarId)}</AppText>
      {connected !== undefined && (
        <View style={{
          position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6,
          backgroundColor: connected ? theme.success : theme.border, borderWidth: 2, borderColor: theme.surface,
        }} />
      )}
    </View>
  );
}

/** §3 PlayerCard: avatar + nickname + status (+ crown for host). */
export function PlayerCard({ player, isYou }: { player: RoomPlayer; isYou: boolean }) {
  const { theme, tokens } = useTheme();
  return (
    <View
      accessibilityLabel={`${player.profile.nickname}${player.isHost ? ', host' : ''}${isYou ? ', you' : ''}, ${player.connected ? 'online' : 'away'}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
        borderRadius: tokens.radii.lg, padding: tokens.spacing.md, ...tokens.elevation.e1,
      }}>
      <Avatar avatarId={player.profile.avatar} ring={player.isHost ? 'host' : isYou ? 'you' : null} connected={player.connected} />
      <View style={{ flex: 1 }}>
        <AppText role="bodyStrong">{player.profile.nickname}{player.isHost ? ' 👑' : ''}{isYou ? ' (you)' : ''}</AppText>
        <AppText role="caption" color={player.connected ? 'textMuted' : 'danger'}>{player.connected ? 'Online' : 'Reconnecting…'}</AppText>
      </View>
    </View>
  );
}

/** §3 VoteCard: tappable target; selected = brand ring + check; tick = that player has voted. */
export function VoteCard({ player, selected, voted, disabled, onPress }:
  { player: RoomPlayer; selected: boolean; voted: boolean; disabled: boolean; onPress: () => void }) {
  const { theme, tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      accessibilityLabel={`Vote for ${player.profile.nickname}${selected ? ', selected' : ''}${voted ? ', has voted' : ''}`}
      style={{
        minHeight: tokens.layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
        backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg,
        borderWidth: 3, borderColor: selected ? theme.brand : theme.border,
        opacity: disabled && !selected ? 0.6 : 1, ...tokens.elevation.e1,
      }}>
      <Avatar avatarId={player.profile.avatar} size="md" />
      <AppText role="headline" style={{ flex: 1 }}>{player.profile.nickname}</AppText>
      {voted && <AppText role="headline" color="success">✓</AppText>}
      {selected && <AppText role="headline" color="brand">●</AppText>}
    </Pressable>
  );
}
```

`apps/mobile/src/components/room.tsx` — RoomCodeDisplay, CodeInput:

```tsx
import { useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { AppText } from './ui';

/** §3 RoomCodeDisplay: 4 chars, displayXL, one rounded tile each. (Tap-to-copy: 3b, needs expo-clipboard.) */
export function RoomCodeDisplay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  return (
    <View accessibilityLabel={`Room code ${code.split('').join(' ')}`} style={{ alignItems: 'center', gap: tokens.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        {code.toUpperCase().slice(0, 4).split('').map((c, i) => (
          <View key={i} style={{
            width: 64, height: 80, borderRadius: tokens.radii.lg, backgroundColor: theme.surface,
            alignItems: 'center', justifyContent: 'center', ...tokens.elevation.e2,
          }}>
            <AppText role="displayXL">{c}</AppText>
          </View>
        ))}
      </View>
      <AppText role="caption" color="textMuted">Read it out loud — friends join with this code</AppText>
    </View>
  );
}

/** 4-tile code entry: one hidden TextInput drives four display tiles (auto-uppercase, alnum only). */
export function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { theme, tokens } = useTheme();
  const ref = useRef<TextInput>(null);
  const chars = [0, 1, 2, 3].map((i) => value[i] ?? '');
  return (
    <Pressable onPress={() => ref.current?.focus()}>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, justifyContent: 'center' }}>
        {chars.map((c, i) => (
          <View key={i} style={{
            width: 56, height: 68, borderRadius: tokens.radii.lg, backgroundColor: theme.surface,
            borderWidth: 2, borderColor: i === value.length ? theme.brand : theme.border,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <AppText role="displayL">{c}</AppText>
          </View>
        ))}
      </View>
      <TextInput
        ref={ref} value={value} autoCapitalize="characters" autoCorrect={false} maxLength={4}
        onChangeText={(t) => onChange(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4))}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}
```

- [ ] **Step 2: Verify** — `pnpm --filter @bloop/mobile typecheck` → exit 0. `pnpm test` → 32/171. `pnpm check:firewall` → OK.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(mobile): component kit — buttons w/ press-pop, Avatar/PlayerCard/VoteCard, room-code display + entry, toasts"
```

---

### Task 7: Root layout (fonts + theme) and HOME screen

**Files:** Replace `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`.

- [ ] **Step 1: Implement**

`apps/mobile/app/_layout.tsx`:

```tsx
import { Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme } from '../src/theme/colors';
import { ThemeProvider } from '../src/theme/ThemeProvider';

export default function RootLayout() {
  const [loaded] = useFonts({
    Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
  });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: lightTheme.bg }} />;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: lightTheme.bg } }} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

`apps/mobile/app/index.tsx` — identity card + Join (primary) + Create (secondary). Per the 3a brief, Join Game is the primary CTA (the design doc's §4.2 sketch has Create primary — noted as a deviation):

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PlayerProfile } from '@bloop/protocol';
import { AVATARS } from '../src/avatars';
import { Avatar } from '../src/components/players';
import { AppText, PrimaryButton, SecondaryButton, ToastHost } from '../src/components/ui';
import { CodeInput } from '../src/components/room';
import { roomsUrl, SERVER_URL } from '../src/config';
import type { SessionToast } from '../src/net/session';
import { loadProfile, normalizeNickname, randomProfile, saveProfile } from '../src/storage/profile';
import { useTheme } from '../src/theme/useTheme';

export default function Home() {
  const { theme, tokens } = useTheme();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [nickDraft, setNickDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<SessionToast | null>(null);
  const oops = (text: string) => setToast((t) => ({ seq: (t?.seq ?? 0) + 1, kind: 'error', text }));

  useEffect(() => {
    void (async () => {
      let p = await loadProfile(AsyncStorage);
      if (p === null) { p = randomProfile(); await saveProfile(AsyncStorage, p); } // §5: instant anonymous identity
      setProfile(p);
      setNickDraft(p.nickname);
    })();
  }, []);

  if (profile === null) return null;

  const update = (p: PlayerProfile) => { setProfile(p); void saveProfile(AsyncStorage, p); };
  const commitNickname = () => {
    const n = normalizeNickname(nickDraft);
    if (n === null) { setNickDraft(profile.nickname); return; }
    setNickDraft(n);
    update({ ...profile, nickname: n });
  };

  const createRoom = async () => {
    Keyboard.dismiss();
    commitNickname();
    setCreating(true);
    try {
      const res = await fetch(roomsUrl(SERVER_URL), { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { code: string };
      router.push(`/room/${body.code}/lobby`);
    } catch {
      oops("Couldn't reach the bloop server — is wrangler dev running?");
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = () => {
    Keyboard.dismiss();
    commitNickname();
    router.push(`/room/${code}/lobby`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ToastHost toast={toast} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.xxl, alignItems: 'stretch' }}>
          <AppText role="titleL" style={{ textAlign: 'center', marginTop: tokens.spacing.xxl }}>BLOOP 🫧</AppText>

          {/* Identity card — the only "onboarding" (§4.2) */}
          <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, gap: tokens.spacing.lg, ...tokens.elevation.e1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.lg }}>
              <Pressable onPress={() => setPickerOpen((o) => !o)} accessibilityLabel="Change avatar">
                <Avatar avatarId={profile.avatar} size="lg" ring="you" />
              </Pressable>
              <TextInput
                value={nickDraft} onChangeText={setNickDraft} onBlur={commitNickname} maxLength={20}
                placeholder="Your nickname" placeholderTextColor={theme.textMuted}
                style={{ flex: 1, ...tokens.type.headline, color: theme.textPrimary, borderBottomWidth: 2, borderColor: theme.border, paddingVertical: tokens.spacing.sm }}
              />
            </View>
            {pickerOpen && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, justifyContent: 'center' }}>
                {AVATARS.map((a) => (
                  <Pressable key={a.id} accessibilityLabel={a.label} onPress={() => { update({ ...profile, avatar: a.id }); setPickerOpen(false); }}>
                    <Avatar avatarId={a.id} size="md" ring={a.id === profile.avatar ? 'you' : null} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Join (primary per 3a brief) */}
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>GOT A CODE?</AppText>
            <CodeInput value={code} onChange={setCode} />
            <PrimaryButton label="Join Game" onPress={joinRoom} disabled={code.length !== 4} />
          </View>

          <SecondaryButton label="Create Room" onPress={() => void createRoom()} disabled={creating} />
          <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>No accounts. Nothing stored about you. 2–16 players.</AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify** — `pnpm --filter @bloop/mobile typecheck`; `pnpm test` → 32/171. Boot on the emulator (run procedure): fonts load, identity card shows a random avatar + nickname, avatar picker opens/picks/persists across an app reload (shake → Reload, or `r` in the Metro terminal). "Create Room" without the server running shows the error toast.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(mobile): root layout (Baloo2/Inter fonts, theme) + Home — identity card, join-by-code, create room"
```

---

### Task 8: Room session route — `room/[code]/_layout` + LOBBY

**Files:** Create `apps/mobile/app/room/[code]/_layout.tsx`, `apps/mobile/app/room/[code]/lobby.tsx`.

- [ ] **Step 1: Implement**

`apps/mobile/app/room/[code]/_layout.tsx`:

```tsx
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RoomSessionContext } from '../../../src/net/context';
import { useRoomSession } from '../../../src/net/useRoomSession';
import { AppText, PrimaryButton, ToastHost } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme/useTheme';

const FATAL_COPY = {
  UPGRADE_REQUIRED: 'Bloop got an update! Grab the newest version to keep playing.',
  ROOM_FULL: "That room is full or mid-game — ask for a fresh code.",
} as const;

export default function RoomLayout() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { theme, tokens } = useTheme();
  const session = useRoomSession((code ?? '').toUpperCase());

  // No device identity yet (deep entry) → back to Home to pick one.
  useEffect(() => {
    if (session.profile === 'missing') router.replace('/');
  }, [session.profile]);

  if (session.state.fatal !== null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', padding: tokens.layout.screenPadding, gap: tokens.spacing.xxl }}>
        <AppText role="displayL" style={{ textAlign: 'center' }}>🫧💥</AppText>
        <AppText role="titleM" style={{ textAlign: 'center' }}>{FATAL_COPY[session.state.fatal]}</AppText>
        <PrimaryButton label="Back to Home" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  return (
    <RoomSessionContext.Provider value={session}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <ToastHost toast={session.state.toast} />
        {session.state.status === 'reconnecting' && (
          <View style={{ backgroundColor: theme.warning, paddingVertical: tokens.spacing.xs, alignItems: 'center' }}>
            <AppText role="caption" color="textOnBrand">Reconnecting…</AppText>
          </View>
        )}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
      </View>
    </RoomSessionContext.Provider>
  );
}
```

`apps/mobile/app/room/[code]/lobby.tsx`:

```tsx
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlayerCard } from '../../../src/components/players';
import { RoomCodeDisplay } from '../../../src/components/room';
import { AppText, PrimaryButton, SecondaryButton } from '../../../src/components/ui';
import { asTracerView } from '../../../src/games/tracer-view';
import { useRoom } from '../../../src/net/context';
import { useTheme } from '../../../src/theme/useTheme';

export default function Lobby() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { tokens } = useTheme();
  const { state, sendStartGame, leave } = useRoom();
  const me = state.players.find((p) => p.id === state.playerId);
  const isHost = me?.isHost === true;
  const connectedCount = state.players.filter((p) => p.connected).length;

  // A live (non-over) tracer view means the game is on → move to the container.
  const tv = asTracerView(state.view);
  useEffect(() => {
    if (tv !== null && tv.phase !== 'over') router.replace(`/room/${code}/play`);
  }, [tv !== null && tv.phase !== 'over']);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.xxl }}>
        <RoomCodeDisplay code={(code ?? '').toUpperCase()} />
        {state.playerId === null && <AppText role="body" color="textMuted" style={{ textAlign: 'center' }}>Joining the room…</AppText>}

        <View style={{ gap: tokens.spacing.sm }}>
          <AppText role="overline" color="textSecondary">YOUR SQUAD · {connectedCount} OF 16</AppText>
          {state.players.map((p) => <PlayerCard key={p.id} player={p} isYou={p.id === state.playerId} />)}
        </View>

        {isHost
          ? <PrimaryButton label="Start Game" onPress={() => sendStartGame('tracer')} disabled={connectedCount < 2} />
          : <AppText role="body" color="textMuted" style={{ textAlign: 'center' }}>Waiting for the host to start… 🫧</AppText>}
        {isHost && connectedCount < 2 && (
          <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>Tracer needs at least 2 players — share the code!</AppText>
        )}
        <SecondaryButton label="Leave Room" onPress={() => { leave(); router.replace('/'); }} />
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify** — `pnpm --filter @bloop/mobile typecheck`; `pnpm test` → 32/171; `pnpm check:firewall` → OK. Smoke on the emulator with the server up (run procedure, Terminals A+B): Create Room → lobby renders code + your PlayerCard with crown + "1 OF 16"; Start Game stays disabled solo.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(mobile): room session route + lobby — squad list, host start, reconnect banner, fatal screens"
```

---

### Task 9: GAME CONTAINER — tracer vote / reveal / over

**Files:** Create `apps/mobile/app/room/[code]/play.tsx`.

- [ ] **Step 1: Implement**

`apps/mobile/app/room/[code]/play.tsx`:

```tsx
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import { Avatar, VoteCard } from '../../../src/components/players';
import { AppText, PrimaryButton, SecondaryButton } from '../../../src/components/ui';
import { asTracerView, secondsLeft } from '../../../src/games/tracer-view';
import { useRoom } from '../../../src/net/context';
import { useTheme } from '../../../src/theme/useTheme';

const UNKNOWN: Omit<RoomPlayer, 'id'> = { profile: { nickname: '???', avatar: '' }, connected: false, isHost: false };

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export default function Play() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { theme, tokens } = useTheme();
  const { state, sendVote, leave } = useRoom();
  const tv = asTracerView(state.view);
  const now = useNow(tv !== null && tv.phase !== 'over');

  useEffect(() => {
    if (tv === null) router.replace(`/room/${code}/lobby`); // no game running → back to the lobby
  }, [tv === null]);
  if (tv === null) return null;

  const byId = new Map(state.players.map((p) => [p.id, p]));
  const player = (id: string): RoomPlayer => byId.get(id) ?? { id, ...UNKNOWN };
  const left = secondsLeft(state.deadlineAt, now);
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {tv.phase !== 'over' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText role="overline" color="textSecondary">ROUND {tv.round + 1} OF {tv.totalRounds}</AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            )}
          </View>
        )}

        {tv.phase === 'vote' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
              <AppText role="titleM" style={{ textAlign: 'center' }}>{tv.prompt}</AppText>
            </View>
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
              {tv.myVote === null ? 'TAP SOMEONE TO VOTE' : 'VOTE LOCKED — WAITING FOR THE OTHERS'}
            </AppText>
            {state.players.filter((p) => p.id !== state.playerId).map((p) => (
              <VoteCard
                key={p.id} player={p} selected={tv.myVote === p.id} voted={tv.hasVoted[p.id] === true}
                disabled={tv.myVote !== null} onPress={() => sendVote(p.id)}
              />
            ))}
          </View>
        )}

        {tv.phase === 'reveal' && (
          <View style={{ gap: tokens.spacing.md }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>The votes are in!</AppText>
            <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>{tv.prompt}</AppText>
            {ranked(tv.tally).map(([id, votes], i) => (
              <View key={id} style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                borderRadius: tokens.radii.lg, padding: tokens.spacing.lg,
                borderWidth: i === 0 && votes > 0 ? 3 : 0, borderColor: theme.xp, ...tokens.elevation.e1,
              }}>
                <AppText role="titleM" color="textMuted">{i + 1}</AppText>
                <Avatar avatarId={player(id).profile.avatar} size="md" />
                <AppText role="bodyStrong" style={{ flex: 1 }}>{player(id).profile.nickname}</AppText>
                <AppText role="headline" color="brand">{votes} vote{votes === 1 ? '' : 's'}</AppText>
                <AppText role="caption" color="textMuted">{tv.scores[id] ?? 0} pts</AppText>
              </View>
            ))}
          </View>
        )}

        {tv.phase === 'over' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="displayL" style={{ textAlign: 'center' }}>Game over! 🎉</AppText>
            {ranked(tv.scores).map(([id, pts], i) => (
              <View key={id} style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, ...tokens.elevation.e1,
              }}>
                <AppText role="titleM">{i === 0 ? '👑' : i + 1}</AppText>
                <Avatar avatarId={player(id).profile.avatar} size="md" />
                <AppText role="bodyStrong" style={{ flex: 1 }}>{player(id).profile.nickname}</AppText>
                <AppText role="headline" color="xp">{pts} pts</AppText>
              </View>
            ))}
            <PrimaryButton label="Back to Lobby" onPress={() => router.replace(`/room/${code}/lobby`)} />
          </View>
        )}

        {/* Mid-game there is no "back to lobby" — the lobby route redirects to a live game.
            Leaving mid-game is a real leave (the server frees the seat after grace). */}
        {tv.phase !== 'over' && (
          <SecondaryButton label="Leave Game" onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Verify** — `pnpm --filter @bloop/mobile typecheck`; `pnpm test` → 32/171; `pnpm check:firewall` → OK. (Full gameplay is exercised in Task 11 with the bots.)

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat(mobile): tracer game container — vote cards w/ hasVoted ticks, reveal podium, final scores"
```

---

### Task 10: `dev-bots.mjs` — drive extra players from the host machine

**Files:** Create `apps/mobile/scripts/dev-bots.mjs`.

- [ ] **Step 1: Implement**

```js
#!/usr/bin/env node
/**
 * Dev helper: joins N bot players to a room on local wrangler dev and auto-votes,
 * so one phone + one human can exercise the full tracer loop.
 * Usage: node apps/mobile/scripts/dev-bots.mjs <ROOMCODE> [count=2]
 * Env: BLOOP_SERVER (default http://127.0.0.1:8787 — bots run ON the host).
 * Requires Node >= 22 (global WebSocket).
 */
const code = (process.argv[2] ?? '').toUpperCase();
const count = Number(process.argv[3] ?? 2);
if (!/^[A-Z0-9]{4}$/.test(code)) {
  console.error('usage: node apps/mobile/scripts/dev-bots.mjs <ROOMCODE> [count]');
  process.exit(2);
}
const server = (process.env.BLOOP_SERVER ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
const wsBase = server.replace(/^http/, 'ws');
const AVATARS = ['emoji:robot', 'emoji:alien', 'emoji:ghost', 'emoji:dino', 'emoji:octopus'];

function bot(i) {
  const name = `Bot ${i}`;
  const ws = new WebSocket(`${wsBase}/rooms/${code}/ws`);
  let playerId = null;
  let votedRound = -1;
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({
      type: 'hello', protocolVersion: 1,
      profile: { nickname: name, avatar: AVATARS[i % AVATARS.length] },
    }));
  });
  ws.addEventListener('message', (e) => {
    let m;
    try { m = JSON.parse(String(e.data)); } catch { return; }
    if (m.type === 'welcome') { playerId = m.playerId; console.log(`[${name}] seated as ${playerId}`); }
    if (m.type === 'error') console.log(`[${name}] error: ${m.code}`);
    if (m.type === 'view' && m.view?.phase === 'vote' && m.view.myVote === null && m.view.round !== votedRound) {
      votedRound = m.view.round;
      const targets = Object.keys(m.view.hasVoted).filter((p) => p !== playerId);
      const target = targets[Math.floor(Math.random() * targets.length)];
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'action', payload: { kind: 'vote', target } }));
        console.log(`[${name}] round ${m.view.round + 1}: voted`);
      }, 1_200 + Math.random() * 800);
    }
    if (m.type === 'view' && m.view?.phase === 'over') console.log(`[${name}] game over`, m.view.scores);
  });
  ws.addEventListener('close', (e) => console.log(`[${name}] closed (${e.code})`));
}

for (let i = 1; i <= count; i++) bot(i);
console.log(`${count} bot(s) joining room ${code} via ${server} — Ctrl+C to drop them`);
```

- [ ] **Step 2: Verify standalone** — with Terminal A running (`pnpm --filter @bloop/server dev`):

```powershell
$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8787/rooms
node apps/mobile/scripts/dev-bots.mjs $r.code 2
```

Expected: both bots print `seated as <uuid>` and stay connected (Ctrl+C to exit). `pnpm test` → 32/171.

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore(mobile): dev-bots script — N auto-voting WS players for emulator gameplay verification"
```

---

### Task 11: MANUAL EMULATOR VERIFICATION CHECKLIST + full gate + push

No new files. Three terminals: **A** server, **B** Metro/app, **C** bots.

- [ ] **Step 1: Bring the stack up**

```powershell
# Terminal A
pnpm --filter @bloop/server dev          # wrangler dev → http://127.0.0.1:8787
Invoke-RestMethod http://127.0.0.1:8787/health   # → ok:true (from another shell)

# Terminal B (boot AVD first if not running)
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd bloop_pixel
pnpm --filter @bloop/mobile android      # accept Expo Go install on first run
```

- [ ] **Step 2: Walk the checklist on the emulator** (every line must pass)

1. **Identity:** Home shows a random avatar + fun nickname. Edit nickname to `Théo`, pick another avatar; reload the app (`r` in Terminal B) → both persisted.
2. **Create:** tap Create Room → Lobby with 4-char `RoomCodeDisplay`, your PlayerCard with 👑 + "(you)" + Online, "1 OF 16". Note the code as `<CODE>`.
3. **Solo-start guard:** Start Game is disabled at 1 player (tracer `minPlayers` is **2** — the brief's "3" was wrong; the client gates on 2, and the server would answer `BAD_MESSAGE` regardless).
4. **Bots join:** Terminal C → `node apps/mobile/scripts/dev-bots.mjs <CODE> 2` → Bot 1 + Bot 2 appear in the squad list within a second.
5. **Start → vote:** tap Start Game → play screen: prompt card, "ROUND 1 OF 3", countdown from ~30s, two VoteCards (you are excluded). Bots vote after ~1–2s → ✓ ticks appear on their cards.
6. **Vote:** tap a bot → card ring + ●, cards disable, copy flips to "VOTE LOCKED". All 3 votes in → **reveal** fires simultaneously: podium with vote counts + pts, leader ringed in sunbeam.
7. **Rounds advance:** after ~5s reveal → round 2; play through round 3 → **Game over** screen: ranked final scores, 👑 on the winner.
8. **Rematch:** Back to Lobby → squad intact → Start Game again → fresh round 1 (server `roundOver` → new game).
9. **Reconnect token:** start a game, then swipe Expo Go away mid-vote (kill the app). Relaunch from Terminal B, Home → enter `<CODE>` → Join Game → you are back in the SAME seat mid-game (no duplicate player, view restored). This proves the AsyncStorage token reclaim — a fresh join during `playing` would have been refused with `ROOM_FULL`.
10. **Bad room code:** Home → join `ZZZZ` → lobby stays "Joining the room…" with the Reconnecting… banner (the front door 404s the upgrade; the WS layer can't distinguish — documented behavior). Leave Room returns Home cleanly.
11. **Error toasts (already unit-tested, spot-check one):** with the game NOT running, have a bot host... skip live `NOT_HOST` (bots never host); instead verify the BAD_MESSAGE toast path by tapping Start Game from a non-host instance if available, or accept the Tier-A reducer coverage. `UPGRADE_REQUIRED`/`ROOM_FULL` fatal screens are covered by reducer tests + step 9's happy inverse.
12. **Second human (optional):** a second AVD profile (`emulator -avd <other> -port 5556`) running Expo Go from the same Metro, or any desktop WS client, can replace one bot.

- [ ] **Step 3: Full gate**

Run from `r2/bloop`: `pnpm check`
Expected, in order, all green: Tier A **32 files/171 tests** → Tier B **13 files/55 tests** → typecheck exit 0 across all packages (now incl. @bloop/mobile) → `check:billing OK` → `check:firewall OK` → `check:bundle OK` (server bundle untouched, ~36% of budget).

- [ ] **Step 4: Clean tree, push**

From repo root: `git status` → only `r2/bloop` paths.

```bash
git push origin r3
```

---

## Deferred (deliberate non-goals — Plan 3b+)

- **QR scan/generate, deep links (`bloop://join/ABCD`), share sheet** — codes are typed by hand in 3a (no expo-camera ⇒ Expo Go stays sufficient).
- **Tap-to-copy room code** (expo-clipboard), **TimerRing** SVG (react-native-svg; 3a shows numerals), **ConfettiBurst/Sticker layer**, mascot SVG avatar set, reduced-motion gating (`useMotion()`), Settings screen, game registry (`src/games/registry.ts` — one game hard-wired in 3a), interstitial/ads/consent, Sentry/PostHog, expo-updates UPGRADE flow (3a shows the fatal screen only), dark theme activation.
- **RTL/jest-expo component tests** — see decisions; revisit when screens grow logic.
- **Server-side:** none — zero server/protocol changes in 3a.

## Deviations from the design doc / task brief (and why)

1. **SDK 55 over 56** — 56's expo-router rewrite is weeks old; 55 is the mature stable and the emulator gets its Expo Go from the CLI either way.
2. **Home CTA order follows the 3a brief** (Join Game primary + code entry, Create Room secondary), not §4.2's sketch (Create primary). One-line swap later.
3. **`minPlayers` is 2, not 3** (verified in `packages/games/tracer/src/tracer.ts`); the checklist tests solo-start-blocked + 3-player play.
4. **§2.1 `themes.ts` folded into `colors.ts`** exactly as §6.2's file map dictates; `outline` (§2.6, no file assigned) lives in `elevation.ts`.
5. **Components grouped into 3 files** (`ui/players/room.tsx`) with the doc's component names as exports — fewer files, same API.
6. **No `create.tsx`/`join/` routes** (§4.1): 3a's Home hosts both flows inline; the route split returns with QR/game-picker in 3b.
7. **Emoji avatars only** — the doc's mascot set is an explicit external art dependency (§7.2).
8. **Lobby→play navigation is state-driven** (redirect on live view) rather than message-driven — the server view broadcast is the single source of truth, so a mid-game rejoin lands correctly for free.

## Open questions

1. Should the front door expose `GET /rooms/:code` (exists/lobby-size) so the client can fail bad codes fast instead of the silent-retry loop (checklist step 10)? Additive server change — propose in 3b.
2. Rate-limit warns reuse `BAD_MESSAGE` — if the toast copy proves confusing, revisit the deferred `RATE_LIMITED` code (Plan 2d open question 1) together with client UX.
3. Does Metro's default resolver already handle `.js → .ts` on this SDK? The Task-1 resolver is a no-op if so — delete it the day Expo documents native support.
