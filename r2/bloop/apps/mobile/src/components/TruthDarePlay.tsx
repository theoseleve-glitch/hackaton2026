import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { Choice, DramaTag, Intensity, Reaction, ReactionCounts, TdResult, Verdict } from '@bloop/game-truth-dare';
import { asTruthDareView, deviceLang, pickL, TD_REACTIONS, type Lang } from '../games/truth-dare-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import { EpilogueCard, haptics, MultiplierBadge, Pop, type EpilogueStanding } from './juice';
import { Avatar } from './players';
import { AppText, PrimaryButton, SecondaryButton } from './ui';

const UNKNOWN: Omit<RoomPlayer, 'id'> = { profile: { nickname: '???', avatar: '' }, connected: false, isHost: false };

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Big Truth / Dare (or verdict) choice chip. */
function ChoiceChip({ label, accent, onPress, disabled }: {
  label: string; accent: string; onPress: () => void; disabled?: boolean;
}) {
  const { theme, tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress} disabled={disabled === true}
      accessibilityLabel={label}
      style={{
        backgroundColor: accent,
        borderRadius: tokens.radii.xl,
        borderWidth: 3,
        borderColor: theme.stickerOutline,
        padding: tokens.layout.cardPadding,
        opacity: disabled === true ? 0.55 : 1,
        ...tokens.elevation.e2,
      }}>
      <AppText role="titleM" style={{ textAlign: 'center', color: '#FFFFFF' }}>{label}</AppText>
    </Pressable>
  );
}

/** Rotation rail: every seat, active spotlighted, disconnected greyed. */
function RotationRail({ rotation, activeId, connected, nick }: {
  rotation: readonly string[]; activeId: string; connected: Record<string, boolean>; nick: (id: string) => string;
}) {
  const { tokens } = useTheme();
  return (
    <View
      accessibilityLabel={`Turn order, ${nick(activeId)} is up`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, justifyContent: 'center' }}>
      {rotation.map((id) => (
        <Avatar
          key={id} name={nick(id)} size={id === activeId ? 'md' : 'sm'}
          ring={id === activeId ? 'you' : null} connected={connected[id] === true}
        />
      ))}
    </View>
  );
}

/** The drawn card: choice + tier badge over the prompt text. */
function PromptCard({ choice, intensity, text, lang }: {
  choice: Choice; intensity: string; text: { fr: string; en: string }; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const badge = choice === 'truth' ? L('VÉRITÉ', 'TRUTH') : L('ACTION', 'DARE');
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, gap: tokens.spacing.md, ...tokens.elevation.e2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing.sm }}>
        <View style={{ backgroundColor: choice === 'truth' ? theme.truth : theme.dare, borderRadius: tokens.radii.pill, paddingHorizontal: tokens.spacing.md, paddingVertical: 2 }}>
          <AppText role="overline" style={{ color: '#FFFFFF' }}>{badge}</AppText>
        </View>
        <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.pill, paddingHorizontal: tokens.spacing.md, paddingVertical: 2 }}>
          <AppText role="overline" color="textSecondary">{intensity.toUpperCase()}</AppText>
        </View>
      </View>
      <AppText role="titleM" style={{ textAlign: 'center' }}>{pickL(text, lang)}</AppText>
    </View>
  );
}

/**
 * CC-1 "Call your shot": non-active spectators bet Done or Chicken on the active
 * player during the prompt. Owner-only echo of own bet + a public count — never
 * per-voter identity. Once cast, the choice is locked (re-tap is a no-op server-side).
 */
function CallYourShot({ activeName, myBet, count, onBet, lang }: {
  activeName: string; myBet: Verdict | null; count: number; onBet: (bet: Verdict) => void; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const locked = myBet !== null;
  const BetChip = ({ bet, label, accent }: { bet: Verdict; label: string; accent: string }) => {
    const picked = myBet === bet;
    // After a bet, the un-picked side dims; before, both invite the tap.
    const dim = locked && !picked;
    return (
      <Pressable
        onPress={() => { if (!locked) onBet(bet); }}
        disabled={locked}
        accessibilityLabel={label}
        style={{
          flex: 1, backgroundColor: picked ? accent : theme.surface,
          borderRadius: tokens.radii.xl, borderWidth: 3,
          borderColor: picked ? theme.stickerOutline : theme.border,
          paddingVertical: tokens.spacing.lg, paddingHorizontal: tokens.spacing.md,
          alignItems: 'center', opacity: dim ? 0.5 : 1,
          ...(picked ? tokens.elevation.e2 : tokens.elevation.e1),
        }}>
        <AppText role="titleM" style={{ textAlign: 'center', color: picked ? '#FFFFFF' : undefined }}>{label}</AppText>
      </Pressable>
    );
  };
  return (
    <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, gap: tokens.spacing.md, ...tokens.elevation.e1 }}>
      <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
        {L('🎯 PARIE SUR LE COUP', '🎯 CALL YOUR SHOT')}
      </AppText>
      <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
        {locked
          ? L(`Pari verrouillé sur ${activeName} ✓`, `Bet locked on ${activeName} ✓`)
          : L(`${activeName} va-t-il/elle le faire ?`, `Will ${activeName} pull it off?`)}
      </AppText>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        <BetChip bet="done" label={L('Fait ✅', 'Done ✅')} accent={theme.success} />
        <BetChip bet="chickened" label={L('Se dégonfle 🐔', 'Chickens 🐔')} accent={theme.danger} />
      </View>
      <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
        {count > 0
          ? L(`${count} pari${count > 1 ? 's' : ''} placé${count > 1 ? 's' : ''} 🤫`, `${count} shot${count > 1 ? 's' : ''} called 🤫`)
          : L('Sois le premier à parier !', 'Be the first to call it!')}
      </AppText>
    </View>
  );
}

// CC-2 tier-weight surfacing: each intensity gets a bilingual label + tone so a
// spicier completion's heavier points read at a glance (the engine adds a
// tier-keyed bonus to a verdicted-DONE turn). Order matches TIER_ORDER weight.
const TIER_META: Record<Intensity, { fr: string; en: string; tone: 'xp' | 'dare' | 'brand' }> = {
  soft: { fr: 'SOFT', en: 'SOFT', tone: 'xp' },
  party: { fr: 'PARTY', en: 'PARTY', tone: 'brand' },
  spicy: { fr: 'PIQUANT', en: 'SPICY', tone: 'dare' },
};

/**
 * CC-5 drama stamp — a derived chip on the score reveal, surfaced ONLY when the
 * public verdict tally produced a tag (`contested` = the room split, `roasted` =
 * the room called bullshit). null tag → renders nothing (no new secret, just the
 * already-public tally dramatised). Pops in via the shared kit (reduced-motion-safe).
 */
function DramaChip({ tag, lang }: { tag: DramaTag; lang: Lang }) {
  const { theme, tokens } = useTheme();
  if (tag === null) return null;
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const meta = tag === 'contested'
    ? { emoji: '⚖️', text: L('LA SALLE EST DIVISÉE', 'THE ROOM IS SPLIT'), bg: theme.xp, fg: 'textPrimary' as const }
    : { emoji: '🔥', text: L('GRILLÉ·E PAR LA SALLE', 'ROASTED BY THE ROOM'), bg: theme.dare, fg: 'textOnBrand' as const };
  return (
    <Pop key={tag} from={0.6} style={{ alignSelf: 'center' }}>
      <View
        accessibilityLabel={meta.text}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs,
          backgroundColor: meta.bg, borderRadius: tokens.radii.pill,
          paddingHorizontal: tokens.spacing.lg, paddingVertical: tokens.spacing.xs,
          borderWidth: 2, borderColor: theme.stickerOutline,
          ...tokens.elevation.sticker,
        }}>
        <AppText role="label">{meta.emoji}</AppText>
        <AppText role="overline" color={meta.fg}>{meta.text}</AppText>
      </View>
    </Pop>
  );
}

// CC-4 — fixed escape-reaction set (enum-only, zero free text → zero moderation
// surface). Order is the public bar order: ouch → respect → coward. Keyed off the
// shared TD_REACTIONS tuple so the enum can never drift from the package.
const REACT_META: Record<Reaction, { emoji: string; fr: string; en: string }> = {
  ouch: { emoji: '😬', fr: 'Aïe', en: 'Ouch' },
  respect: { emoji: '🙏', fr: 'Respect', en: 'Respect' },
  coward: { emoji: '🐔', fr: 'Dégonflé', en: 'Coward' },
};

/**
 * CC-4 escape-react beat — during the score reveal of a turn the active player did
 * NOT complete (escaped/chickened) the room reacts with a fixed enum. Every phone
 * shows the PUBLIC per-enum counts building live; eligible spectators (connected
 * non-active, not-yet-reacted) tap once to add theirs. NON-SCORING — a react never
 * resolves the turn. `mine` highlights the locked choice; a light haptic fires on
 * a successful tap (the kit's haptics no-op under Reduce Motion / no engine).
 */
function EscapeReactBar({ counts, mine, canReact, onReact, lang }: {
  counts: ReactionCounts; mine: Reaction | null; canReact: boolean;
  onReact: (r: Reaction) => void; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const locked = mine !== null;
  return (
    <View style={{ gap: tokens.spacing.sm, alignItems: 'center' }}>
      <AppText role="overline" color="textSecondary">
        {locked
          ? L('TA RÉACTION EST PARTIE', 'YOUR REACTION IS IN')
          : canReact
            ? L('RÉAGIS EN DIRECT', 'REACT LIVE')
            : L('RÉACTIONS DE LA SALLE', 'CROWD REACTIONS')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, justifyContent: 'center' }}>
        {TD_REACTIONS.map((key) => {
          const r = REACT_META[key];
          const isMine = mine === key;
          const tappable = canReact && !locked;
          const count = counts[key];
          return (
            <Pressable
              key={key}
              disabled={!tappable}
              onPress={() => { onReact(key); haptics.impact('light'); }}
              accessibilityRole="button"
              accessibilityState={{ disabled: !tappable, selected: isMine }}
              accessibilityLabel={L(`${r.fr} — ${count}`, `${r.en} — ${count}`)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs,
                minHeight: 44, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs,
                borderRadius: tokens.radii.pill,
                backgroundColor: isMine ? theme.brand : theme.surface,
                borderWidth: 2, borderColor: isMine ? theme.brand : theme.border,
                opacity: tappable || isMine ? 1 : 0.85,
                ...tokens.elevation.e1,
              }}>
              <AppText role="titleM">{r.emoji}</AppText>
              <AppText role="bodyStrong" color={isMine ? 'textOnBrand' : 'textPrimary'}>{count}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Score reveal: stamp + tally bar + points burst + forfeit card. */
function ScoreCard({ result, stamp, nick, lang }: {
  result: TdResult; stamp: string; nick: (id: string) => string; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const cast = result.tally.done + result.tally.chickened;
  const donePct = cast === 0 ? 0 : Math.round((result.tally.done / cast) * 100);
  const stampColor = result.verdict === 'done' ? 'success' as const : result.verdict === 'passed' ? 'xp' as const : 'danger' as const;
  // CC-2: a verdicted-DONE turn earns a tier-keyed bonus, so surface the prompt's
  // intensity beside the points (a spicier completion reads as worth more). Only on
  // a DONE turn — pass/chicken keep their flat constants and carry no tier weight.
  const tier = TIER_META[result.intensity];
  const showTierWeight = result.verdict === 'done';
  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <AppText role="displayL" color={stampColor} style={{ textAlign: 'center' }}>{stamp}</AppText>
      {/* CC-5 drama stamp — derived from the public tally; null tag renders nothing. */}
      <DramaChip tag={result.dramaTag} lang={lang} />
      <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
        {nick(result.activePlayer)} — {pickL(result.promptText, lang)}
      </AppText>
      {cast > 0 && (
        <View style={{ gap: tokens.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText role="caption" color="success">{L(`Fait : ${result.tally.done}`, `Done: ${result.tally.done}`)}</AppText>
            <AppText role="caption" color="danger">{L(`Dégonflé : ${result.tally.chickened}`, `Chickened: ${result.tally.chickened}`)}</AppText>
          </View>
          <View style={{ height: 10, borderRadius: tokens.radii.pill, backgroundColor: theme.danger, overflow: 'hidden' }}>
            <View style={{ width: `${donePct}%`, height: 10, backgroundColor: theme.success }} />
          </View>
        </View>
      )}
      <Pop key={result.pointsAwarded} from={0.7} style={{ alignItems: 'center', gap: tokens.spacing.sm }}>
        <AppText role="headline" color="xp" style={{ textAlign: 'center' }}>
          +{result.pointsAwarded} pts → {nick(result.activePlayer)}
        </AppText>
        {/* CC-2 tier-weight badge — title-only plate (no fake multiplier), shown only on a
            DONE turn where the intensity bonus actually applied. */}
        {showTierWeight && (
          <MultiplierBadge
            multiplier={1}
            title={L(`${tier.fr} · ${result.choice === 'dare' ? 'ACTION' : 'VÉRITÉ'}`,
              `${tier.en} · ${result.choice === 'dare' ? 'DARE' : 'TRUTH'}`)}
            tone={tier.tone}
          />
        )}
      </Pop>
      {result.spectatorTally.total > 0 && (
        <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, gap: tokens.spacing.xs }}>
          <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
            {L('🎯 PARIS SUR LE COUP', '🎯 CALLED SHOTS')}
          </AppText>
          <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
            {L(
              `${result.spectatorTally.correct}/${result.spectatorTally.total} ont vu juste`,
              `${result.spectatorTally.correct}/${result.spectatorTally.total} called it right`,
            )}
          </AppText>
          {result.spectatorTally.correct > 0 && (
            <AppText role="caption" color="success" style={{ textAlign: 'center' }}>
              {L(`+${result.spectatorTally.pointsEach} pts chacun·e 🎉`, `+${result.spectatorTally.pointsEach} pts each 🎉`)}
            </AppText>
          )}
        </View>
      )}
      {result.forfeitText !== null && (
        <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }}>
          <AppText role="body" style={{ textAlign: 'center', fontStyle: 'italic' }}>
            🃏 {pickL(result.forfeitText, lang)}
          </AppText>
        </View>
      )}
    </View>
  );
}

export function TruthDarePlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const td = asTruthDareView(state.view);
  const now = useNow(td !== null && td.phase !== 'over');

  useEffect(() => {
    if (td === null) router.replace(`/room/${code}/lobby`);
  }, [td === null]);
  if (td === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const labels = td.labels;
  const me = state.playerId ?? '';

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {td.phase !== 'over' && (
          <View style={{ gap: tokens.spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText role="overline" color="textSecondary">
                {L(`MANCHE ${td.round + 1} SUR ${td.totalRounds}`, `ROUND ${td.round + 1} OF ${td.totalRounds}`)}
              </AppText>
              {left !== null && (
                <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
              )}
            </View>
            <RotationRail rotation={td.rotation} activeId={td.activePlayer} connected={td.connected} nick={nick} />
          </View>
        )}

        {td.phase === 'choose' && (
          <View style={{ gap: tokens.spacing.lg }}>
            {td.youAreActive ? (
              <>
                <AppText role="titleL" style={{ textAlign: 'center' }}>
                  {L('À toi de jouer ! 🔥', 'Your turn! 🔥')}
                </AppText>
                {td.choices.includes('truth') && (
                  <ChoiceChip label={L('VÉRITÉ 🗣️', 'TRUTH 🗣️')} accent={theme.truth}
                    onPress={() => sendAction({ kind: 'chooseType', choice: 'truth' })} />
                )}
                {td.choices.includes('dare') && (
                  <ChoiceChip label={L('ACTION 😈', 'DARE 😈')} accent={theme.dare}
                    onPress={() => sendAction({ kind: 'chooseType', choice: 'dare' })} />
                )}
              </>
            ) : (
              <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, alignItems: 'center', gap: tokens.spacing.md, ...tokens.elevation.e1 }}>
                <Avatar name={nick(td.activePlayer)} size="lg" />
                <AppText role="titleM" style={{ textAlign: 'center' }}>
                  {L(`${nick(td.activePlayer)} choisit…`, `${nick(td.activePlayer)} is choosing…`)}
                </AppText>
              </View>
            )}
          </View>
        )}

        {td.phase === 'prompt' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <PromptCard choice={td.choice} intensity={td.intensity} text={td.promptText} lang={lang} />
            {td.youAreActive ? (
              <>
                <PrimaryButton label={pickL(labels.claimDone, lang)}
                  onPress={() => sendAction({ kind: 'declare', result: 'done' })} />
                {td.canPass && (
                  <SecondaryButton
                    label={td.escapeMode === 'pass'
                      ? `${pickL(labels.escape, lang)} (${td.passesLeft[me] ?? 0})`
                      : pickL(labels.escape, lang)}
                    onPress={() => sendAction({ kind: 'pass' })}
                  />
                )}
                <SecondaryButton label={L('Je me dégonfle 🐔', 'I chicken out 🐔')}
                  onPress={() => sendAction({ kind: 'declare', result: 'chickened' })} />
              </>
            ) : (
              <>
                <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                  {L(`TOUS LES YEUX SUR ${nick(td.activePlayer).toUpperCase()} !`,
                    `ALL EYES ON ${nick(td.activePlayer).toUpperCase()}!`)}
                </AppText>
                {/* CC-1: a non-active spectator can bet on the outcome, or just see the locked echo + count. */}
                {(td.youCanPredict || td.youPredicted !== null) && (
                  <CallYourShot
                    activeName={nick(td.activePlayer)}
                    myBet={td.youPredicted}
                    count={td.predictionsIn}
                    onBet={(bet) => sendAction({ kind: 'predict', bet })}
                    lang={lang}
                  />
                )}
              </>
            )}
          </View>
        )}

        {td.phase === 'verdict' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <PromptCard choice={td.choice} intensity={td.intensity} text={td.promptText} lang={lang} />
            <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }}>
              <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
                {L(`${nick(td.activePlayer)} dit : « ${pickL(labels.claimDone, lang)} » — la salle tranche !`,
                  `${nick(td.activePlayer)} says: “${pickL(labels.claimDone, lang)}” — the room decides!`)}
              </AppText>
            </View>
            {td.youAreActive ? (
              <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                {L('LA SALLE DÉLIBÈRE… 👀', 'THE ROOM IS DECIDING… 👀')}
              </AppText>
            ) : td.youCanVote ? (
              <>
                <ChoiceChip label={pickL(labels.verdictDone, lang)} accent={theme.success}
                  onPress={() => sendAction({ kind: 'verdict', vote: 'done' satisfies Verdict })} />
                <ChoiceChip label={pickL(labels.verdictChickened, lang)} accent={theme.danger}
                  onPress={() => sendAction({ kind: 'verdict', vote: 'chickened' satisfies Verdict })} />
              </>
            ) : (
              <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                {td.youVoted !== null
                  ? L('VOTE VERROUILLÉ ✓', 'VOTE LOCKED ✓')
                  : L('LE JURY VOTE…', 'THE JURY IS VOTING…')}
              </AppText>
            )}
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {L(`${td.votesIn}/${td.votersExpected} votes`, `${td.votesIn}/${td.votersExpected} votes in`)}
            </AppText>
          </View>
        )}

        {td.phase === 'score' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <ScoreCard
              result={td.lastResult}
              stamp={td.lastResult.verdict === 'passed'
                ? pickL(labels.forfeitStamp, lang)
                : td.lastResult.verdict === 'done'
                  ? pickL(labels.verdictDone, lang)
                  : pickL(labels.verdictChickened, lang)}
              nick={nick} lang={lang}
            />
            {/* CC-4 escape-react beat: live bar only when the beat is on (non-completed
                turn + reactOnEscape) — reactionCounts is null otherwise. Public counts
                show to all; the buttons are tappable only when youCanReact. */}
            {td.reactionCounts !== null && (
              <EscapeReactBar
                counts={td.reactionCounts}
                mine={td.youReacted}
                canReact={td.youCanReact}
                onReact={(reaction) => sendAction({ kind: 'react', reaction })}
                lang={lang}
              />
            )}
            <AppText role="label" color="brand" style={{ textAlign: 'center' }}>
              {td.nextActive !== null
                ? L(`AU TOUR DE ${nick(td.nextActive).toUpperCase()} →`, `NEXT UP: ${nick(td.nextActive).toUpperCase()} →`)
                : L('DERNIER TOUR — RÉSULTATS !', 'THAT WAS THE LAST TURN — RESULTS!')}
            </AppText>
            <View style={{ gap: tokens.spacing.sm }}>
              {ranked(td.scores).map(([id, pts], i) => (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
                  <AppText role="caption" color="textMuted">{i + 1}</AppText>
                  <Avatar name={nick(id)} size="sm" />
                  <AppText role="body" style={{ flex: 1 }}>{nick(id)}</AppText>
                  <AppText role="bodyStrong" color="xp">{pts} pts</AppText>
                </View>
              ))}
            </View>
          </View>
        )}

        {td.phase === 'over' && (() => {
          // EPILOGUE (over screen only): map the final scores onto the shared kit's
          // branded leaderboard (name-hashed avatars, crown, climbing scores). A
          // single MVP superlative when there's a clear leader.
          const finalRanked = ranked(td.scores);
          const standings: EpilogueStanding[] = finalRanked.map(([id, pts]) => ({
            id, name: nick(id), score: pts,
          }));
          const top = finalRanked[0];
          const clearLeader = top !== undefined && (finalRanked[1]?.[1] ?? -1) < top[1];
          return (
            <EpilogueCard
              title={L('Fini ! 🎉', 'Game over! 🎉')}
              standings={standings}
              superlatives={clearLeader
                ? [{ key: 'mvp', icon: '🏆', label: L('MVP', 'MVP'), names: nick(top[0]),
                    detail: L(`${top[1]} pts`, `${top[1]} pts`), tone: 'win' }]
                : []}
              footer={
                <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
              }
            />
          );
        })()}

        {td.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
