import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/config.js";

test("BRAND is a non-empty string", () => {
  assert.equal(typeof C.BRAND, "string");
  assert.ok(C.BRAND.length > 0);
});
test("every CTA points at griplab.app", () => {
  const hrefs = [C.HERO.ctaPrimary.href, C.PRICING.cta.href, C.FINAL.cta.href];
  for (const h of hrefs) assert.match(h, /griplab\.app/);
});
test("pricing has monthly 9.99 and annual 99.99", () => {
  assert.ok(C.PRICING.plans.some((p) => p.price.includes("9.99") && p.per.includes("month")));
  assert.ok(C.PRICING.plans.some((p) => p.price.includes("99.99") && p.per.includes("year")));
});
test("the loop has exactly 5 stations in order", () => {
  assert.deepEqual(C.LOOP.stations.map((s) => s.n), ["Race", "Log", "Engineer", "Result", "Share"]);
});
test("engineer report has all 8 parts", () => {
  assert.equal(C.ENGINEER.report.length, 8);
});
test("tune has 4 scrubbed steps", () => {
  assert.equal(C.TUNE.steps.length, 4);
});
test("features gallery has 8 cards", () => {
  assert.equal(C.FEATURES.cards.length, 8);
});
