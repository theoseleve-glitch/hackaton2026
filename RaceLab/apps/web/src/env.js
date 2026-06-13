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

export const wantsHeavyGfx = !env.reduced && !env.reducedData && env.supportsWebGL;
