import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types.js';

export class RoomDO extends DurableObject<Env> {}
