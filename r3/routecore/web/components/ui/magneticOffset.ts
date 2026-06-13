export function magneticOffset(
  cx: number, cy: number, rect: { left: number; top: number; width: number; height: number }, strength: number
): { x: number; y: number } {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return { x: (cx - centerX) * strength, y: (cy - centerY) * strength };
}
