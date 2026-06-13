import { describe, it, expect } from "vitest";
import { splitToWords } from "./split";
describe("splitToWords", () => {
  it("splits on spaces, preserving words", () => {
    expect(splitToWords("Le GPS")).toEqual(["Le", "GPS"]);
  });
  it("handles single word", () => expect(splitToWords("Échappée")).toEqual(["Échappée"]));
});
