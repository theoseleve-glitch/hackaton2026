/**
 * Vercel runtime glue — structural node-ish request/response types (no
 * @vercel/node dependency), conversion to the pure HttpRequest, and a cached
 * deploy context so cold starts pay for wiring once. Every api/*.ts entry is
 * a one-liner over runVercel.
 */

import type { HttpRequest, HttpResponse } from "./types";
import { makeHandler } from "./handler";
import { getDeployCtx } from "./deploy";

export interface NodeLikeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  /** Vercel pre-parses JSON bodies; raw strings are tolerated too. */
  body?: unknown;
}

export interface NodeLikeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}

let handlerPromise: Promise<(req: HttpRequest) => Promise<HttpResponse>> | null = null;

/** CORS for the browser checkout/portal calls from the marketing site. The RN
 *  app doesn't need it; Stripe (webhook) is server-to-server. Origin-scoped to
 *  WEB_ORIGIN (default racelabrc.app) — not a wildcard, since requests carry a
 *  bearer. (Alternatively, front the API under the web domain via a Vercel
 *  rewrite so calls are same-origin and this is a no-op.) */
function applyCors(res: NodeLikeResponse): void {
  const origin = process.env.WEB_ORIGIN ?? "https://racelabrc.app";
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "Origin");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization, content-type");
  res.setHeader("access-control-max-age", "86400");
}

export async function runVercel(req: NodeLikeRequest, res: NodeLikeResponse): Promise<void> {
  applyCors(res);
  if ((req.method ?? "GET").toUpperCase() === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  let response: HttpResponse;
  try {
    if (handlerPromise === null) handlerPromise = getDeployCtx().then(makeHandler);
    const handle = await handlerPromise;
    response = await handle(toHttpRequest(req));
  } catch {
    handlerPromise = null; // misconfiguration: retry the wiring next invocation
    response = { status: 500, json: { error: "server_misconfigured" } };
  }
  res.statusCode = response.status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(response.json));
}

/** A request whose body may still be an unread stream (bodyParser disabled). */
export interface RawReadableRequest extends NodeLikeRequest {
  on?(event: "data" | "end" | "error", cb: (chunk?: unknown) => void): void;
}

/**
 * Read the EXACT request bytes. The Stripe webhook entry disables Vercel's body
 * parser, so the body arrives as a stream (or, on some runtimes, a pre-read
 * string/Buffer). Stripe signature verification fails on a re-serialized body,
 * so we must never JSON round-trip it.
 */
export async function readRawBody(req: RawReadableRequest): Promise<string> {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.on !== "function") return "";
  return await new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    req.on!("data", (c) => chunks.push(Buffer.from(c as Buffer)));
    req.on!("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on!("error", () => resolve(""));
  });
}

/** Webhook entrypoint: reads raw bytes, threads them as rawBody for signature
 *  verification, then runs the normal router. */
export async function runVercelWebhook(req: RawReadableRequest, res: NodeLikeResponse): Promise<void> {
  let response: HttpResponse;
  try {
    const raw = await readRawBody(req);
    if (handlerPromise === null) handlerPromise = getDeployCtx().then(makeHandler);
    const handle = await handlerPromise;
    const httpReq = toHttpRequest({ ...req, body: undefined });
    response = await handle({ ...httpReq, rawBody: raw });
  } catch {
    handlerPromise = null;
    response = { status: 500, json: { error: "server_misconfigured" } };
  }
  res.statusCode = response.status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(response.json));
}

export function toHttpRequest(req: NodeLikeRequest): HttpRequest {
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
      /* leave as string — handlers reject it as invalid_body */
    }
  }
  return {
    method: (req.method ?? "GET").toUpperCase(),
    path: url.pathname,
    headers: req.headers,
    query,
    body,
  };
}
