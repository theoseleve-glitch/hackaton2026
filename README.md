# 48H — Théo × William

> Build at night, sell by day, get paid for real.

Tue 5pm → Thu 5pm. The score is **yes**: someone replies, takes a call, pays.

## Scoreboard

| Line | Value |
|------|-------|
| 💰 Team money collected | €0 |
| 🥊 Build-duel points (Théo–William) | 0 – 0 |
| 📞 Contact-duel points (Théo–William) | 0 – 0 |

_A **sale** = money that actually moved. **Soft sale** = firm verbal yes / signed intent. **Lead** = "keep me posted." Only real money counts for the team target._

## How rounds work (90 min each)

Every round opens with a ~15-min joint brainstorm, then splits:

- **Odd rounds — fight.** Each picks their favourite idea, 90 min solo → real thing + 1-page BP + deck + contact plan. Decks handed in; round winner picked from decks.
- **Even rounds — collaborate.** One idea for both, built together, work split freely.

Build first (while people sleep), then contact (while they're awake). Each block of build rounds gets a matching block of contact rounds the next morning, one-to-one.

**Iron rule: nothing built sleeps without being put in front of someone.**

## Git workflow

| Round | Branch(es) | Rule |
|-------|-----------|------|
| Odd (fight) | `theo/r1`, `william/r1`, `theo/r3`… | Solo, off `main`. Never merged into each other. |
| Even (collab) | `collab/r2`, `collab/r4`… | Shared, both push. |
| `main` | — | Only winning / surviving ideas merge here between rounds. |

```bash
# Start a fight round
git switch main && git pull
git switch -c theo/r1

# Start a collab round (whoever goes first)
git switch -c collab/r2 && git push -u origin collab/r2
# the other joins:
git fetch && git switch collab/r2
```

## Prep checklist (before 5pm)

- [ ] Stripe live + generic payment link ready to fire
- [ ] Deck / BP template (`templates/deck-bp-template.md`)
- [ ] Message templates (`templates/message-templates.md`)
- [ ] Hit-list merged (`hit-list.md`)
- [ ] "Good moves" scratch file (`good-moves.md`)
- [ ] Paid tools in hand; ~€100 each in reserve
