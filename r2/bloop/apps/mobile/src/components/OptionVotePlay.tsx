import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { Option, OptionVoteItem, PredictionReveal, RoundResult } from '@bloop/game-option-vote';
import { asOptionVoteView, deviceLang, pickL, type Lang } from '../games/option-vote-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import {
  EpilogueCard, StreakTag as StreakTagChip, haptics,
  type EpilogueStanding, type EpilogueSuperlative,
} from './juice';
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

function OptionCard({ label, selected, dimmed, onPress, disabled, accent }: {
  label: string; selected: boolean; dimmed: boolean; onPress: () => void; disabled: boolean; accent: string;
}) {
  const { theme, tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      accessibilityLabel={`${label}${selected ? ', selected' : ''}`}
      style={{
        backgroundColor: selected ? accent : theme.surface,
        borderRadius: tokens.radii.xl,
        borderWidth: 3,
        borderColor: selected ? theme.stickerOutline : theme.border,
        padding: tokens.layout.cardPadding,
        opacity: dimmed ? 0.55 : 1,
        ...tokens.elevation.e2,
      }}>
      <AppText role="titleM" style={{ textAlign: 'center', color: selected ? '#FFFFFF' : undefined }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Reveal split: count bars + avatar chips per side, crown on the majority. */
function Split({ result, item, players, lang }: {
  result: RoundResult; item: OptionVoteItem | null; players: readonly RoomPlayer[]; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const total = Math.max(1, result.counts.A + result.counts.B);
  const sides: Array<{ opt: Option; label: string; count: number; color: string }> = [
    { opt: 'A', label: pickL(item?.optionA, lang), count: result.counts.A, color: theme.truth },
    { opt: 'B', label: pickL(item?.optionB, lang), count: result.counts.B, color: theme.dare },
  ];
  return (
    <View style={{ gap: tokens.spacing.lg }}>
      {result.majority === null && (
        <View style={{ backgroundColor: theme.xp, borderRadius: tokens.radii.lg, padding: tokens.spacing.md, gap: tokens.spacing.xs }}>
          <AppText role="titleM" style={{ textAlign: 'center' }}>
            {lang === 'fr' ? '⚖️ ÉGALITÉ PARFAITE !' : '⚖️ PERFECT SPLIT!'}
          </AppText>
          {/* P1 tie-relief — a consoled split is a *good* outcome: everyone scores. */}
          {result.tieReliefApplied && (
            <AppText role="bodyStrong" color="success" style={{ textAlign: 'center' }}>
              {lang === 'fr' ? '🎁 Pile au milieu — tout le monde +1 !' : '🎁 Dead even — everyone +1!'}
            </AppText>
          )}
        </View>
      )}
      {sides.map((side) => {
        const pct = Math.round((side.count / total) * 100);
        const isMajority = result.majority === side.opt;
        const voters = Object.entries(result.picks).filter(([, pick]) => pick === side.opt).map(([id]) => id);
        return (
          <View key={side.opt} style={{
            backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg,
            borderWidth: isMajority ? 3 : 0, borderColor: theme.xp, gap: tokens.spacing.sm, ...tokens.elevation.e1,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText role="bodyStrong" style={{ flex: 1 }}>{isMajority ? '👑 ' : ''}{side.label}</AppText>
              <AppText role="headline" color="brand">{pct}%</AppText>
            </View>
            <View style={{ height: 10, borderRadius: tokens.radii.pill, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: 10, backgroundColor: side.color }} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, alignItems: 'center' }}>
              {voters.map((id) => (
                <View key={id} style={{ alignItems: 'center', gap: 2 }}>
                  <Avatar name={nick(id)} size="sm" />
                  {result.awarded.includes(id) && (
                    <AppText role="caption" color="success">+1</AppText>
                  )}
                </View>
              ))}
              {voters.length === 0 && <AppText role="caption" color="textMuted">—</AppText>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * CC-1 "Devine la salle" — the hidden majority-PREDICTION side-bet, placed during
 * choose (predict-majority only). Two coral-outlined chips; tapping sends the
 * `predict` action. Shows the owner's own locked-in guess + a live "X/Y predicted"
 * aggregate. Never leaks anyone else's call — only the count, until the reveal.
 */
function PredictRoom({ item, myPrediction, predictedCount, total, onPredict, lang }: {
  item: OptionVoteItem | null; myPrediction: Option | null; predictedCount: number;
  total: number; onPredict: (opt: Option) => void; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  return (
    <View style={{
      backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg,
      gap: tokens.spacing.sm, borderWidth: 2, borderColor: theme.brand, ...tokens.elevation.e1,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText role="label" color="brand">
          {L('🔮 DEVINE LA SALLE', '🔮 READ THE ROOM')}
        </AppText>
        <AppText role="caption" color="textSecondary">
          {L(`${predictedCount}/${total} ont deviné`, `${predictedCount}/${total} predicted`)}
        </AppText>
      </View>
      <AppText role="caption" color="textSecondary">
        {myPrediction === null
          ? L('Quel camp la MAJORITÉ va-t-elle choisir ?', 'Which side will the MAJORITY pick?')
          : L('Tu peux changer ton pari tant que la manche tourne.', 'Tweak your bet while the round is live.')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        {(['A', 'B'] as const).map((opt) => {
          const picked = myPrediction === opt;
          const accent = opt === 'A' ? theme.truth : theme.dare;
          const label = pickL(opt === 'A' ? item?.optionA : item?.optionB, lang);
          return (
            <Pressable
              key={opt}
              onPress={() => onPredict(opt)}
              accessibilityLabel={`${L('Je parie sur', 'I bet on')} ${label}${picked ? L(', choisi', ', selected') : ''}`}
              style={{
                flex: 1, minHeight: 48, borderRadius: tokens.radii.lg, paddingHorizontal: tokens.spacing.md,
                paddingVertical: tokens.spacing.sm, alignItems: 'center', justifyContent: 'center',
                backgroundColor: picked ? accent : theme.surface,
                borderWidth: 2, borderColor: picked ? theme.stickerOutline : theme.border,
                ...tokens.elevation.e1,
              }}>
              <AppText role="label" color={picked ? 'textOnBrand' : 'textPrimary'} style={{ textAlign: 'center' }}>
                {picked ? '✓ ' : ''}{label || (opt === 'A' ? 'A' : 'B')}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * CC-1 reveal call-out — "tu connais pas tes potes". The now-public, by-name
 * majority predictions: who read the room right (✓ success) vs wrong (✗ danger).
 */
function PredictionsReveal({ predictions, item, majority, players, lang }: {
  predictions: readonly PredictionReveal[]; item: OptionVoteItem | null;
  majority: Option | null; players: readonly RoomPlayer[]; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  if (predictions.length === 0) return null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const sideLabel = (opt: Option) => pickL(opt === 'A' ? item?.optionA : item?.optionB, lang) || opt;
  const rightCount = predictions.filter((p) => p.correct).length;
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText role="overline" color="brand">
          {L('🔮 QUI A LU LA SALLE', '🔮 WHO READ THE ROOM')}
        </AppText>
        <AppText role="caption" color="textSecondary">
          {L(`${rightCount}/${predictions.length} ont vu juste`, `${rightCount}/${predictions.length} called it`)}
        </AppText>
      </View>
      {predictions.map((p) => (
        <View key={p.playerId} style={{
          flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
          borderRadius: tokens.radii.lg, padding: tokens.spacing.md,
          borderWidth: p.correct ? 2 : 0, borderColor: theme.success, ...tokens.elevation.e1,
        }}>
          <Avatar name={nick(p.playerId)} size="sm" />
          <View style={{ flex: 1 }}>
            <AppText role="bodyStrong">{nick(p.playerId)}</AppText>
            <AppText role="caption" color="textSecondary">
              {L(`pariait sur « ${sideLabel(p.predicted)} »`, `bet on “${sideLabel(p.predicted)}”`)}
            </AppText>
          </View>
          <AppText role="label" color={p.correct ? 'success' : 'danger'}>
            {p.correct ? L('✓ VU JUSTE', '✓ NAILED IT') : L('✗ RATÉ', '✗ MISSED')}
          </AppText>
        </View>
      ))}
      {majority === null && (
        <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
          {L('Égalité : personne ne pouvait gagner son pari.', 'A tie — no bet could land.')}
        </AppText>
      )}
      {rightCount === 0 && majority !== null && (
        <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
          {L('Personne n’a vu juste… vous connaissez pas vos potes ! 😬',
            'Nobody called it… you don’t know your friends! 😬')}
        </AppText>
      )}
    </View>
  );
}

/**
 * P1 CC-2 reveal/over "on fire" wall — the now-PUBLIC per-player streaks, each as
 * a brand 🔥 xN chip (juice-kit StreakTag, reduced-motion-safe). Only players on a
 * run of >= 2 surface a chip; a streak of one isn't a streak, so the row hides
 * entirely when nobody qualifies.
 */
function StreaksRow({ streaks, players, lang }: {
  streaks: readonly { playerId: string; streak: number; bonus: number }[];
  players: readonly RoomPlayer[]; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const onFire = streaks.filter((s) => s.streak >= 2);
  if (onFire.length === 0) return null;
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <AppText role="overline" color="brand">{L('🔥 EN FEU', '🔥 ON FIRE')}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, alignItems: 'center' }}>
        {onFire.map((s) => (
          <View key={s.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
            <Avatar name={nick(s.playerId)} size="sm" />
            <StreakTagChip count={s.streak} label={nick(s.playerId)} />
          </View>
        ))}
      </View>
      <View style={{ height: 1, backgroundColor: theme.border }} />
    </View>
  );
}

export function OptionVotePlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const ov = asOptionVoteView(state.view);
  const now = useNow(ov !== null && ov.phase !== 'over');
  const isTuPreferes = state.viewGameId === 'tu-preferes';
  const [pick, setPick] = useState<Option | null>(null);

  // Reset the local two-tap draft whenever a new choose phase begins.
  const chooseKey = ov?.phase === 'choose' ? ov.round : -1;
  useEffect(() => { setPick(null); }, [chooseKey]);

  useEffect(() => {
    if (ov === null) router.replace(`/room/${code}/lobby`);
  }, [ov === null]);

  // Haptic light when MY own hidden majority-prediction landed — fired once as the
  // reveal arrives (keyed on the round so it never re-buzzes on re-render). The
  // haptics util is itself reduced-motion-safe (no-op when Reduce Motion is on).
  const myReadHitKey = (ov?.phase === 'reveal' || ov?.phase === 'debate')
    && state.playerId !== null
    && ov.result.predictions.some((p) => p.playerId === state.playerId && p.correct)
    ? `${ov.round}` : null;
  useEffect(() => {
    if (myReadHitKey !== null) haptics.impact('light');
  }, [myReadHitKey]);

  if (ov === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const player = (id: string): RoomPlayer => byId.get(id) ?? { id, ...UNKNOWN };
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);

  const submitBallot = (chosen: Option, predict?: Option) =>
    sendAction({ kind: 'ballot', pick: chosen, ...(predict !== undefined ? { predict } : {}) });
  // CC-1 — the hidden majority-prediction side-bet (separate from the ballot).
  const sendPrediction = (opt: Option) => sendAction({ kind: 'predict', option: opt });

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {ov.phase !== 'over' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText role="overline" color="textSecondary">
              {L(`MANCHE ${ov.round + 1} SUR ${ov.totalRounds}`, `ROUND ${ov.round + 1} OF ${ov.totalRounds}`)}
            </AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            )}
          </View>
        )}

        {ov.phase === 'choose' && (() => {
          const submitted = ov.myBallot !== null;
          const predicting = isTuPreferes && pick !== null && !submitted;
          const waitingCount = Object.values(ov.hasSubmitted).filter(Boolean).length;
          const headline = ov.item?.prompt !== undefined
            ? `${ov.item.emoji !== undefined ? `${ov.item.emoji} ` : ''}${pickL(ov.item.prompt, lang)}`
            : L('Tu préfères…', 'Would you rather…');
          const instruction = submitted
            ? L(`VERROUILLÉ — ${waitingCount}/${state.players.length} ONT VOTÉ`, `LOCKED IN — ${waitingCount}/${state.players.length} VOTED`)
            : predicting
              ? L('ET LA SALLE, ELLE CHOISIT QUOI ?', 'NOW — WHAT DOES THE ROOM PICK?')
              : isTuPreferes
                ? L('TAPE TON CHOIX', 'TAP YOUR PICK')
                : L('VOTE !', 'CAST YOUR VOTE!');
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
                <AppText role="titleM" style={{ textAlign: 'center' }}>{headline}</AppText>
              </View>
              <AppText role="label" color={predicting ? 'brand' : 'textSecondary'} style={{ textAlign: 'center' }}>
                {instruction}
              </AppText>
              {(['A', 'B'] as const).map((opt) => {
                const label = pickL(opt === 'A' ? ov.item?.optionA : ov.item?.optionB, lang);
                const myPick = submitted ? ov.myBallot?.pick : pick;
                return (
                  <OptionCard
                    key={opt}
                    label={label}
                    selected={myPick === opt}
                    dimmed={predicting && pick !== opt}
                    disabled={submitted}
                    accent={opt === 'A' ? theme.truth : theme.dare}
                    onPress={() => {
                      if (!isTuPreferes) { submitBallot(opt); return; }
                      if (pick === null) { setPick(opt); return; }
                      submitBallot(pick, opt); // second tap = the prediction, auto-submits
                    }}
                  />
                );
              })}
              {predicting && (
                <SecondaryButton label={L('↩︎ Changer mon choix', '↩︎ Change my pick')} onPress={() => setPick(null)} />
              )}
              {/* CC-1 — "Devine la salle" side-bet, predict-majority only (tu-preferes). */}
              {ov.scoring === 'predict-majority' && (
                <PredictRoom
                  item={ov.item}
                  myPrediction={ov.myPrediction}
                  predictedCount={ov.predictedCount}
                  total={state.players.length}
                  onPredict={sendPrediction}
                  lang={lang}
                />
              )}
            </View>
          );
        })()}

        {(ov.phase === 'reveal' || ov.phase === 'debate') && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>
              {L('Les votes sont tombés !', 'The votes are in!')}
            </AppText>
            {ov.item?.prompt !== undefined && (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {ov.item.emoji !== undefined ? `${ov.item.emoji} ` : ''}{pickL(ov.item.prompt, lang)}
              </AppText>
            )}
            <Split result={ov.result} item={ov.item} players={state.players} lang={lang} />
            {/* P1 CC-2 — public "🔥 xN" streak wall, now that runs are revealed. */}
            <StreaksRow streaks={ov.result.streaks} players={state.players} lang={lang} />
            {/* CC-1 — public, by-name majority predictions: "tu connais pas tes potes". */}
            <PredictionsReveal
              predictions={ov.result.predictions}
              item={ov.item}
              majority={ov.result.majority}
              players={state.players}
              lang={lang}
            />
            {ov.phase === 'debate' && (
              <View style={{ gap: tokens.spacing.md }}>
                {ov.item?.debateStarter !== undefined && (
                  <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }}>
                    <AppText role="body" style={{ textAlign: 'center', fontStyle: 'italic' }}>
                      💬 {pickL(ov.item.debateStarter, lang)}
                    </AppText>
                  </View>
                )}
                <PrimaryButton
                  label={ov.mySkip
                    ? L(`On attend les autres… ${ov.skipCount}/${ov.skipNeeded}`, `Waiting for the others… ${ov.skipCount}/${ov.skipNeeded}`)
                    : L(`On passe → ${ov.skipCount}/${ov.skipNeeded}`, `Next → ${ov.skipCount}/${ov.skipNeeded}`)}
                  onPress={() => sendAction({ kind: 'skip' })}
                  disabled={ov.mySkip}
                />
              </View>
            )}
          </View>
        )}

        {ov.phase === 'over' && (() => {
          // P1 CC-5 — the cliffhanger epilogue is the SOURCE OF TRUTH for the
          // podium (already-public final scores, ordered + tie-aware). Map it onto
          // the juice-kit EpilogueCard: climbing scores, crown, sticker superlatives.
          const cliff = ov.cliffhanger;
          const standings: EpilogueStanding[] = cliff.leaderboard.map((e) => ({
            id: e.playerId,
            name: player(e.playerId).profile.nickname,
            score: e.score,
          }));
          const contrarian = ov.scoring === 'majority-herd'
            ? ranked(ov.minorityCount).filter(([, n]) => n > 0)[0]
            : undefined;
          const supers: EpilogueSuperlative[] = [];
          // CC-5 — "tout se joue maintenant": a photo-finish crown is its own award.
          if (cliff.mvp !== null) {
            supers.push({
              key: 'mvp', icon: '🏆', label: L('MVP', 'MVP'),
              names: player(cliff.mvp).profile.nickname,
              detail: cliff.closeFinish
                ? L(`Au finish — ${cliff.topGap} pt d'écart !`, `Down to the wire — won by ${cliff.topGap}!`)
                : undefined,
            });
          } else if (cliff.closeFinish) {
            supers.push({
              key: 'tie-crown', icon: '🤝', label: L('COURONNE PARTAGÉE', 'SHARED CROWN'),
              names: standings.filter((s) => s.score === standings[0]?.score).map((s) => s.name).join(' & '),
              detail: L('Ex æquo — personne ne lâche !', 'Dead heat — nobody backed down!'),
              tone: 'spice',
            });
          }
          // CC-1 — the group Oracle (best predictor) keeps its flagship call-out.
          if (ov.scoring === 'predict-majority' && ranked(ov.scores)[0] !== undefined) {
            const lastRight = ov.lastPredictions.filter((p) => p.correct).length;
            supers.push({
              key: 'oracle', icon: '🔮', label: L('ORACLE DU GROUPE', 'GROUP ORACLE'),
              names: player(ranked(ov.scores)[0]![0]).profile.nickname,
              detail: ov.lastPredictions.length > 0
                ? L(`Dernière manche : ${lastRight}/${ov.lastPredictions.length} ont lu la salle.`,
                    `Last round: ${lastRight}/${ov.lastPredictions.length} read the room.`)
                : undefined,
            });
          }
          // The non-scoring Contrarian superlative (majority-herd only).
          if (contrarian !== undefined) {
            supers.push({
              key: 'contrarian', icon: '🐐', label: L("L'ESPRIT CONTRAIRE", 'THE CONTRARIAN'),
              names: player(contrarian[0]).profile.nickname,
              detail: L(`${contrarian[1]}× dans la minorité`, `${contrarian[1]}× in the minority`),
              tone: 'spice',
            });
          }
          return (
            <EpilogueCard
              title={L('Fini ! 🎉', 'Game over! 🎉')}
              standings={standings}
              superlatives={supers}
              footer={
                <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
              }
            />
          );
        })()}

        {ov.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
