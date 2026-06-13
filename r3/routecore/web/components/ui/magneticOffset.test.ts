import { describe, it, expect } from "vitest";
import { magneticOffset } from "./magneticOffset";

const rect = { left: 100, top: 100, width: 100, height: 100 } as DOMRect;

describe("magneticOffset", () => {
  it("returns zero at the element center", () => {
    expect(magneticOffset(150, 150, rect, 0.4)).toEqual({ x: 0, y: 0 });
  });
  it("pulls toward the cursor scaled by strength", () => {
    // cursor 50px right of center, strength 0.4 => 20px
    expect(magneticOffset(200, 150, rect, 0.4)).toEqual({ x: 20, y: 0 });
  });
});
