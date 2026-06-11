import { Pressable, View } from 'react-native';
import type { RoomPlayer } from '@bloop/protocol';
import { discColor, initialOf } from '../avatars';
import { useTheme } from '../theme/useTheme';
import { AppText } from './ui';

const SIZES = { sm: 32, md: 48, lg: 72, hero: 112 } as const;

/** Brand Book §5 Avatar: initial on a name-hashed brand-color disc.
 *  Ring semantics — host = xp (yellow), "you" = brand; dot = connection. */
export function Avatar({ name, size = 'md', ring = null, connected }:
  { name: string; size?: keyof typeof SIZES; ring?: 'host' | 'you' | null; connected?: boolean }) {
  const { theme, tokens } = useTheme();
  const d = SIZES[size];
  const ringColor = ring === 'host' ? theme.xp : ring === 'you' ? theme.brand : 'transparent';
  return (
    <View style={{
      width: d, height: d, borderRadius: tokens.radii.pill, backgroundColor: discColor(name),
      borderWidth: ring === null ? 0 : 3, borderColor: ringColor, alignItems: 'center', justifyContent: 'center',
      opacity: connected === false ? 0.45 : 1,
    }}>
      <AppText style={{ fontSize: d * 0.46, lineHeight: d * 0.6, fontFamily: tokens.fontFamily.display, color: tokens.colors.ink }}>{initialOf(name)}</AppText>
      {connected !== undefined && (
        <View style={{
          position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6,
          backgroundColor: connected ? theme.success : theme.border, borderWidth: 2, borderColor: theme.surface,
        }} />
      )}
    </View>
  );
}

/** §3 PlayerCard: avatar + nickname + status (+ crown for host). */
export function PlayerCard({ player, isYou }: { player: RoomPlayer; isYou: boolean }) {
  const { theme, tokens } = useTheme();
  return (
    <View
      accessibilityLabel={`${player.profile.nickname}${player.isHost ? ', host' : ''}${isYou ? ', you' : ''}, ${player.connected ? 'online' : 'away'}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
        borderRadius: tokens.radii.lg, padding: tokens.spacing.md, ...tokens.elevation.e1,
      }}>
      <Avatar name={player.profile.nickname} ring={player.isHost ? 'host' : isYou ? 'you' : null} connected={player.connected} />
      <View style={{ flex: 1 }}>
        <AppText role="bodyStrong">{player.profile.nickname}{player.isHost ? ' 👑' : ''}{isYou ? ' (you)' : ''}</AppText>
        <AppText role="caption" color={player.connected ? 'textMuted' : 'danger'}>{player.connected ? 'Online' : 'Reconnecting…'}</AppText>
      </View>
    </View>
  );
}

/** §3 VoteCard: tappable target; selected = brand ring + check; tick = that player has voted. */
export function VoteCard({ player, selected, voted, disabled, onPress }:
  { player: RoomPlayer; selected: boolean; voted: boolean; disabled: boolean; onPress: () => void }) {
  const { theme, tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      accessibilityLabel={`Vote for ${player.profile.nickname}${selected ? ', selected' : ''}${voted ? ', has voted' : ''}`}
      style={{
        minHeight: tokens.layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
        backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg,
        borderWidth: 3, borderColor: selected ? theme.brand : theme.border,
        opacity: disabled && !selected ? 0.6 : 1, ...tokens.elevation.e1,
      }}>
      <Avatar name={player.profile.nickname} size="md" />
      <AppText role="headline" style={{ flex: 1 }}>{player.profile.nickname}</AppText>
      {voted && <AppText role="headline" color="success">✓</AppText>}
      {selected && <AppText role="headline" color="brand">●</AppText>}
    </Pressable>
  );
}
