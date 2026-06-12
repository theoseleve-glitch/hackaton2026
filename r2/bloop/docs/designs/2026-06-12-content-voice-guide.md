# Bloop Content Voice Guide — « Sah, on arrête le contenu de daron »

**Date:** 2026-06-12
**Status:** Editorial law — binding for all content rewrites (the 17 rewrite agents) and all future packs
**Trigger:** co-founder verdict on current content: "extremely lame and AI-like, humour really prude — make it more transgressive, violent (verbal/hyperbolic), conflictual"
**Inputs:** 5-lens research (FR slang, FR humor mechanics, EN slang, EN humor mechanics, edge calibration vs. CAH/Limite Limite/Picolo/Juduku/Truth-or-Drink + store policy); `2026-06-11-wave2-17-games-design.md` (game roster + spicy tiers)
**Scope note:** this guide governs card/prompt/UI text. It does not change any mechanic, schema or spicy-tier assignment in the wave-2 design doc. Where this guide and old sample items conflict, this guide wins — most existing sample items are the "BEFORE" column.

---

## 0 — North star, in one paragraph

Bloop is not the comedian. Bloop is **the instigator**: the friend who slides the knife across the table, points at someone, and says « vas-y, raconte ». The players' real shared history is the content; our text is the prosecutor's opening statement. Every line must do one of three things: **expose someone in the room, force an indefensible choice, or start an argument**. If a line could appear in a parental brochure, a corporate icebreaker, or an "icebreakers for teens!" listicle, it's dead on arrival. Transgressive means *socially* dangerous (exposure, betrayal, shame, hyperbolic cartoon violence) — never *identity* dangerous (see the hard floor, §3).

**The three lint questions every rewritten line must pass:**
1. **Does it name a detail, not a category?** ("le McFlurry à la main", not "en retard")
2. **Is somebody in the room the target or the evidence?** (a player, the group's history, or the speaker confessing)
3. **Could the table argue about it for 30 seconds?** (a votable verdict, a split, a justification owed)

---

## 1 — Voice principles (what makes a line land)

### 1.1 Specificity IS the joke
The all-time best cards in the genre are not the dirtiest — they're the most hyper-specific. Name the object, the timestamp, the price, the platform. "40 minutes late", "un McFlurry", "3 a.m.", "the 2019 photo he liked". AI-tell: gesturing at a category ("something embarrassing", "quelque chose de coquin"). Fix: one concrete noun + one absurd precision.

### 1.2 Evidence, then verdict. Period.
The native FR comic structure is one concrete evidence sentence + a one-word judgment with a period: « Il a maté d'autres meufs. Red flag. » The full stop does the comedic timing. Write cards as drops, never as riddles with explanations. Never explain the joke — explanation is the death certificate.

### 1.3 Escalation: stack specifics until it's a felony of pettiness
"Who has a **private** finsta **dedicated** to stalking **their ex's** **situationship**?" — each added detail raises the laugh and the accusation. One escalation per line minimum; the last word should be the most incriminating.

### 1.4 Call out the room
"…someone **in this room**" is the single highest-value phrase in party prompt writing. The group's shared history is the content; the laugh is the eye contact, not the sentence. Aim prompts at players present, at the group chat they actually share, at the ex two of them know.

### 1.5 Absurd hyperbole > literal shock
"Violent" means cartoon-hyperbolic, quantified, deniable: « -1000 points d'aura », "throw your best friend's phone in the Seine", "balance-le aux zombies pour gagner 12 secondes". Displacement trick: put the brutal verb on an absurd object or a cartoon frame — the word lands, no real victim exists. 2012 shock-nouns read millennial; 2026 edge is interpersonal exposure.

### 1.6 Conflict is the product
A line that everyone agrees with is filler. Engineer disagreement: binary verdicts with no safe middle, dilemmas where both options cost something real, rankings where someone must be last, predictions that can be publicly wrong. The reveal with names attached ("TOI t'as voté ça ?!") is the payoff — write toward it.

### 1.7 Confession framed as status
Self-implication is the cheapest edge and the safest. « Raconte ton lore avec ton ex » makes oversharing feel like flexing. The cohort prefers confessing its own misère (la hess, en PLS, goumin) to mocking absent third parties. Best unprudish prompts make confession feel like a flex, not a sentencing.

### 1.8 Irony is the default reading; the app never hypes
Every superlative flips: "Masterclass." after a fail IS the insult. UI copy is lowercase, deadpan, economical. "Get ready for a HILARIOUS challenge!" is a millennial in a lanyard. "ok. this next one has ended friendships. proceed." is the voice. The app may roast itself (CAH register: the game disrespects you affectionately) — it never claims to be funny.

### 1.9 Register carries the voice, not vocabulary
Natural spoken French = elisions and cadence (t'as, y'a, j'sais pas, « T'as craqué ou quoi ? ») — zero slang nouns needed. English = lowercase texting register (ngl, deadass, lowkey) as connective tissue. Hybrid grammar is the FR authenticity marker: English verbs conjugated French (« elle m'a ghost », « il a glow up ») — never "rizz" as a noun in a formal sentence.

### 1.10 The card is half the joke
Blanc-Manger Coco's own principle: cards are neutral-ish; the *combination* (with the room, the answer, the vote) creates the explosion. Write half-jokes the room completes. A card that tries to be funny alone, in isolation, is overwritten.

### 1.11 BEFORE → AFTER pairs (the calibration set)

| # | BEFORE (lame / AI / prude) | AFTER (Bloop voice) | Principle |
|---|---|---|---|
| 1 | FR — « Qui est le plus susceptible d'arriver en retard ? » | « Qui arriverait 40 minutes en retard à ton enterrement, un McFlurry à la main ? » | specificity (§1.1) |
| 2 | FR — « Est-ce un problème de regarder le téléphone de son/sa partenaire ? » | « Elle connaît son code. Lui connaît pas le sien. Red flag ou rapport de force sain ? » | evidence→verdict (§1.2) |
| 3 | FR — « As-tu déjà menti à un ami ? » | « T'as déjà envoyé "jsuis là dans 5 min" en sortant de la douche. Cite ta dernière victime — askip elle est dans la pièce. » | call-out the room (§1.4) |
| 4 | FR — « Tu préfères parler aux animaux ou parler toutes les langues ? » | « Tu préfères : ta daronne lit tout le groupe WhatsApp à voix haute au repas de Noël, ou ton historique de recherche s'affiche sur la TV du salon pendant 24 h ? » | indefensible dilemma (§1.6) |
| 5 | FR — « Dommage, tu es éliminé ! » (UI) | « Éliminé. Le thème t'a plié devant tout le monde. Cheh. » | irony/verdict UI (§1.8) |
| 6 | FR — « Raconte un souvenir embarrassant avec un(e) ex. » | « Raconte ton lore avec ton ex. La vraie version. Pas celle que tu sors en date. » | confession as status (§1.7) |
| 7 | FR — « Quel ami de ce groupe apprécies-tu le plus ? » | « Classe tout le monde ici : du premier que tu sauves en apocalypse zombie au premier que tu balances aux zombies pour gagner 12 secondes. Justifie ton dernier. » | forced ranking + hyperbole (§1.5, §1.6) |
| 8 | FR — « Avez-vous déjà fait un achat regrettable ? » | « Le truc le plus cher que t'as acheté bourré. Le groupe vote : W ou L. » | self-implication + native scoring (§1.7) |
| 9 | EN — "Who is most likely to spend too much time on their phone?" | "Who has a private finsta dedicated to monitoring their ex's new situationship?" | escalation (§1.3) |
| 10 | EN — "Never have I ever told a lie to a friend." | "Never have I ever ghosted someone who is currently in this room." | call-out the room (§1.4) |
| 11 | EN — "Say something funny about weddings!" | "The worst thing to whisper to the groom right as the vows start." | formal straight man (§1.10) |
| 12 | EN — "Player X, do your best dance!" | "Everyone, eyes up. Bro is about to attempt choreography. Minus 1000 aura per hesitating limb." | third-person-bro roast + aura (§1.5, §1.9) |
| 13 | EN — "Would you rather be rich or famous?" | "Would you rather: your full group chat leaks to everyone named in it, or your camera roll auto-plays at the next family dinner?" | both-options-cost (§1.6) |
| 14 | EN — "Is it okay to check your partner's location?" | "He checks her location, then texts 'wyd' like he doesn't know. Green flag, red flag, or surveillance state?" | evidence→verdict (§1.2) |
| 15 | EN — "Get ready for a HILARIOUS challenge!" (UI) | "ok. this next one has ended friendships. proceed." | deadpan UI register (§1.8) |

### 1.12 AI-tells to kill on sight (rewrite-agent checklist)

- Hedging and consent-theater in card text: « si tu te sens à l'aise… », "if you're comfortable…" (consent lives in the spicy-tier opt-in, not in the sentence)
- Title Case, exclamation points, "HILARIOUS", "Get ready!", 😂 (the laugh emoji is 💀; 😂 reads boomer)
- Generic coyness: « quelque chose de coquin », "something spicy", "an embarrassing story"
- Slang stuffed as decoration, 2+ slang tokens in one line, dead slang (see §2 dead lists)
- Translated-from-the-other-locale prompts (see §6)
- Explaining the joke, softening the drop, adding a moral
- Full formal sentences where spoken French has elisions: « Honnêtement, ta tenue n'est pas idéale » → « NGL ton outfit, ça va pas. »

---

## 2 — Lexicon

**THE RULE: slang as seasoning, not soup.** Max **one** slang token per line; most lines need **zero**. Register (elisions, cadence, deadpan drops) carries the voice; slang is flavor. Density of 3+ tokens is literally a parody genre about bots. Every line must still read in 2 years — when in doubt, prefer the evergreen base (arabic-derived/verlan/nouchi in FR, texting particles in EN) over meme nouns. Trend nouns (aura is the closest to the line) belong in *swappable pack content*, never in UI strings or template copy.

### 2.1 FR — ALIVE (safe to ship)

**Evergreen core (decade-stable, hardcodable):**

| Term | Use |
|---|---|
| sah / en sah | truth-check intensifier — « Sah, c'était le pire date de ma vie » ; perfect for vote/verdict copy |
| wallah | oath, stake-raiser — « Wallah t'as 30 secondes » |
| askip | rumor-launcher — ideal gossip-prompt opener, denies responsibility |
| cheh | "you deserved it" — THE elimination/forfeit word |
| miskine | mock pity — roast-with-affection, reveal copy |
| starfoullah | deadpan mock outrage after a confession — reaction register |
| avoir le seum | rage/disgust, totally naturalized |
| la hess | broke-life self-deprecation |
| mettre le zbeul | festive chaos — party register |
| pécho / ken | hook up (ken = vulgar, fine at tier 2) — 20 years old, still universal |
| tise / tiser / khapta / bédo / le before | party-substances register, stable (mind store rules, §3) |
| en PLS | hangover/post-fail state — physical image for emotional damage |
| daron / daronne | parents — eternal, family-prompt fuel |
| les bails | the plans/the stories — « C'est quoi les bails ? » |
| charo | compulsive flirt — light roast |
| akhy / mon gâté | warm-ironic address terms (gâté = Petit Robert 2026, mainstream) |
| belek / zerma | warning / sarcasm marker — « Zerma il était malade » |
| goumin / s'enjailler / une go | nouchi wave: heartbreak / party / a girl — fresh, non-anglo, underused by competitors |

**Mainstream-fresh (dictionary-entered or 2025-26-confirmed, still safe):**

| Term | Use |
|---|---|
| dinguerie / banger / dar / déclassé | positive verdicts |
| c'est carré / carré dans l'axe | approval, "deal" |
| validé / pas validé | binary verdict — liftable as vote labels |
| éclaté au sol / guez / mid / c'est cuit | negative verdicts |
| craqué / « tu forces » / gênant | calling out fails and try-hards — « gênant » is the native "cringe" |
| matrixé | brainwashed-by — « Elle t'a matrixé, frère » |
| PNJ | NPC insult — watch pile-on context |
| masterclass (ironic) | one-word antiphrasis after a fail |
| W / L | life graded as game results — native scoring format |
| aura (±points) | quantified charisma — usable as literal penalty currency; the freshest item here, keep in pack content not UI chrome |
| le lore | someone's mythified past — confession frame |
| le ick / red flag / green flag / ghoster / crush / un date / situationship / body count / delulu / plan cul | the dating deck's base language, used as-is; conjugate franglais French (« elle m'a ghost ») |
| crash out / être en dép | meltdown / down-bad register |
| flex / flexer | humble-brag accusation |

**Texting layer (chat-styled UI/prompts ONLY, never spoken-style card text):** mdr, ptdr, tkt, jsp, askip, bg, wsh, frr, « y'a R », jsuis/chuis.

### 2.2 FR — DEAD (using these = the app is a daron)

**Banned straight (parody-of-dead-trends use only, max once per pack):** quoicoubeh, apanyan, swag, yolo, oklm, tmtc, sheesh, « c'est gucci », boloss, jpp.
**Cooling — do not hardcode, ironic quotation only:** chokbar (de bz), sus, simp, ratio, cap/no cap (prefer sah/wallah), pookie, sigma (incel-adjacent if straight), rizz-as-noun.
**Gen Alpha / collège-coded (16-30 reads it as "the little brother's humor"; explicit parody only):** 6-7, skibidi, gyatt, bombardino crocodilo and all Italian brainrot, « aura farming » said earnestly.

### 2.3 EN — ALIVE (safe to ship)

**Register particles (the durable connective tissue — these ARE the voice):** ngl, icl, fr, ong, deadass, lowkey/highkey, atp, bet, wtv, "no because…", "the way that…", lowercase + no terminal punctuation.

**Roast core:**

| Term | Use |
|---|---|
| cooked / "he is NOT cooking" | doomed — the cooked/cooking polarity flip is a joke engine |
| chopped / washed / fell off | looks/decline roasts |
| crash out / certified crashout | meltdown — superlative-vote fuel |
| NPC | no-original-thoughts insult |
| unc / lil bro / blud / twin | address-term roasts; **third person while they're present** is the grammar: "why is blud talking" |
| aura / aura points | "-10,000 aura for that" — fake-precise numbers make mockery feel objective |
| violation | a roast so disrespectful it's celebrated — category-name material |
| caught in 4K / "this you?" | receipts culture — exposure-round language |
| yap / yapper / glazing | talking too much / cringe overpraise |
| out of pocket | wildly inappropriate — category-name material |
| lock in / let him cook | focus / let-them-try (the reversal is the joke) |
| built like a ___ | infinitely generatable roast simile |
| I fear / "she's right, I fear" | camp reluctant-admission — verdict-screen copy |
| clanker / AI slop | anti-AI edge — self-aware "this card was NOT written by a clanker" jokes land |
| mogging / I know ball | looks-contest / elite-taste, niche but alive |

**Dating/exposure (most durable, most game-usable):** situationship, talking stage, the ick, body count, ghosting (the concept; vary the verb), sneaky link, soft launch, down bad (aging, still fine), finsta.

**UK flavor (reads more native to European English; mind the traps):** peng/leng, bare, innit, wasteman, "allow it", calm. **TRAP:** UK "peak" = bad (opposite of US); UK "fit" = hot person.

**AAVE provenance note:** much of this lexicon (deadass, ong, stand on business, out of pocket, finna) is AAVE. Used naturally in flow = fine; stacked as costume = minstrelsy to exactly this audience. Never decorate with it.

### 2.4 EN — DEAD

**Banned straight:** rizz (US #6 most-cringe 2026), no cap, bussin, sheesh, slay (earnest), sus, yeet, vibe check, cheugy, Ohio, fanum tax, gyatt, skibidi, 6-7 ("who left you in 2025?"), brat, "very demure", girl dinner, pookie, bae, YOLO, "spill the tea".
**Cooling — ironic quotation only:** sigma, simp, ratio, touch grass, rent free, main character, era, canon event, beige flag, "it's giving" (only survives with a killer specific after it), delulu, aura farming, huzz/bruzz, sybau, ts/pmo stacking (only as bot-parody), holy airball (keep the score-the-miss mechanic, drop the catchphrase).
**Emoji grammar (UI law):** 💀 = the laugh; 😭 = amplifier; 🙂 and 👍 = passive-aggressive (use deliberately); 😂 = boomer, banned.

---

## 3 — Edge calibration ladder (mapped to Bloop spicy tiers)

Edge at every tier comes from **exposure, conflict and hyperbole** — never from coyness at low tiers or cruelty-by-category at high ones. Prudishness, not explicitness, is what reads as AI-written. Explicitness without specificity is also dead: a tier-2 card still wins on the concrete detail, not the anatomy.

### Spicy 0 — all-ages, but PUNCHY (this is not the soft tier, it's the clean-hands tier)
- **Allowed and expected:** teasing, roast-adjacent designation (« Qui… »), social embarrassment, petty betrayal, absurd violence hyperbole (zombies, throwing phones in rivers, -1000 aura, cartoon destruction), broke-life/hess humor, family dysfunction, food crimes, "worst thing to say at ___" register clashes, elimination copy with bite (« Cheh. »).
- **Not allowed:** innuendo, substances, anything that needs an 18+ gate.
- **Calibration test:** a 15-year-old's group laughs AND argues; a parent watching finds it cheeky, not filthy. « Qui vendrait LA photo dossier du groupe pour 50 balles, sans négocier ? » is a perfect spicy-0 line — betrayal, money, zero sex.
- **The trap to avoid:** writing spicy 0 as "nice". Spicy 0 = conflictual and specific, just clean.

### Spicy 1 — taboo-adjacent: innuendo, social cruelty between friends, exposure
- **Adds:** dating/ex material (le ick, situationship, ghosting, flirting with a friend's ex), implication-heavy innuendo (taboo-ADJACENT beats explicit — the player's brain finishes the dirty work), phone-stakes exposure (search history, DMs, camera roll — as *hypotheticals and confessions*; never force a real device action that posts/sends), gossip engines (askip…), light party-alcohol context as scenery.
- **Model:** Limite Limite's frame trick — confessional structure with a hole, zero explicit words on the card; the player supplies the filth. « Si ______ n'existait pas, je serais encore vierge » energy.
- **Calibration test:** screenshot-clean (the text itself could be read on radio), socially radioactive (the answer can't be).

### Spicy 2 — 18+: sex and alcohol explicit allowed
- **Adds:** direct sexual frankness as table stakes (body count, faked orgasms, sex tape, threesome, plan cul, raunchiest-text — real shipped decks treat these as BASELINE, not outliers), drinking forfeits (one-sip phrasing only; authoring lint rejects chug/« cul sec »/escalation wording — see truth-or-drink design §2.8), ken-tier vulgarity in FR.
- **Still wins on specificity:** "A sad handjob" (two words, emotional specificity) outperforms anatomical detail. Intimacy is the edge, not vocabulary.
- **Calibration test:** an adult table leans in; nobody is described, everybody is implicated.

### THE HARD FLOOR — applies at EVERY tier, no exceptions (app-store survivable)
1. **No protected-trait punching.** Race, religion-as-people (religion-as-institution absurdism is tolerable in print culture; in-app, skip it), sexual orientation, gender identity, disability, ethnicity, caste, immigration status — never the butt, never the punchline, never "just a stereotype joke". Apple 1.1 + Google hate policy are explicit; so is the brand.
2. **No real private individuals.** Celebrities only as absurd yardsticks in non-sexual, non-criminal frames (« …qu'Etchebest te recracherait à la gueule » = fine; celebrity + sex/crime = defamation, banned). No real politicians/parties ever (gauche-ou-droite editorial rule).
3. **Nothing sexual near minors.** No exceptions, no "but it's absurd". Don't even place minors adjacent to tier-1/2 content.
4. **No incitement to actual harm.** No real-device dares that post/send/dox, no consent-boundary dares (Picolo's documented failure = our opening), no self-harm/suicide framing, no "make the player actually do X to another person's body", no excessive-drinking framing.
5. **Punch at behaviors, choices, and friends-in-the-room — never at identities.** "Who would sell the group photo" = behavior. "Who's the [identity]" = banned. Roast what someone *did* or *would do*, never what someone *is*.
6. **Rape/assault never played straight.** CAH removed those cards and said so publicly. Displacement onto absurd objects (« violer un nid de frelons ») is a print-culture artifact — in-app, don't.

**Adversarial design check (adopt CAH's writers-room test verbatim):** for each card ask *"in the worst possible hands, how could this be played to actually hurt someone?"* If the answer is "a player could weaponize it against a marginalized identity present", rewrite or cut.

**Deck composition:** never 100% edge. Target ~60-70% edgy / 30-40% clean-absurd palate cleansers per pack (« ne pas croire aux girafes » tier) — the clean cards keep the dirty ones loud.

---

## 4 — Conflict mechanics: writing prompts that START ARGUMENTS

The product goal is not laughs in isolation — it's the table erupting. The argument IS the gameplay between rounds. Seven proven argument-starters:

1. **Direct call-outs.** « …quelqu'un dans cette pièce », "…someone in this room right now". Converts trivia into live exposure; the laugh is the eye contact and the denial. Best single phrase in the genre.
2. **Forced rankings with a loser.** Someone MUST be last, and must be justified out loud. « Classe les 3 personnes ici du plus au moins utile en garde à vue. » The justification beat is mandatory — « Justifie. » as a closing one-word sentence is house style.
3. **Indefensible choices.** Both options must cost something real and personal (group chat leak vs camera roll). If one option is obviously safe, the dilemma is dead — kill every "talk to animals vs speak languages" whimsy. The perfect dilemma produces a 50/50 split and a fight.
4. **Verdict votes with no middle.** Validé/pas validé, W ou L, red flag/green flag, « ça passe ou ça passe pas » — binary only, public avatars at reveal (« TOI t'as voté ça ?! » is the fuel). Never add a "neutral" option.
5. **'Balance ton pote' energy.** The app supplies the weapon, the players pick the victim: designation prompts (« Qui serait capable de… »), accusation frames, « askip » rumor launchers, third-person-bro fake concern ("why is blud defending himself"). The app never names the victim — the room does.
6. **Prediction gaps.** Make players bet on each other (tu-preferes predict-the-majority, cinquante-cinquante crowd numbers) — being publicly WRONG about your friends is an argument generator ("you really thought I'd pick A??").
7. **Receipts and defense.** Make players defend their own past: "defend your last impulse purchase", « assume ton historique », "your search history takes the stand". Self-defense in front of a jury of friends = co-authored comedy, zero app liability.

**Anti-patterns:** prompts the whole table answers identically (no argument), prompts about absent third parties (no stakes), prompts with an escape hatch ("or not, your choice!"), prompts that resolve in one word with no justification owed.

**Debate-fuel copy (debateStarters, reveal captions):** write them as provocations, not summaries. A debateStarter must be an attackable thesis (« Écolo dans le discours, abandonnée en travers du trottoir dans les faits. ») — one side of the room should want to fight it.

---

## 5 — Per-game tone notes (the 17)

1. **`gauche-ou-droite` — mock-sociology deadpan.** The voice is a fake-serious cultural critic delivering verdicts on raclette. debateStarters are attackable theses, not descriptions — each must arm ONE side of the room. Dry, precise, faux-academic register clashing with dumb subjects (the "classement IA" register). Never real parties/politicians/elections; the edge is class-coded pettiness (« petit plaisir de bourgeois »), not politics.

2. **`tu-preferes` — genuinely horrible dilemmas, not whimsical ones.** Both options must cost something personal: dignity, secrets, relationships, the group chat. Gross-absurd is fine (sausage fingers stays) but the deck's spine is social-stakes dilemmas where the table splits 50/50 and fights. Kill every superpower/wholesome item. The prediction layer means copy should taunt wrong predictors at reveal (« Tu connais pas tes potes. »).

3. **`pires-potes` — maximum friend-exposure; the flagship accusation engine.** Every card indicts a person present for a hyper-specific plausible betrayal (the funeral-McFlurry register). Shame is the trophy — winning copy crowns, never consoles. Behavior and choices only, never appearance/identity/trauma (this game is the closest to the bullying line — the adversarial check applies to every card). 18+ flagship goes harder on exes, money treason and phone secrets; soft sibling keeps the same violence of specificity with clean topics.

4. **`quizz-culture-ge` (Au Pif !) — smug-encyclopedia voice.** Questions are deadpan-baroque ("in SECONDS?"); funFacts are punchlines that roast the players' guesses and the world (« plus court que ta story Insta », "Jurassic Park lied to you"). The voice knows everything and is unimpressed by everyone. Never dry textbook copy — every funFact ends on a drop.

5. **`cinquante-cinquante` — incriminating statistics.** Stems must be confessional (« Honnêtement, j'ai déjà… ») and completions must escalate from universal to indefensible — the comedy is 1000 strangers admitting what your table denies. Reveal copy weaponizes the numbers against the room (« 62 % stalkent leur ex. Vous êtes six. Faites le calcul. »). Argument with the fictional crowd is the design goal — numbers must stay plausible or trust dies.

6. **`double-jeu` — paranoia noir.** Copy fuels suspicion, never relieves it: accusation language, interrogation beats, dry menace (« Quelqu'un ici ne parle pas du même endroit que vous. »). The wrongly-accused clearing is vindication drama (« Pas l'imposteur. Présentez vos excuses. »). No slapstick — the tension IS the fun; the items themselves stay neutral nouns.

7. **`truth-or-dare-2` (Fun & Lover) — two registers, zero coyness.** *Fun* = chaotic public-embarrassment energy: dares are durational absurd bits that infect the session (T-rex tier), truths are call-outs of universal shame. *Lover* (tier 2, 18+) = direct adult frankness — body count, raunchiest text, real intimacy questions, written like Truth-or-Drink's Extra Dirty tier. The instant death of this deck is « quelque chose de coquin » coyness: at tier 2, ask the actual question.

8. **`truth-or-drink` — interrogation room with a bar tab.** Questions must be worth dodging: if nobody would ever tap « Je bois » to avoid it, the question is too weak — cut it. The escape is the dramatic beat, so questions aim at secrets with named stakes (exes present, group-chat treason, money). Forfeit cards are deadpan-ceremonial (« SANTÉ ! »), one-sip phrasing only, lint-enforced. The verdict vote (« Vraie réponse / Esquive 🐔 ») invites the table to call bullshit — copy should encourage the accusation.

9. **`devine-l-action` — the room gangs up on one body.** The performer is the consenting sacrificial lamb; copy addresses the helpers as co-conspirators (« Il sait pas. Vous savez tous. Faites-le souffrir proprement. »). Actions should be absurd-physical with one humiliating precision. Hype is allowed here ONLY as ironic sports-commentary on a doomed athlete.

10. **`jeu-de-la-note` (La Note) — petty-precision judging.** The voice celebrates the absurdity of grading everything: prompts invite calibrated pettiness (« Décris un date qui vaut exactement ce score »). Reveal copy treats decimal differences as moral failures (« T'as mis 7. C'était un 4. Vous devez parler. »). Quantified-judgment culture (aura, W/L) is this game's native register.

11. **`devine-la-question` — the decoys do the dirty work.** The comedy is what the answer COULD have been answering: decoy questions must be more incriminating than the real one (« 'Trois fois' — répond-il à… »). Write decoys as escalating accusations; the mystery player squirming at what the room considers plausible IS the game. Hints are dry, withholding, slightly disappointed.

12. **`double-le-mouvement` — talent-show host with zero faith.** The app is a deadpan producer introducing acts it expects to fail (« Eyes up. Bro is about to attempt choreography. »). Star-rating copy is brutal-precise (1 star = « C'était une expérience. »). The blind-dub reveal caption is the second punchline — write it as betrayal comedy (« THAT was supposed to be a cat?! »).

13. **`mime-inverse` — consensual gaslighting.** The room puppeteers one clueless body; copy leans into the puppeteering (« Obéis. Comprends plus tard. »). Commander instructions are imperative-military; the reveal is the payoff and gets the ceremonial drop (« Tu viens de passer 45 secondes à accoucher d'un frigo. »). Cruelty is structural and consented — the text can be merciless because the mechanic is kind.

14. **`jeu-du-theme` (Last Word Standing) — battle-royale trash talk.** Shrinking clock = escalating menace; copy gets shorter and colder as the timer does. Elimination lines are verdict drops (« Silence. Éliminé. Cheh. »); survival lines crown with irony (« Toujours en vie. Personne ne sait comment. »). Jury-vote copy invites bad faith (« Le mot est faible ? Punissez. »).

15. **`devine-l-objet` — dispute-stoking referee.** Claim-credit is the conflict engine: copy should anticipate and relish the « c'est MOI qui l'ai dit ! » fight (« X s'attribue la victoire. Le tribunal populaire tranche. »). Validation-vote copy is mock-judicial. Keep object items concrete and slightly cursed — the best mimes come from objects with one shameful use case.

16. **`trouvez-la-regle` — heist tension, snitch economy.** Followers are a conspiracy; detectives are the police; convictions are betrayals and the copy treats them as such (« Vendu par les tiens. La règle survit. »). Tribunal language throughout (accusation, conviction, perfect round = « crime parfait »). The voice rewards loyalty-under-pressure and mocks snitches affectionately.

17. **`loup-garou` — dark-epic, not slapstick.** Village-gothic narration with dry menace: deaths get gravitas and one cold image (« Le village se réveille. Il manque une voix. »), never jokes at the corpse's expense. Lynch copy is judicial and irreversible; wolf-win copy is quietly chilling. The ONLY game where the app drops the roast register entirely — the comedy here comes from the players' paranoia, and the text's job is atmosphere. No memes, no slang, no aura points in narration; role cards may keep one wry line max.

---

## 6 — FR/EN duality rule: transcreate, never translate

**Law: every item is written natively in its locale by (or as) a native speaker of that culture's humor. A translated joke is a dead joke wearing the original's clothes.**

- **Two source texts, one item id.** FR and EN versions of an item share the slot and the mechanic, not the words. Write FR first for FR-coded premises, EN first for EN-coded ones, then *transcreate*: keep the comic STRUCTURE (evidence→verdict, escalation, register clash), swap every cultural anchor.
- **Swap the anchors, keep the shape.** La CAF / le McDo / le before / la daronne / le vocal de 3 minutes / Châtelet / la raclette ↔ the group chat / finsta / venmo requests / the talking stage / oat-milk lattes / brunch. « De gauche ou de droite » ↔ "Left-coded or Right-coded" (the native form of the same meme, not a translation of the French one).
- **Register maps, not word maps.** sah/wallah ↔ deadass/ong; « gênant » ↔ "violation"; mdr ↔ 💀 (not "lol" — FR youth never type lol); cheh ↔ "you deserved that, ngl"; W/L works in both. Elision-French ↔ lowercase-texting English.
- **Different taboo topographies.** FR tolerates darker absurdism and substance references in print culture; EN (esp. US store reviewers) is touchier on alcohol and rawer on dating frankness. UK register ("leng", "bare", "innit") reads more native to European English players than US mall-speak — default EN voice = lightly UK-leaning neutral, US-isms only when load-bearing. Mind the traps: UK "peak" = bad, UK "fit" = hot.
- **Numbers and facts re-localize too.** cinquante-cinquante crowd percentages are re-estimated per locale (pineapple pizza polls differently in Paris and Portland); Au Pif funFacts must be natively funny in each language, units localized (km ↔ miles).
- **The test:** read the EN item to a Londoner and the FR item to a Lyonnais — both should believe it was written FOR them. If either can smell the other language under the surface, rewrite from scratch.
- **Process for rewrite agents:** never open the other locale's text while writing. Read the item's *mechanical spec* (slot, spicy tier, target structure), then write blind in your locale. Compare only afterward, for tier and mechanics parity — never for wording.

---

## 7 — Ship checklist (per rewritten line)

- [ ] Names a concrete detail (noun, number, timestamp, platform) — no categories
- [ ] Targets the room, the speaker, or a votable verdict — someone owns the consequence
- [ ] Could start a 30-second argument
- [ ] ≤ 1 slang token, from the ALIVE lists only; line still works if the token is removed
- [ ] Reads aloud as spoken language (elisions in FR, lowercase register in EN)
- [ ] No hedging, no Title-Case hype, no explained joke, no 😂
- [ ] Correct spicy tier; passes the hard floor; passes the worst-possible-hands test
- [ ] Still funny in 2028 (structure evergreen; any trend-noun lives in swappable pack content)
- [ ] Transcreated, not translated — both locales pass the native-smell test
