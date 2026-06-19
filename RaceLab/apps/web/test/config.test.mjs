import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/config.js";

test("BRAND is a non-empty string", () => {
  assert.equal(typeof C.BRAND, "string");
  assert.ok(C.BRAND.length > 0);
});
test("every CTA points at racelabrc.app", () => {
  const hrefs = [C.HERO.ctaPrimary.href, C.PRICING.cta.href, C.FINAL.cta.href];
  for (const h of hrefs) assert.match(h, /racelabrc\.app/);
});
test("conversion CTAs land on the /subscribe checkout page", () => {
  const hrefs = [C.HERO.ctaPrimary.href, C.PRICING.cta.href, C.FINAL.cta.href];
  for (const h of hrefs) assert.match(h, /^https:\/\/racelabrc\.app\/subscribe$/);
});
test("RACELAB_WEB exposes placeholder (non-secret) config", () => {
  assert.equal(C.RACELAB_WEB.CLERK_PUBLISHABLE_KEY, "pk_REPLACE_ME");
  assert.match(C.RACELAB_WEB.API_BASE, /^https:\/\//);
  // never ship a Stripe secret on the web side
  assert.doesNotMatch(JSON.stringify(C.RACELAB_WEB), /sk_(live|test)_/);
});
test("subscribe plans mirror pricing 9,99 € / 99,99 €", () => {
  assert.ok(C.SUBSCRIBE.plans.monthly.price.includes("9,99"));
  assert.ok(C.SUBSCRIBE.plans.annual.price.includes("99,99"));
  assert.equal(C.SUBSCRIBE.plans.annual.note, "2 mois offerts");
});
test("pricing has monthly 9.99 and annual 99.99", () => {
  assert.ok(C.PRICING.plans.some((p) => p.price.includes("9,99") && p.per.includes("mois")));
  assert.ok(C.PRICING.plans.some((p) => p.price.includes("99,99") && p.per.includes("an")));
});
test("the loop has exactly 5 stations in order", () => {
  assert.deepEqual(C.LOOP.stations.map((s) => s.n), ["Course", "Journal", "Ingénieur", "Résultat", "Partage"]);
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
