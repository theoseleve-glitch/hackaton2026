# Chassis Library

One `.md` file per car model = the **complete list of setup values** for that chassis (every adjustable parameter, its type, allowed options, and the kit default). These files are the source of truth from which the app's JSON setup-sheet schemas (`packages/schema`, Decision D5) will be generated.

## Folder convention

```
chassis/<category>/<brand>/<model>.md
```

- **category**: `1-8-nitro-buggy`, `1-8-e-buggy`, `1-8-truggy`, `1-10-2wd-buggy`, `1-10-4wd-buggy`, `1-10-stadium-truck`, `1-10-sc`, …
- **brand**: `kyosho`, `team-associated`, `tlr`, `tekno`, `mugen`, `xray`, `sworkz`, …
- **model**: kit name in kebab-case, e.g. `inferno-mp11`, `rc8b4`, `8ight-x`.

## File rules

1. **Mirror the manufacturer's blank setup sheet** — same sections, same parameter names, so a racer recognizes their sheet instantly and PDF export maps 1:1.
2. Every parameter gets: **type** (`number` / `enum` / `text` / `boolean`), **unit or options**, **kit default** (from the instruction manual), and notes when a value interacts with another part.
3. **Option catalogs** (springs, oils, sway bars, gearing…) listed at the end with official part numbers — they become the dropdown values in the app and keep the AI's recommendations orderable.
4. Sources cited at the top (setup sheet version, manual edition). If the manufacturer revises the sheet, bump the version and log the change.

## Status

| Chassis | File | Source documents | Status |
|---|---|---|---|
| Kyosho Inferno MP11 (1/8 nitro buggy) | [`1-8-nitro-buggy/kyosho/inferno-mp11.md`](1-8-nitro-buggy/kyosho/inferno-mp11.md) | Official setup sheet v1.00 + instruction manual No. 33028-T02 (both in repo root) | ✅ Complete |
| Team Associated RC8B4 | — | to collect | ⬜ |
| TLR 8IGHT-X | — | to collect | ⬜ |
| *(launch list: see `docs/02_FEATURES_CORE.md` §1.1)* | | | |
