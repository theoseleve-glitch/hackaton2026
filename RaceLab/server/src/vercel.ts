/**
 * Vercel runtime glue — structural node-ish request/response types (no
 * @vercel/node dependency), conversion to the pure HttpRequest, and a cached
 * deploy context so cold starts pay for wiring once. Every api/*.ts entry is a
 * one-liner over runVercel — EXCEPT api/webhooks/stripe.ts, which uses
 * runVercelRaw (Stripe signs the exact request bytes, so its body must NOT be
 * JSON-parsed; that route's function sets bodyParser:false).
 */

import type { HttpRequest, HttpResponse } from "./types";
import { makeHandler } from "./handler";
import { getDeployCtx } from "./deploy";

export interface NodeLikeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  /** Vercel pre-parses JSON bodies; raw strings are tolerated too. With
   *  bodyParser:false (the stripe route) body is undefined and req is a stream. */
  body?: unknown;
}

export interface NodeLikeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}

let handlerPromise: Promise<(req: HttpRequest) => Promise<HttpResponse>> | null = null;

async function getHandle(): Promise<(req: HttpRequest) => Promise<HttpResponse>> {
  if (handlerPromise === null) handlerPromise = getDeployCtx().then(makeHandler);
  return handlerPromise;
}

function newRequestId(): string {
  // Node/Vercel always provide WebCrypto; fall back to a timestamp-free token.
  return globalThis.crypto?.randomUUID?.() ?? "req-unknown";
}

/** One place that writes the response: status, JSON body, correlation id, the
 *  Allow header on a 405, and conservative security headers (no sniff / no
 *  intermediary caching of authed JSON). */
function finalize(res: NodeLikeResponse, response: HttpResponse, requestId: string): void {
  res.statusCode = response.status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cache-control", "no-store");
  const allow = response.json["allow"];
  if (Array.isArray(allow)) res.setHeader("allow", allow.join(", "));
  res.end(JSON.stringify(response.json));
}

export async function runVercel(req: NodeLikeRequest, res: NodeLikeResponse): Promise<void> {
  const requestId = newRequestId();
  let response: HttpResponse;
  try {
    const handle = await getHandle();
    response = await handle(toHttpRequest(req, requestId));
  } catch {
    handlerPromise = null; // misconfiguration: retry the wiring next invocation
    response = { status: 500, json: { error: "server_misconfigured" } };
  }
  finalize(res, response, requestId);
}

/** RAW-body path for the Stripe webhook ONLY. Reads the unparsed request bytes
 *  (never JSON.parse) so the Stripe signature verifies against the exact body.
 *  Dispatches through the same router; the stripe handler reads body as a string. */
export async function runVercelRaw(req: NodeLikeRequest, res: NodeLikeResponse): Promise<void> {
  const requestId = newRequestId();
  let response: HttpResponse;
  try {
    const handle = await getHandle();
    const raw = await readRawBody(req);
    response = await handle({ ...toHttpRequest(req, requestId), body: raw });
  } catch {
    handlerPromise = null;
    response = { status: 500, json: { error: "server_misconfigured" } };
  }
  finalize(res, response, requestId);
}

/** Collect the raw request body as a string without parsing. With
 *  bodyParser:false the request is a Node stream; a pre-supplied string is used
 *  as-is; a Buffer is decoded. Anything else (a parsed object — bodyParser left
 *  on by mistake) is returned as "" so the stripe handler surfaces
 *  raw_body_required instead of silently re-stringifying. */
async function readRawBody(req: NodeLikeRequest): Promise<string> {
  if (typeof req.body === "string") return req.body;
  const maybeBuf = req.body as { toString?: (enc: string) => string } | undefined;
  if (maybeBuf instanceof Uint8Array) return Buffer.from(maybeBuf).toString("utf8");
  const stream = req as unknown as AsyncIterable<Uint8Array | string> & { [Symbol.asyncIterator]?: unknown };
  if (typeof stream[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  if (maybeBuf?.toString !== undefined && typeof req.body === "object" && req.body !== null) return ""; // parsed object → force raw_body_required
  return "";
}

export function toHttpRequest(req: NodeLikeRequest, requestId?: string): HttpRequest {
  const url = new URL(req.url ?? "/", "http://internal");
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });
  let body: unknown = req.body;
  if (typeof body === "string" && body !== "") {
    try {
      body = JSON.parse(body);
    } catch {
      /* leave as string — handlers reject it as bad_request */
    }
  }
  // thread the correlation id into the headers so the router can log it
  const headers = requestId !== undefined ? { ...req.headers, "x-request-id": requestId } : req.headers;
  return {
    method: (req.method ?? "GET").toUpperCase(),
    path: url.pathname,
    headers,
    query,
    body,
  };
}
