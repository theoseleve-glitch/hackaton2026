export const env = {
  reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  reducedData: matchMedia("(prefers-reduced-data: reduce)").matches,
  isMobile: matchMedia("(max-width: 768px), (pointer: coarse)").matches,
  supportsWebGL: (() => {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch {
      return false;
    }
  })(),
};

// Heavy WebGL is desktop-only: phones / coarse pointers get the static fallback.
export const wantsHeavyGfx =
  !env.reduced && !env.reducedData && !env.isMobile && env.supportsWebGL;

// Anything that should drop to a lighter experience (no Lenis, no heavy scrub).
export const lightMode = env.reduced || env.reducedData;
