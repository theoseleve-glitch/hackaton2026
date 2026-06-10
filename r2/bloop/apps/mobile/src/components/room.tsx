import { useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { AppText } from './ui';

/** §3 RoomCodeDisplay: 4 chars, displayXL, one rounded tile each. (Tap-to-copy: 3b, needs expo-clipboard.) */
export function RoomCodeDisplay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  return (
    <View accessibilityLabel={`Room code ${code.split('').join(' ')}`} style={{ alignItems: 'center', gap: tokens.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        {code.toUpperCase().slice(0, 4).split('').map((c, i) => (
          <View key={i} style={{
            width: 64, height: 80, borderRadius: tokens.radii.lg, backgroundColor: theme.surface,
            alignItems: 'center', justifyContent: 'center', ...tokens.elevation.e2,
          }}>
            <AppText role="displayXL">{c}</AppText>
          </View>
        ))}
      </View>
      <AppText role="caption" color="textMuted">Read it out loud — friends join with this code</AppText>
    </View>
  );
}

/** 4-tile code entry: one hidden TextInput drives four display tiles (auto-uppercase, alnum only). */
export function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { theme, tokens } = useTheme();
  const ref = useRef<TextInput>(null);
  const chars = [0, 1, 2, 3].map((i) => value[i] ?? '');
  return (
    <Pressable onPress={() => ref.current?.focus()}>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, justifyContent: 'center' }}>
        {chars.map((c, i) => (
          <View key={i} style={{
            width: 56, height: 68, borderRadius: tokens.radii.lg, backgroundColor: theme.surface,
            borderWidth: 2, borderColor: i === value.length ? theme.brand : theme.border,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <AppText role="displayL">{c}</AppText>
          </View>
        ))}
      </View>
      <TextInput
        ref={ref} value={value} autoCapitalize="characters" autoCorrect={false} maxLength={4}
        onChangeText={(t) => onChange(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4))}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}
