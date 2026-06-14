import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { computeAchievements, driverStats, nextMilestone } from "../../../../packages/logbook/src";
import type { LogbookState } from "../../../../packages/logbook/src";
import { colors, radius, spacing } from "../theme";

/**
 * Trophies + next-milestone card (retention layer). Everything here is a pure
 * derivation of the log — nothing persisted, recomputed each render. Earned
 * achievements become a row of medals; the two closest unearned ones become
 * the next things to chase, with live progress bars.
 */

function Bar({ progress }: { progress: number }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }]} />
    </View>
  );
}

export function ProgressCard({ logbook }: { logbook: LogbookState }) {
  if (logbook.runs.length === 0) return null;

  const ach = computeAchievements(logbook);
  const earned = ach.filter((a) => a.earned);
  const next = ach
    .filter((a) => !a.earned)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 2);

  const d = driverStats(logbook);
  const ms = nextMilestone(d.runs);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Trophies</Text>

      {earned.length > 0 ? (
        <View style={styles.medals}>
          {earned.map((a) => (
            <View key={a.id} style={styles.medal} accessibilityLabel={`${a.label}, earned`}>
              <Text style={styles.medalIcon}>{a.icon}</Text>
              <Text style={styles.medalLabel}>{a.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>Your first trophy is one run away.</Text>
      )}

      {next.length > 0 && (
        <View style={styles.goals}>
          <Text style={styles.goalsTitle}>Next up</Text>
          {next.map((a) => (
            <View key={a.id} style={styles.goal}>
              <View style={styles.goalRow}>
                <Text style={styles.goalLabel}>
                  {a.icon} {a.label}
                </Text>
                <Text style={styles.goalHint}>{a.hint}</Text>
              </View>
              <Bar progress={a.progress} />
            </View>
          ))}
        </View>
      )}

      {ms && (
        <Text style={styles.milestone}>
          {ms.next - d.runs} more {ms.next - d.runs === 1 ? "run" : "runs"} to your {ms.next}-run milestone
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  cardTitle: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  medals: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  medal: { alignItems: "center", width: 60 },
  medalIcon: { fontSize: 24 },
  medalLabel: { color: colors.sub, fontSize: 9, fontWeight: "700", textAlign: "center", marginTop: 2 },
  empty: { color: colors.sub, fontSize: 13 },
  goals: { marginTop: spacing.lg, gap: spacing.md },
  goalsTitle: {
    color: colors.sub,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  goal: { gap: spacing.xs + 2 },
  goalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  goalLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
  goalHint: { color: colors.sub, fontSize: 11 },
  barTrack: { height: 5, borderRadius: radius.sm, backgroundColor: colors.cardAlt, overflow: "hidden" },
  barFill: { height: 5, borderRadius: radius.sm, backgroundColor: colors.accent },
  milestone: { color: colors.sub, fontSize: 12, marginTop: spacing.lg, textAlign: "center" },
});
