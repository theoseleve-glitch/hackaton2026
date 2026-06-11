import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { ColorTheme } from '../theme/colors';
import { useTheme } from '../theme/useTheme';
import type { SessionToast } from '../net/session';
import { type } from '../theme/typography';

export type TypeRole = keyof typeof type;

export function AppText({ role = 'body', color = 'textPrimary', style, children }:
  { role?: TypeRole; color?: keyof ColorTheme; style?: StyleProp<TextStyle>; children: ReactNode }) {
  const { theme, tokens } = useTheme();
  return <Text style={[tokens.type[role], { color: theme[color] }, style]}>{children}</Text>;
}

/** §2.7 motion rule: every interactive element pops on press (scale ~0.96, spring back). */
function PopPressable({ onPress, disabled, style, children }:
  { onPress?: () => void; disabled?: boolean; style: StyleProp<ViewStyle>; children: ReactNode }) {
  const { tokens } = useTheme();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      onPressIn={() => { scale.value = withSpring(0.96, tokens.motion.spring.pop); }}
      onPressOut={() => { scale.value = withSpring(1, tokens.motion.spring.pop); }}>
      <Animated.View style={[anim, style]}>{children}</Animated.View>
    </Pressable>
  );
}

export function PrimaryButton({ label, onPress, disabled = false, loading = false }:
  { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const { theme, tokens } = useTheme();
  const off = disabled || loading;
  return (
    <PopPressable onPress={onPress} disabled={off} style={{
      minHeight: 56, borderRadius: tokens.radii.pill, backgroundColor: off ? theme.surfaceAlt : theme.brand,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: tokens.spacing.xxl, ...tokens.elevation.e2,
    }}>
      {loading
        ? <ActivityIndicator color={theme.textOnBrand} />
        : <AppText role="headline" color={off ? 'textMuted' : 'textOnBrand'}>{label}</AppText>}
    </PopPressable>
  );
}

export function SecondaryButton({ label, onPress, disabled = false }:
  { label: string; onPress: () => void; disabled?: boolean }) {
  const { theme, tokens } = useTheme();
  return (
    <PopPressable onPress={onPress} disabled={disabled} style={{
      minHeight: 56, borderRadius: tokens.radii.pill, borderWidth: 2,
      borderColor: disabled ? theme.border : theme.brand, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: tokens.spacing.xxl, backgroundColor: 'transparent',
    }}>
      <AppText role="headline" color={disabled ? 'textMuted' : 'brand'}>{label}</AppText>
    </PopPressable>
  );
}

/** Top inset pill toast (§3): renders the session toast, auto-hides after 2.5s. */
export function ToastHost({ toast }: { toast: SessionToast | null }) {
  const { theme, tokens } = useTheme();
  const [shown, setShown] = useState<SessionToast | null>(null);
  useEffect(() => {
    if (toast === null) return;
    setShown(toast);
    const t = setTimeout(() => setShown(null), 2_500);
    return () => clearTimeout(t);
  }, [toast]);
  if (shown === null) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
      <View style={{
        backgroundColor: shown.kind === 'error' ? theme.danger : theme.accent, borderRadius: tokens.radii.pill,
        paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.md, maxWidth: 340, ...tokens.elevation.e2,
      }}>
        <AppText role="label" color="textOnBrand">{shown.text}</AppText>
      </View>
    </View>
  );
}
