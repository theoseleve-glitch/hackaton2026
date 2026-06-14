import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type {
  CloseResult, RankingOverView, RankingPrompt, RankingRankView, RankingRevealView, RoundResult,
} from '../games/ranking-view';
import { asRankingView, deviceLang, pickL, type Lang } from '../games/ranking-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import {
  EpilogueCard, ScoreClimb, StreakTag as StreakTagChip, haptics,
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

/** The fully-composed bilingual prompt line (or a fallback when the deck ran dry). */
function PromptCard({ prompt, lang }: { prompt: RankingPrompt | null; lang: Lang }) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
      <AppText role="titleM" style={{ textAlign: 'center' }}>
        {prompt === null ? L('Classe la salle !', 'Rank the room!') : pickL(prompt.text, lang)}
      </AppText>
      {prompt !== null && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: tokens.spacing.md, gap: tokens.spacing.sm }}>
          <AppText role="caption" color="success" style={{ flex: 1 }}>
            {L('▲ Le plus', '▲ Most')} {pickL(prompt.most, lang)}
          </AppText>
          <AppText role="caption" color="danger" style={{ flex: 1, textAlign: 'right' }}>
            {pickL(prompt.least, lang)} {L('Le moins ▼', 'Least ▼')}
          </AppText>
        </View>
      )}
    </View>
  );
}

/**
 * RANK phase — tap-to-order ladder. The player taps roster members in order
 * (most → least); each tap drops the player into the next slot. A full ordering
 * (a permutation of the roster) unlocks the submit. Re-tapping a placed player
 * pulls it (and everyone after) back out, so a misorder is one tap to fix. Once
 * submitted, the ladder locks and we wait on the room.
 */
function RankLadder({ rv, players, lang, onSubmit }: {
  rv: RankingRankView; players: readonly RoomPlayer[]; lang: Lang;
  onSubmit: (order: string[]) => void;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;

  const submitted = rv.myOrder !== null;
  // Local draft ordering (most-first). Reset whenever a new round begins.
  const [draft, setDraft] = useState<string[]>([]);
  useEffect(() => { setDraft(submitted ? [...(rv.myOrder ?? [])] : []); }, [rv.round, submitted]);

  const placed = new Set(draft);
  const remaining = rv.roster.filter((id) => !placed.has(id));
  const complete = draft.length === rv.roster.length;

  const place = (id: string) => {
    if (submitted) return;
    haptics.impact('light');
    setDraft((d) => [...d, id]);
  };
  // Tapping a placed player pulls it and everyone below it back to the pool.
  const pull = (id: string) => {
    if (submitted) return;
    haptics.impact('light');
    setDraft((d) => d.slice(0, d.indexOf(id)));
  };

  const waitingCount = Object.values(rv.hasSubmitted).filter(Boolean).length;

  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <AppText role="label" color={submitted ? 'textSecondary' : 'brand'} style={{ textAlign: 'center' }}>
        {submitted
          ? L(`VERROUILLÉ — ${waitingCount}/${players.length} ONT CLASSÉ`, `LOCKED IN — ${waitingCount}/${players.length} RANKED`)
          : draft.length === 0
            ? L('TAPE DU PLUS… AU MOINS…', 'TAP FROM MOST… TO LEAST…')
            : L(`PLACE ${L('le suivant', 'the next')} (${draft.length}/${rv.roster.length})`, `PLACE THE NEXT (${draft.length}/${rv.roster.length})`)}
      </AppText>

      {/* The ladder: filled slots, most-first. Each filled row is tappable to pull back. */}
      <View style={{ gap: tokens.spacing.sm }}>
        {draft.map((id, i) => (
          <Pressable
            key={id}
            onPress={() => pull(id)}
            disabled={submitted}
            accessibilityLabel={`${i + 1}. ${nick(id)}${submitted ? '' : L(', taper pour retirer', ', tap to remove')}`}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
              backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.md,
              borderWidth: 3, borderColor: i === 0 ? theme.success : i === rv.roster.length - 1 ? theme.danger : theme.border,
              ...tokens.elevation.e1,
            }}>
            <AppText role="titleM" color="brand">{i + 1}</AppText>
            <Avatar name={nick(id)} size="sm" />
            <AppText role="bodyStrong" style={{ flex: 1 }}>{nick(id)}</AppText>
            {i === 0 && <AppText role="caption" color="success">{L('LE PLUS', 'MOST')}</AppText>}
            {i === rv.roster.length - 1 && <AppText role="caption" color="danger">{L('LE MOINS', 'LEAST')}</AppText>}
          </Pressable>
        ))}
      </View>

      {/* The pool of not-yet-placed players. */}
      {!submitted && remaining.length > 0 && (
        <View style={{ gap: tokens.spacing.sm }}>
          <View style={{ height: 1, backgroundColor: theme.border }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm }}>
            {remaining.map((id) => (
              <Pressable
                key={id}
                onPress={() => place(id)}
                accessibilityLabel={`${L('Placer', 'Place')} ${nick(id)}`}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm,
                  backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.pill,
                  paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md,
                  borderWidth: 2, borderColor: theme.border, ...tokens.elevation.e1,
                }}>
                <Avatar name={nick(id)} size="sm" />
                <AppText role="label">{nick(id)}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!submitted && (
        <View style={{ gap: tokens.spacing.sm }}>
          <PrimaryButton
            label={complete ? L('Valider mon classement', 'Lock in my ranking') : L(`Place les ${rv.roster.length} pour valider`, `Place all ${rv.roster.length} to lock in`)}
            disabled={!complete}
            onPress={() => { haptics.impact('medium'); onSubmit([...draft]); }}
          />
          {draft.length > 0 && (
            <SecondaryButton label={L('↺ Tout recommencer', '↺ Start over')} onPress={() => setDraft([])} />
          )}
        </View>
      )}
    </View>
  );
}

/**
 * REVEAL — the atomic flip. THE ROOM'S VERDICT (aggregate ordering, most→least)
 * crowns the top of the room and shames the tail, then a per-player closeness
 * board shows who "read the room" (band 0 = closest) with the +points climbing
 * in. Streaks (consecutive top-band finishes) light up the on-fire chips.
 */
function Reveal({ rv, players, lang }: {
  rv: RankingRevealView; players: readonly RoomPlayer[]; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const result: RoundResult = rv.result;

  useEffect(() => { haptics.impact('medium'); }, [rv.round]);

  // Closeness board, closest-first (ascending distance, then by band/points).
  const board = [...result.closeness].sort((a, b) => a.distance - b.distance || a.band - b.band);
  const topReader = nick(result.bestReaders[0] ?? '');
  const onFire = Object.entries(rv.streak).filter(([, s]) => s >= 2);

  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <AppText role="titleL" style={{ textAlign: 'center' }}>
        {L('La salle a tranché ! 🏆', 'The room has spoken! 🏆')}
      </AppText>

      {/* THE VERDICT — the room's aggregate ordering, most-first. */}
      <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg, gap: tokens.spacing.sm, ...tokens.elevation.e2 }}>
        <AppText role="overline" color="brand" style={{ textAlign: 'center' }}>
          {L('LE VERDICT DE LA SALLE', "THE ROOM'S VERDICT")}
        </AppText>
        {result.aggregate.map((id, i) => {
          const isTop = i === 0;
          const isTail = i === result.aggregate.length - 1;
          return (
            <View key={id} style={{
              flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
              backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.md,
              borderWidth: isTop || isTail ? 3 : 0, borderColor: isTop ? theme.success : theme.danger,
            }}>
              <AppText role="titleM" color="textMuted">{i + 1}</AppText>
              <Avatar name={nick(id)} size="sm" ring={isTop ? 'you' : null} />
              <AppText role="bodyStrong" style={{ flex: 1 }}>{isTop ? '👑 ' : isTail ? '💀 ' : ''}{nick(id)}</AppText>
              <AppText role="caption" color="textMuted">{result.bordaPoints[id] ?? 0} pts</AppText>
            </View>
          );
        })}
      </View>

      {/* WHO READ THE ROOM — closeness bands + the +points that just landed. */}
      <View style={{ gap: tokens.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText role="overline" color="brand">{L('🎯 QUI A LU LA SALLE', '🎯 WHO READ THE ROOM')}</AppText>
          {result.bestReaders.length > 0 && (
            <AppText role="caption" color="success">
              {result.bestReaders.length === 1
                ? L(`${topReader} au plus près`, `${topReader} nailed it`)
                : L(`${result.bestReaders.length} ex æquo`, `${result.bestReaders.length}-way tie`)}
            </AppText>
          )}
        </View>
        {board.map((c: CloseResult) => {
          const gained = result.pointsEarned[c.playerId] ?? 0;
          const isBest = c.band === 0;
          return (
            <View key={c.playerId} style={{
              flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
              backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.md,
              borderWidth: isBest ? 2 : 0, borderColor: theme.success, ...tokens.elevation.e1,
            }}>
              <Avatar name={nick(c.playerId)} size="sm" />
              <View style={{ flex: 1 }}>
                <AppText role="bodyStrong">{isBest ? '🎯 ' : ''}{nick(c.playerId)}</AppText>
                <AppText role="caption" color="textMuted">
                  {L(`écart ${c.distance}`, `off by ${c.distance}`)}
                </AppText>
              </View>
              {gained > 0
                ? <ScoreClimb value={gained} role="headline" color="success" signed />
                : <AppText role="caption" color="textMuted">+0</AppText>}
            </View>
          );
        })}
      </View>

      {/* ON FIRE — consecutive top-band runs, brand 🔥 xN chips (self-hide below 2). */}
      {onFire.length > 0 && (
        <View style={{ gap: tokens.spacing.sm }}>
          <AppText role="overline" color="brand">{L('🔥 EN FEU', '🔥 ON FIRE')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, alignItems: 'center' }}>
            {onFire.map(([id, s]) => (
              <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs }}>
                <Avatar name={nick(id)} size="sm" />
                <StreakTagChip count={s} label={nick(id)} />
              </View>
            ))}
          </View>
        </View>
      )}

      <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
        {L('Manche suivante dans un instant…', 'Next round in a moment…')}
      </AppText>
    </View>
  );
}

/**
 * OVER — the cliffhanger epilogue, derived server-side from PUBLIC final scores.
 * Mapped onto the juice-kit EpilogueCard: climbing standings, the crowned "best
 * reader of the room", a photo-finish call-out, and the longest top-band run.
 */
function RankingEpilogue({ ov, players, lang, footer }: {
  ov: RankingOverView; players: readonly RoomPlayer[]; lang: Lang; footer: React.ReactNode;
}) {
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const ep = ov.epilogue;
  const standings: EpilogueStanding[] = ep.leaderboard.map((e) => ({
    id: e.playerId, name: nick(e.playerId), score: e.score,
  }));
  const supers: EpilogueSuperlative[] = [];
  if (ep.mvp !== null) {
    supers.push({
      key: 'mvp', icon: '👑', label: L('MEILLEUR·E LECTEUR·RICE', 'BEST ROOM-READER'),
      names: nick(ep.mvp),
      detail: ep.closeFinish
        ? L(`Au finish — ${ep.topGap} pt d'écart !`, `Down to the wire — won by ${ep.topGap}!`)
        : undefined,
      tone: 'win',
    });
  } else if (ep.closeFinish) {
    supers.push({
      key: 'tie-crown', icon: '🤝', label: L('COURONNE PARTAGÉE', 'SHARED CROWN'),
      names: standings.filter((s) => s.score === standings[0]?.score).map((s) => s.name).join(' & '),
      detail: L('Ex æquo — personne ne lâche !', 'Dead heat — nobody backed down!'),
      tone: 'spice',
    });
  }
  if (ep.onFire.length > 0) {
    supers.push({
      key: 'on-fire', icon: '🔥', label: L('PLUS LONGUE SÉRIE', 'LONGEST STREAK'),
      names: ep.onFire.map((id) => nick(id)).join(' & '),
      detail: L('A lu la salle manche après manche', 'Read the room round after round'),
      tone: 'neutral',
    });
  }
  return (
    <EpilogueCard
      title={L('Fini ! 🎉', 'Game over! 🎉')}
      standings={standings}
      superlatives={supers}
      footer={footer}
    />
  );
}

export function RankingPlay({ code }: { code: string }) {
  const { tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const rv = asRankingView(state.view);
  const now = useNow(rv !== null && rv.phase !== 'over');

  useEffect(() => {
    if (rv === null) router.replace(`/room/${code}/lobby`);
  }, [rv === null]);
  if (rv === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const sendRank = (order: string[]) => sendAction({ kind: 'rank', order });

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {rv.phase !== 'over' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText role="overline" color="textSecondary">
              {L(`MANCHE ${rv.round + 1} SUR ${rv.totalRounds}`, `ROUND ${rv.round + 1} OF ${rv.totalRounds}`)}
            </AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            )}
          </View>
        )}

        {rv.phase === 'rank' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <PromptCard prompt={rv.prompt} lang={lang} />
            <RankLadder rv={rv} players={state.players} lang={lang} onSubmit={sendRank} />
          </View>
        )}

        {rv.phase === 'reveal' && <Reveal rv={rv} players={state.players} lang={lang} />}

        {rv.phase === 'over' && (
          <RankingEpilogue
            ov={rv}
            players={state.players}
            lang={lang}
            footer={
              <PrimaryButton
                label={L('Retour au salon', 'Back to Lobby')}
                onPress={() => router.replace(`/room/${code}/lobby`)}
              />
            }
          />
        )}

        {rv.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
