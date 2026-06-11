import { playerProfileSchema, type PlayerProfile } from '@bloop/protocol';
import { AVATAR_WIRE_VALUE } from '../avatars';

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

/** §5: first launch = fun nickname suggestion (editable); the avatar derives from the
 *  name (Brand Book §5) so the wire field is a constant. rng injectable for tests. */
export function randomProfile(rng: () => number = Math.random): PlayerProfile {
  const nickname = NICKNAMES[Math.floor(rng() * NICKNAMES.length)]!;
  return { nickname, avatar: AVATAR_WIRE_VALUE };
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
