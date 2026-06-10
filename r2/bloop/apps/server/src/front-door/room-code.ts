/**
 * Design §2.1: Crockford-ish alphabet — A–Z minus I/L/O, plus 2–9 — 31 chars,
 * no OCR/QR ambiguity. 31^4 = 923,521 codes (~0.5% collision per pick at a
 * pessimistic 5,000 live rooms; one retry settles it). Codes are
 * case-insensitive on input and uppercased BEFORE idFromName (review I2).
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

const CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Static blocklist of GENERATABLE 4-char slurs (a constant set, NOT the obscenity runtime filter). Words needing I/L/O/0/1 can never be generated. */
export const BLOCKED_CODES: ReadonlySet<string> = new Set([
  'FUCK', 'FCUK', 'PHUK', 'FUKK', 'CUNT', 'KUNT', 'TWAT', 'RAPE',
  'ARSE', 'CRAP', 'DAMN', 'SEXY', 'PUSY', 'PUTE', 'MERD', 'CACA',
]);

export function generateRoomCode(): string {
  let code = '';
  while (code.length < ROOM_CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    for (const b of bytes) {
      if (code.length === ROOM_CODE_LENGTH) break;
      if (b < 248) code += ROOM_CODE_ALPHABET[b % 31]!; // 248 = 8*31: rejection sampling, no modulo bias
    }
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  return CODE_RE.test(code);
}

/** Uppercased code, or null when the input is not a possible code. */
export function normalizeRoomCode(raw: string): string | null {
  const upper = raw.toUpperCase();
  return isValidRoomCode(upper) ? upper : null;
}

export function isBlockedCode(code: string): boolean {
  return BLOCKED_CODES.has(code);
}
