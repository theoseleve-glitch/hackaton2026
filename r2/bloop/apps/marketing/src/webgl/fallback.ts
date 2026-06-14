import { prefersReducedMotion } from '../lib/scroll';

let cachedSupport: boolean | undefined;
export function webglSupported(): boolean {
  if (cachedSupport !== undefined) return cachedSupport;
  try {
    const c = document.createElement('canvas');
    cachedSupport = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    cachedSupport = false;
  }
  return cachedSupport;
}
export function shouldRenderBlob(): boolean {
  return webglSupported() && !prefersReducedMotion() && !matchMedia('(pointer: coarse)').matches;
}
