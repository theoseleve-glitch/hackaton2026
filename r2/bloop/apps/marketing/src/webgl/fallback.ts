import { prefersReducedMotion } from '../lib/scroll';

export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
export function shouldRenderBlob(): boolean {
  return webglSupported() && !prefersReducedMotion() && !matchMedia('(pointer: coarse)').matches;
}
