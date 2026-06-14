import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { RacePlan } from "../../../../packages/engine/src/planner";
import { colors, radius } from "../theme";
import { confidenceColor, Fold, RunReportCard, Tile } from "./RunReportCard";

/**
 * Race plan, Pit Board layout (Théo's pick): the race-day call leads, three
 * tiles ground it, everything else folds. The full forecast-shifted engineer
 * report stays one fold away — never lost, never in the way.
 */

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

export function RacePlanView({ plan, onStrategy }: { plan: RacePlan; onStrategy: () => void }) {
  const r = plan.report;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Text style={styles.echo}>{r.conditions_echo}</Text>

      {r.kind === "report" && r.primary ? (
        <View style={styles.verdictCard}>
          <Text style={styles.kicker}>
            RACE-DAY CALL · {r.primary.setting.replace(/_/g, " ").toUpperCase()}
          </Text>
          <Text style={styles.verdict}>{r.primary.change}</Text>
          <Text style={styles.mech}>{r.primary.mechanism}</Text>
        </View>
      ) : (
        <View style={[styles.verdictCard, { borderColor: colors.good }]}>
          <Text style={styles.kicker}>RACE-DAY CALL</Text>
          <Text style={[styles.verdictSmall, { color: colors.good }]}>
            Car is ready — the forecast doesn't change your setup.
          </Text>
        </View>
      )}

      <View style={styles.tiles}>
        <Tile value={plan.race_avg_lap_s !== undefined ? fmt(plan.race_avg_lap_s) : "—"} label="race pace" />
        <Tile value={r.confidence.toUpperCase()} label="confidence" tone={confidenceColor(r.confidence)} />
        <Tile value={String(plan.technique_tips.length)} label="drive tips" />
      </View>

      <Pressable style={styles.strategyBtn} onPress={onStrategy}>
        <Text style={styles.strategyBtnText}>⛽ Race strategy — when to box →</Text>
      </Pressable>

      <Fold title="Conditions shift vs your practice" badge={String(plan.conditions_shift.length)}>
        {plan.conditions_shift.map((l, i) => (
          <Text key={i} style={styles.line}>
            🌡 {l}
          </Text>
        ))}
      </Fold>

      <Fold title="Readiness — what your runs say" badge={String(plan.readiness.length)}>
        {plan.readiness.map((l, i) => (
          <Text key={i} style={styles.line}>
            🏁 {l}
          </Text>
        ))}
      </Fold>

      {plan.technique_tips.length > 0 && (
        <Fold title="Driving adaptation for race day" badge={String(plan.technique_tips.length)}>
          {plan.technique_tips.map((l, i) => (
            <Text key={i} style={styles.line}>
              🎮 {l}
            </Text>
          ))}
        </Fold>
      )}

      <Fold title="Full engineer report (under forecast)">
        <RunReportCard report={r} />
      </Fold>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  echo: { color: colors.sub, fontSize: 12, fontStyle: "italic", marginBottom: 10 },
  verdictCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 10,
  },
  kicker: { color: colors.sub, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 6 },
  verdict: { color: colors.accent, fontSize: 26, fontWeight: "900", lineHeight: 32 },
  verdictSmall: { color: colors.text, fontSize: 16, fontWeight: "700", lineHeight: 23 },
  mech: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 10 },
  tiles: { flexDirection: "row", gap: 8, marginBottom: 10 },
  strategyBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 10,
  },
  strategyBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  line: { color: colors.text, fontSize: 13, lineHeight: 21 },
});
