import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RoomSessionContext } from '../../../src/net/context';
import { useRoomSession } from '../../../src/net/useRoomSession';
import { AppText, PrimaryButton, ToastHost } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme/useTheme';

const FATAL_COPY = {
  UPGRADE_REQUIRED: 'Bloop got an update! Grab the newest version to keep playing.',
  ROOM_FULL: "That room is full or mid-game — ask for a fresh code.",
} as const;

export default function RoomLayout() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { theme, tokens } = useTheme();
  const session = useRoomSession((code ?? '').toUpperCase());

  // No device identity yet (deep entry) → back to Home to pick one.
  useEffect(() => {
    if (session.profile === 'missing') router.replace('/');
  }, [session.profile]);

  if (session.state.fatal !== null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', padding: tokens.layout.screenPadding, gap: tokens.spacing.xxl }}>
        <AppText role="displayL" style={{ textAlign: 'center' }}>🫧💥</AppText>
        <AppText role="titleM" style={{ textAlign: 'center' }}>{FATAL_COPY[session.state.fatal]}</AppText>
        <PrimaryButton label="Back to Home" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  return (
    <RoomSessionContext.Provider value={session}>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <ToastHost toast={session.state.toast} />
        {session.state.status === 'reconnecting' && (
          <View style={{ backgroundColor: theme.warning, paddingVertical: tokens.spacing.xs, alignItems: 'center' }}>
            <AppText role="caption" color="textOnBrand">Reconnecting…</AppText>
          </View>
        )}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
      </View>
    </RoomSessionContext.Provider>
  );
}
