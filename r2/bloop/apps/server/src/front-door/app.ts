import { Hono } from 'hono';
import type { Env } from '../types.js';

export const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));
