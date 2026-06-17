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

export async function runVercel(req: NodeLikeRequest, res: NodeLikeResponse): Promise<void> {
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
