import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { Avatar } from '../players';
import { AppText } from '../ui';
import { Pop } from './Pop';
import { ScoreClimb } from './ScoreClimb';

/** One leaderboard line. `delta`, when set, climbs as a "+N gained this game" tail. */
export interface EpilogueStanding {
  /** Stable key — usually the player id. */
  id: string;
  /** Display name; drives the name-hashed Avatar disc. */
  name: string;
  /** Final score shown on the right (climbs in via ScoreClimb). */
  score: number;
  /** Optional points gained this game, rendered as a small "+N" tail. */
  delta?: number;
}

/** One superlative call-out — "MVP", "Photo Finish", a named award, etc. */
export interface EpilogueSuperlative {
  /** Stable key. */
  key: string;
  /** Leading emoji / glyph, e.g. "🏆", "🤏", "🤡". */
  icon: string;
  /** ALL-CAPS award title, e.g. "MVP", "CLOSE FINISH". */
  label: string;
  /** Pre-joined names of the player(s) this applies to, e.g. "Théo & Lina". */
  names: string;
  /** Optional one-line flavour under the names. */
  detail?: string;
  /** Accent tone for the left border. Default `win`. */
  tone?: 'win' | 'neutral' | 'spice';
}

/**
 * Generic game-over epilogue: a title, an optional headline superlative band, the
 * ranked leaderboard, then a footer slot (e.g. a "Back to Lobby" button). The
 * per-game `over` screens map their own payload onto {@link EpilogueStanding} /
 * {@link EpilogueSuperlative} — this component owns none of the game semantics,
 * only the brand presentation (sticker cards, name-hashed avatars, climbing
 * scores, crown on first place).
 *
 * REDUCED-MOTION SAFE: all motion runs through {@link Pop} / {@link ScoreClimb},
 * both of which degrade to instant.
 */
export function EpilogueCard({
  title,
  standings,
  superlatives = [],
  footer,
}: {
  title: string;
  standings: readonly EpilogueStanding[];
  superlatives?: readonly EpilogueSuperlative[];
  footer?: ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <Pop from={0.7}>
        <AppText role="displayL" style={{ textAlign: 'center' }}>{title}</AppText>
      </Pop>

      {superlatives.length > 0 && (
        <View style={{ gap: tokens.spacing.sm }}>
          {superlatives.map(({ key, ...s }) => <SuperlativeRow key={key} {...s} />)}
        </View>
      )}

      <View style={{ gap: tokens.spacing.sm }}>
        {standings.map((s, i) => (
          <Standing key={s.id} standing={s} rank={i} />
        ))}
      </View>

      {footer !== undefined && <Fragment>{footer}</Fragment>}
    </View>
  );
}

function Standing({ standing, rank }: { standing: EpilogueStanding; rank: number }) {
  const { theme, tokens } = useTheme();
  const top = rank === 0;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
      backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg,
      borderWidth: top ? 3 : 0, borderColor: theme.xp,
      ...(top ? tokens.elevation.e2 : tokens.elevation.e1),
    }}>
      <AppText role="titleM">{top ? '👑' : rank + 1}</AppText>
      <Avatar name={standing.name} size="md" />
      <AppText role="bodyStrong" style={{ flex: 1 }}>{standing.name}</AppText>
      {standing.delta !== undefined && standing.delta > 0 && (
        <ScoreClimb value={standing.delta} role="caption" color="success" signed />
      )}
      <ScoreClimb value={standing.score} role="headline" color="xp" suffix=" pts" />
    </View>
  );
}

/**
 * Single superlative sticker row — icon, award label, named player(s), optional
 * flavour line. Tone tints the left accent border. Exported standalone so a
 * screen can drop one award outside the full {@link EpilogueCard} if needed.
 */
export function SuperlativeRow({ icon, label, names, detail, tone = 'win' }: Omit<EpilogueSuperlative, 'key'>) {
  const { theme, tokens } = useTheme();
  const accent = tone === 'spice' ? theme.dare : tone === 'neutral' ? theme.border : theme.xp;
  return (
    <Pop from={0.7}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
        backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg,
        borderLeftWidth: 6, borderColor: accent,
        ...tokens.elevation.sticker,
      }}>
        <AppText role="headline">{icon}</AppText>
        <View style={{ flex: 1 }}>
          <AppText role="overline" color="textSecondary">{label}</AppText>
          <AppText role="bodyStrong">{names}</AppText>
          {detail !== undefined && <AppText role="caption" color="textMuted">{detail}</AppText>}
        </View>
      </View>
    </Pop>
  );
}
