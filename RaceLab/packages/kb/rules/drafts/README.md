# Draft rules — NOT bundled (D18 staging)

Agent-authored tuning rules land here **first**, pending William's source/citation
verification. The KB loader (`engine/src/node-kb.ts`) reads only the top-level
`kb/rules/*.yaml`; this `drafts/` subtree is **deliberately excluded** from the
bundle, so an unverified rule can never reach the live deterministic engineer
(grounded-or-silent). `test-modelgating.ts` asserts a draft id never appears in
`loadKBData()`.

**Promotion:** once a rule's citation is confirmed page-cited against a real
source (`docs/research/world-map/sources.json` tier A), move it up to
`kb/rules/<family>.yaml`, run `npm run bundle`, and it goes live.

`_sentinel.yaml` is a permanent canary proving the exclusion holds.
