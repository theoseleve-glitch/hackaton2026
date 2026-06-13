import { describe, it, expect } from "vitest";
import { lerp } from "./motion";
describe("lerp", () => {
  it("interpolates", () => expect(lerp(0, 10, 0.5)).toBe(5));
  it("returns start at t=0", () => expect(lerp(2, 8, 0)).toBe(2));
});
