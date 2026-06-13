// Node 25 ships an experimental native `globalThis.localStorage` that lacks the
// full Web Storage API (no `.clear`/`.key`/`.removeItem`) unless the runtime is
// started with a valid `--localstorage-file` path. Because that native global
// already exists, jsdom 25 does NOT install its own Storage implementation, so
// `window.localStorage === globalThis.localStorage` and both are the broken stub.
//
// Install a spec-compliant in-memory Storage so tests can rely on the standard
// Web Storage contract. This touches only the test environment, never app code.
function needsPolyfill(s: unknown): boolean {
  return !s || typeof (s as { clear?: unknown }).clear !== 'function';
}

if (needsPolyfill(globalThis.localStorage)) {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}
