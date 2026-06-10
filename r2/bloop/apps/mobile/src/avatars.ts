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
