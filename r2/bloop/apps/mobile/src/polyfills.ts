/**
 * Global polyfills required by partysocket in the Hermes/React Native runtime.
 * Must be imported BEFORE any partysocket import (see app/_layout.tsx).
 *
 * Hermes ships Event + EventTarget since RN 0.71 but NOT MessageEvent or
 * CloseEvent. partysocket's WebSocket wrapper constructs these when dispatching
 * socket events, so we polyfill them minimally here.
 */

// event-target-polyfill covers Event + EventTarget (partysocket peer dep)
import 'partysocket/event-target-polyfill';

declare const global: Record<string, unknown>;

// MessageEvent — used by partysocket for 'message' events
if (typeof global.MessageEvent === 'undefined') {
  global.MessageEvent = class MessageEvent extends Event {
    readonly data: unknown;
    readonly origin: string;
    readonly lastEventId: string;
    constructor(type: string, init?: MessageEventInit) {
      super(type, init);
      this.data = init?.data ?? null;
      this.origin = init?.origin ?? '';
      this.lastEventId = init?.lastEventId ?? '';
    }
  };
}

// CloseEvent — used by partysocket for 'close' events
if (typeof global.CloseEvent === 'undefined') {
  global.CloseEvent = class CloseEvent extends Event {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;
    constructor(type: string, init?: CloseEventInit) {
      super(type, init);
      this.code = init?.code ?? 0;
      this.reason = init?.reason ?? '';
      this.wasClean = init?.wasClean ?? false;
    }
  };
}
