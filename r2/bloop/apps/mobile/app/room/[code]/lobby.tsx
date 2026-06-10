import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlayerCard } from '../../../src/components/players';
import { RoomCodeDisplay } from '../../../src/components/room';
import { AppText, PrimaryButton, SecondaryButton } from '../../../src/components/ui';
import { spawnBot } from '../../../src/dev/inAppBot';
import { asTracerView } from '../../../src/games/tracer-view';
import { useRoom } from '../../../src/net/context';
import { SERVER_URL } from '../../../src/config';
import { useTheme } from '../../../src/theme/useTheme';

const BOT_CAP = 6;

export default function Lobby() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { tokens } = useTheme();
  const { state, sendStartGame, leave } = useRoom();
  const me = state.players.find((p) => p.id === state.playerId);
  const isHost = me?.isHost === true;
  const connectedCount = state.players.filter((p) => p.connected).length;

  // Dev bots state
  const [botCount, setBotCount] = useState(0);
  const botCleanupsRef = useRef<Array<() => void>>([]);

  const addBot = () => {
    if (botCount >= BOT_CAP || code == null) return;
    const idx = botCount + 1;
    const cleanup = spawnBot(SERVER_URL, code, idx);
    botCleanupsRef.current.push(cleanup);
    setBotCount((n) => n + 1);
  };

  const closeAllBots = () => {
    botCleanupsRef.current.forEach((fn) => fn());
    botCleanupsRef.current = [];
    setBotCount(0);
  };

  // Clean up bots on unmount
  useEffect(() => () => { botCleanupsRef.current.forEach((fn) => fn()); }, []);

  // A live (non-over) tracer view means the game is on → move to the container.
  const tv = asTracerView(state.view);
  useEffect(() => {
    if (tv !== null && tv.phase !== 'over') router.replace(`/room/${code}/play`);
  }, [tv !== null && tv.phase !== 'over']);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.xxl }}>
        <RoomCodeDisplay code={(code ?? '').toUpperCase()} />
        {state.playerId === null && <AppText role="body" color="textMuted" style={{ textAlign: 'center' }}>Joining the room…</AppText>}

        <View style={{ gap: tokens.spacing.sm }}>
          <AppText role="overline" color="textSecondary">YOUR SQUAD · {connectedCount} OF 16</AppText>
          {state.players.map((p) => <PlayerCard key={p.id} player={p} isYou={p.id === state.playerId} />)}
        </View>

        {isHost
          ? <PrimaryButton label="Start Game" onPress={() => sendStartGame('tracer')} disabled={connectedCount < 2} />
          : <AppText role="body" color="textMuted" style={{ textAlign: 'center' }}>Waiting for the host to start… 🫧</AppText>}
        {isHost && connectedCount < 2 && (
          <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>Tracer needs at least 2 players — share the code!</AppText>
        )}
        {__DEV__ && (
          <SecondaryButton
            label={`+ Add bot (dev)${botCount > 0 ? ` · ${botCount}/${BOT_CAP}` : ''}`}
            onPress={addBot}
            disabled={botCount >= BOT_CAP}
          />
        )}
        <SecondaryButton label="Leave Room" onPress={() => { closeAllBots(); leave(); router.replace('/'); }} />
      </ScrollView>
    </SafeAreaView>
  );
}
