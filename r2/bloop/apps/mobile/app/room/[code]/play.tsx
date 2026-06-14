import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import { InputGuessPlay } from '../../../src/components/InputGuessPlay';
import { LastStandingPlay } from '../../../src/components/LastStandingPlay';
import { NightDayPlay } from '../../../src/components/NightDayPlay';
import { OptionVotePlay } from '../../../src/components/OptionVotePlay';
import { PerformJudgePlay } from '../../../src/components/PerformJudgePlay';
import { RuleHuntPlay } from '../../../src/components/RuleHuntPlay';
import { SecretRolePlay } from '../../../src/components/SecretRolePlay';
import { SpotlightGuessPlay } from '../../../src/components/SpotlightGuessPlay';
import { TruthDarePlay } from '../../../src/components/TruthDarePlay';
import { Avatar, VoteCard } from '../../../src/components/players';
import { AppText, PrimaryButton, SecondaryButton } from '../../../src/components/ui';
import { isInputGuessGame } from '../../../src/games/input-guess-view';
import { isLastStandingGame } from '../../../src/games/last-standing-view';
import { isNightDayGame } from '../../../src/games/night-day-view';
import { isOptionVoteGame } from '../../../src/games/option-vote-view';
import { isPerformJudgeGame } from '../../../src/games/perform-judge-view';
import { isRuleHuntGame } from '../../../src/games/rule-hunt-view';
import { isSecretRoleGame } from '../../../src/games/secret-role-view';
import { isSpotlightGuessGame } from '../../../src/games/spotlight-guess-view';
import { isTruthDareGame } from '../../../src/games/truth-dare-view';
import { asTracerView, deviceLang, promptText, secondsLeft, type Lang, type TracerEpilogue, type TracerOverView, type TracerRevealView } from '../../../src/games/tracer-view';
import {
  EpilogueCard,
  MultiplierBadge,
  ScoreClimb as JuiceScoreClimb,
  StreakTag,
  haptics,
  type EpilogueStanding,
  type EpilogueSuperlative,
} from '../../../src/components/juice';
import { useRoom } from '../../../src/net/context';
import { useTheme } from '../../../src/theme/useTheme';

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

export default function Play() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { state } = useRoom();
  // Each branch owns its hooks — never swap render paths mid-component.
  if (isOptionVoteGame(state.viewGameId)) return <OptionVotePlay code={code ?? ''} />;
  if (isInputGuessGame(state.viewGameId)) return <InputGuessPlay code={code ?? ''} />;
  if (isSecretRoleGame(state.viewGameId)) return <SecretRolePlay code={code ?? ''} />;
  if (isTruthDareGame(state.viewGameId)) return <TruthDarePlay code={code ?? ''} />;
  if (isSpotlightGuessGame(state.viewGameId)) return <SpotlightGuessPlay code={code ?? ''} />;
  if (isLastStandingGame(state.viewGameId)) return <LastStandingPlay code={code ?? ''} />;
  if (isRuleHuntGame(state.viewGameId)) return <RuleHuntPlay code={code ?? ''} />;
  if (isNightDayGame(state.viewGameId)) return <NightDayPlay code={code ?? ''} />;
  if (isPerformJudgeGame(state.viewGameId)) return <PerformJudgePlay code={code ?? ''} />;
  return <TracerPlay code={code ?? ''} />;
}

/**
 * Two-beat reveal (CC-3). Server-driven via deadlines — NO action to send.
 *  · suspense: "the room pointed at…" held breath; scores FROZEN, no name yet.
 *  · verdict : the designated player(s) named + the per-player score CLIMB
 *              (the `delta` +points emphasised with a pop).
 * Defaults the new fields so a legacy/zero-beat reveal view (no revealStep)
 * still renders the classic tally without crashing.
 */
function RevealBeats({ tv, player }: {
  tv: TracerRevealView; player: (id: string) => RoomPlayer;
}) {
  const { theme, tokens } = useTheme();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const step = tv.revealStep ?? 'verdict'; // legacy reveal had no beats → behave as the slam
  const delta = tv.delta ?? {};
  const designated = tv.designated ?? [];
  // CC-2: the score multiplier in effect this round (1 unless a weighted climax
  // round); CC-5: per-player current designation streak (populated at verdict).
  const roundMultiplier = tv.roundMultiplier ?? 1;
  const hotSeat = tv.hotSeat ?? {};
  const ranked = Object.entries(tv.tally).sort((a, b) => b[1] - a[1]);

  // Suspense pulses; the verdict card slams in with a pop on the step flip.
  const slam = useSharedValue(step === 'verdict' ? 1 : 0.7);
  useEffect(() => {
    slam.value = step === 'verdict'
      ? withSequence(withTiming(1.08, { duration: 140 }), withSpring(1, tokens.motion.spring.pop))
      : withSpring(0.7, tokens.motion.spring.pulse);
    // Haptic medium on the verdict SLAM (a no-op under Reduce Motion / no engine).
    if (step === 'verdict') haptics.impact('medium');
  }, [step]);
  const slamStyle = useAnimatedStyle(() => ({ transform: [{ scale: slam.value }] }));

  const designatedNames = designated.map((id) => player(id).profile.nickname).join(' & ');

  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>{promptText(tv.prompt, lang)}</AppText>

      {/* CC-2 — weighted climax round: "ROUND DOUBLE ×N" so the verdict climb reads
          as caused, not arbitrary. Gated to a non-base multiplier (never on ×1). */}
      {roundMultiplier > 1 && (
        <MultiplierBadge
          multiplier={roundMultiplier}
          title={L('MANCHE DOUBLE', 'ROUND DOUBLE')}
          tone="dare"
          style={{ alignSelf: 'center' }}
        />
      )}

      {step === 'suspense'
        ? (
          <Animated.View style={[slamStyle, {
            backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding,
            alignItems: 'center', gap: tokens.spacing.sm, borderWidth: 3, borderColor: theme.border, ...tokens.elevation.e2,
          }]}>
            <AppText role="displayL" style={{ textAlign: 'center' }}>👀</AppText>
            <AppText role="titleL" style={{ textAlign: 'center' }}>
              {L('La salle a pointé du doigt…', 'The room pointed at…')}
            </AppText>
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {L('Suspense… roulement de tambour', 'Hold your breath… drumroll')}
            </AppText>
          </Animated.View>
        )
        : (
          <Animated.View style={[slamStyle, {
            backgroundColor: theme.brand, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding,
            alignItems: 'center', gap: tokens.spacing.sm, borderWidth: 3, borderColor: theme.stickerOutline,
            ...tokens.elevation.sticker,
          }]}>
            <AppText role="displayL" style={{ textAlign: 'center', color: '#FFFFFF' }}>🎯</AppText>
            <AppText role="titleL" style={{ textAlign: 'center', color: '#FFFFFF' }}>
              {designated.length === 0
                ? L('Personne ! Aucun vote.', 'Nobody! No votes cast.')
                : designated.length === 1
                  ? L(`C'est ${designatedNames} !`, `It's ${designatedNames}!`)
                  : L(`Égalité : ${designatedNames} !`, `It's a tie: ${designatedNames}!`)}
            </AppText>
            <AppText role="label" style={{ textAlign: 'center', color: '#FFFFFF' }}>
              {L('LA SALLE A TRANCHÉ', 'THE ROOM HAS SPOKEN')}
            </AppText>
          </Animated.View>
        )}

      {ranked.map(([id, votes], i) => {
        const isDesignated = designated.includes(id);
        const gained = step === 'verdict' ? (delta[id] ?? 0) : 0;
        // CC-5: the live consecutive-designation streak after this verdict.
        const streak = step === 'verdict' ? (hotSeat[id] ?? 0) : 0;
        return (
          <View key={id} style={{
            flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
            borderRadius: tokens.radii.lg, padding: tokens.spacing.lg,
            borderWidth: isDesignated && votes > 0 ? 3 : i === 0 && votes > 0 ? 3 : 0,
            borderColor: isDesignated ? theme.brand : theme.xp, ...tokens.elevation.e1,
          }}>
            <AppText role="titleM" color="textMuted">{i + 1}</AppText>
            <Avatar name={player(id).profile.nickname} size="md" ring={isDesignated ? 'you' : null} connected />
            <View style={{ flex: 1, gap: tokens.spacing.xs }}>
              <AppText role="bodyStrong">
                {isDesignated ? '🎯 ' : ''}{player(id).profile.nickname}
              </AppText>
              {/* CC-5 hot-seat tease — only on a 2+ run (StreakTag self-hides below 2). */}
              <StreakTag count={streak} label={L('EN PLS', 'ON A ROLL')} />
            </View>
            <AppText role="headline" color="brand">{votes} {L('voix', votes === 1 ? 'vote' : 'votes')}</AppText>
            <View style={{ alignItems: 'flex-end', minWidth: 56 }}>
              <AppText role="caption" color="textMuted">{tv.scores[id] ?? 0} pts</AppText>
              {/* Weighted +delta climbs in via the shared juice ScoreClimb (reduced-motion-safe). */}
              {gained > 0 && (
                <JuiceScoreClimb value={gained} role="headline" color="success" signed />
              )}
            </View>
          </View>
        );
      })}

      <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
        {step === 'suspense'
          ? L('Les points arrivent…', 'Points incoming…')
          : L('Manche suivante dans un instant…', 'Next round in a moment…')}
      </AppText>
    </View>
  );
}

/**
 * Wave-2 (CC-5) game-over epilogue → juice-kit EpilogueCard. Maps the final
 * `scores` onto climbing standings and the server-derived `cliffhanger` onto
 * superlative call-outs (MVP, photo finish, longest hot-seat). All copy bilingual
 * via L; the card itself is reduced-motion-safe (Pop / ScoreClimb degrade to
 * instant). Defensive on `cliffhanger` so a legacy over view (no epilogue) still
 * renders the plain leaderboard.
 */
function TracerEpilogueView({ tv, player, ranked, footer, lang }: {
  tv: TracerOverView;
  player: (id: string) => RoomPlayer;
  ranked: (scores: Record<string, number>) => [string, number][];
  footer: ReactNode;
  lang: Lang;
}) {
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const standings: EpilogueStanding[] = ranked(tv.scores).map(([id, score]) => ({
    id,
    name: player(id).profile.nickname,
    score,
  }));

  const cliffhanger: TracerEpilogue | undefined = tv.cliffhanger;
  const names = (ids: readonly string[]) => ids.map((id) => player(id).profile.nickname).join(' & ');
  const superlatives: EpilogueSuperlative[] = [];
  if (cliffhanger !== undefined) {
    if (cliffhanger.mvp !== null) {
      superlatives.push({
        key: 'mvp',
        icon: '👑',
        label: L('PIRE POTE', 'MVP'),
        names: player(cliffhanger.mvp).profile.nickname,
        tone: 'win',
      });
    }
    if (cliffhanger.closeFinish) {
      superlatives.push({
        key: 'photo-finish',
        icon: '🤏',
        label: L('FINISH SERRÉ', 'PHOTO FINISH'),
        names: L(`${cliffhanger.topGap} carte${cliffhanger.topGap === 1 ? '' : 's'} d'écart`,
          `${cliffhanger.topGap} card${cliffhanger.topGap === 1 ? '' : 's'} apart`),
        detail: L('Ça s\'est joué à rien !', 'Down to the wire!'),
        tone: 'spice',
      });
    }
    if (cliffhanger.longestHotSeat.value >= 2 && cliffhanger.longestHotSeat.players.length > 0) {
      superlatives.push({
        key: 'hot-seat',
        icon: '🔥',
        label: L('PLUS GROSSE LANCÉE', 'LONGEST HOT SEAT'),
        names: names(cliffhanger.longestHotSeat.players),
        detail: L(`${cliffhanger.longestHotSeat.value} manches désigné·e d'affilée`,
          `pointed at ${cliffhanger.longestHotSeat.value} rounds in a row`),
        tone: 'neutral',
      });
    }
  }

  return (
    <EpilogueCard
      title={L('Fini ! 🎉', 'Game over! 🎉')}
      standings={standings}
      superlatives={superlatives}
      footer={footer}
    />
  );
}

function TracerPlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendVote, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const tv = asTracerView(state.view);
  const now = useNow(tv !== null && tv.phase !== 'over');

  useEffect(() => {
    if (tv === null) router.replace(`/room/${code}/lobby`); // no game running → back to the lobby
  }, [tv === null]);
  if (tv === null) return null;

  const byId = new Map(state.players.map((p) => [p.id, p]));
  const player = (id: string): RoomPlayer => byId.get(id) ?? { id, ...UNKNOWN };
  const left = secondsLeft(state.deadlineAt, now);
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {tv.phase !== 'over' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText role="overline" color="textSecondary">
              {L(`MANCHE ${tv.round + 1} SUR ${tv.totalRounds}`, `ROUND ${tv.round + 1} OF ${tv.totalRounds}`)}
            </AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            )}
          </View>
        )}

        {tv.phase === 'vote' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
              <AppText role="titleM" style={{ textAlign: 'center' }}>{promptText(tv.prompt, lang)}</AppText>
            </View>
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
              {tv.myVote === null
                ? L('TAPE QUELQU’UN POUR VOTER', 'TAP SOMEONE TO VOTE')
                : L('VOTE VERROUILLÉ — ON ATTEND LES AUTRES', 'VOTE LOCKED — WAITING FOR THE OTHERS')}
            </AppText>
            {state.players.filter((p) => p.id !== state.playerId).map((p) => (
              <VoteCard
                key={p.id} player={p} selected={tv.myVote === p.id} voted={tv.hasVoted[p.id] === true}
                disabled={tv.myVote !== null} onPress={() => sendVote(p.id)}
              />
            ))}
          </View>
        )}

        {tv.phase === 'reveal' && <RevealBeats tv={tv} player={player} />}

        {/* Wave-2 (CC-5): the cliffhanger epilogue lands on the OVER screen only —
            crowned MVP, photo-finish call-out, longest hot-seat, on the shared
            juice-kit EpilogueCard (climbing scores, name-hashed avatars). */}
        {tv.phase === 'over' && (
          <TracerEpilogueView
            tv={tv}
            player={player}
            ranked={ranked}
            lang={lang}
            footer={
              <PrimaryButton
                label={L('Retour au salon', 'Back to Lobby')}
                onPress={() => router.replace(`/room/${code}/lobby`)}
              />
            }
          />
        )}

        {/* Mid-game there is no "back to lobby" — the lobby route redirects to a live game.
            Leaving mid-game is a real leave (the server frees the seat after grace). */}
        {tv.phase !== 'over' && (
          <SecondaryButton label="Leave Game" onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
