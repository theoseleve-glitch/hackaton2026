import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import { Avatar, VoteCard } from '../../../src/components/players';
import { AppText, PrimaryButton, SecondaryButton } from '../../../src/components/ui';
import { asTracerView, secondsLeft } from '../../../src/games/tracer-view';
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
  const { theme, tokens } = useTheme();
  const { state, sendVote, leave } = useRoom();
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
            <AppText role="overline" color="textSecondary">ROUND {tv.round + 1} OF {tv.totalRounds}</AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            )}
          </View>
        )}

        {tv.phase === 'vote' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
              <AppText role="titleM" style={{ textAlign: 'center' }}>{tv.prompt}</AppText>
            </View>
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
              {tv.myVote === null ? 'TAP SOMEONE TO VOTE' : 'VOTE LOCKED — WAITING FOR THE OTHERS'}
            </AppText>
            {state.players.filter((p) => p.id !== state.playerId).map((p) => (
              <VoteCard
                key={p.id} player={p} selected={tv.myVote === p.id} voted={tv.hasVoted[p.id] === true}
                disabled={tv.myVote !== null} onPress={() => sendVote(p.id)}
              />
            ))}
          </View>
        )}

        {tv.phase === 'reveal' && (
          <View style={{ gap: tokens.spacing.md }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>The votes are in!</AppText>
            <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>{tv.prompt}</AppText>
            {ranked(tv.tally).map(([id, votes], i) => (
              <View key={id} style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                borderRadius: tokens.radii.lg, padding: tokens.spacing.lg,
                borderWidth: i === 0 && votes > 0 ? 3 : 0, borderColor: theme.xp, ...tokens.elevation.e1,
              }}>
                <AppText role="titleM" color="textMuted">{i + 1}</AppText>
                <Avatar name={player(id).profile.nickname} size="md" />
                <AppText role="bodyStrong" style={{ flex: 1 }}>{player(id).profile.nickname}</AppText>
                <AppText role="headline" color="brand">{votes} vote{votes === 1 ? '' : 's'}</AppText>
                <AppText role="caption" color="textMuted">{tv.scores[id] ?? 0} pts</AppText>
              </View>
            ))}
          </View>
        )}

        {tv.phase === 'over' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="displayL" style={{ textAlign: 'center' }}>Game over! 🎉</AppText>
            {ranked(tv.scores).map(([id, pts], i) => (
              <View key={id} style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, ...tokens.elevation.e1,
              }}>
                <AppText role="titleM">{i === 0 ? '👑' : i + 1}</AppText>
                <Avatar name={player(id).profile.nickname} size="md" />
                <AppText role="bodyStrong" style={{ flex: 1 }}>{player(id).profile.nickname}</AppText>
                <AppText role="headline" color="xp">{pts} pts</AppText>
              </View>
            ))}
            <PrimaryButton label="Back to Lobby" onPress={() => router.replace(`/room/${code}/lobby`)} />
          </View>
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
