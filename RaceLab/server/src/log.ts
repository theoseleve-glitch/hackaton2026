/**
 * Minimal structured logger — one JSON line to STDERR. A 500/400 that is
 * invisible server-side is undiagnosable in production; the client only ever
 * sees an opaque reason (no stack leak), so this is the sole server-side trail.
 * NEVER logs request bodies, tokens, emails, or PII — only route + correlation
 * id + the error's name/message. Logging must never throw (it is wrapped).
 */

export interface LogFields {
  level: "error" | "warn" | "info";
  msg: string;
  route?: string;
  request_id?: string;
  status?: number;
  err_name?: string;
  err_msg?: string;
}

export function logLine(fields: LogFields): void {
  try {
    // stderr so it never mixes with the JSON response body
    console.error(JSON.stringify(fields));
  } catch {
    /* logging is best-effort; it must never break a request */
  }
}

/** Extract a safe {name,message} from an unknown thrown value (never the stack). */
export function errFields(e: unknown): { err_name: string; err_msg: string } {
  if (e instanceof Error) return { err_name: e.name, err_msg: e.message.slice(0, 300) };
  return { err_name: "non_error", err_msg: String(e).slice(0, 300) };
}
