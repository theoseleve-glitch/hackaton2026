import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { RacePlan } from "../../../../packages/engine/src/planner";
import { useT } from "../i18n";
import { colors, radius } from "../theme";
import { confidenceColor, Fold, RunReportCard, Tile } from "./RunReportCard";

/**
 * Race plan, Pit Board layout (Théo's pick): the race-day call leads, three
 * tiles ground it, everything else folds. The full forecast-shifted engineer
 * report stays one fold away — never lost, never in the way.
 */

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

export function RacePlanView({ plan, onStrategy }: { plan: RacePlan; onStrategy: () => void }) {
  const t = useT();
  const r = plan.report;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Text style={styles.echo}>{r.conditions_echo}</Text>

      {r.kind === "report" && r.primary ? (
        <View style={styles.verdictCard}>
          <Text style={styles.kicker}>
            {t({ en: "RACE-DAY CALL", fr: "CONSIGNE DU JOUR DE COURSE" })} ·{" "}
            {r.primary.setting.replace(/_/g, " ").toUpperCase()}
          </Text>
          <Text style={styles.verdict}>{r.primary.change}</Text>
          <Text style={styles.mech}>{r.primary.mechanism}</Text>
        </View>
      ) : (
        <View style={[styles.verdictCard, { borderColor: colors.good }]}>
          <Text style={styles.kicker}>{t({ en: "RACE-DAY CALL", fr: "CONSIGNE DU JOUR DE COURSE" })}</Text>
          <Text style={[styles.verdictSmall, { color: colors.good }]}>
            {t({
              en: "Car is ready — the forecast doesn't change your setup.",
              fr: "La voiture est prête — les prévisions ne changent pas ton réglage.",
            })}
          </Text>
        </View>
      )}

      <View style={styles.tiles}>
        <Tile
          value={plan.race_avg_lap_s !== undefined ? fmt(plan.race_avg_lap_s) : "—"}
          label={t({ en: "race pace", fr: "rythme course" })}
        />
        <Tile
          value={r.confidence.toUpperCase()}
          label={t({ en: "confidence", fr: "confiance" })}
          tone={confidenceColor(r.confidence)}
        />
        <Tile value={String(plan.technique_tips.length)} label={t({ en: "drive tips", fr: "conseils pilotage" })} />
      </View>

      <Pressable style={styles.strategyBtn} onPress={onStrategy}>
        <Text style={styles.strategyBtnText}>
          {t({ en: "⛽ Race strategy — when to box →", fr: "⛽ Stratégie de course — quand passer au stand →" })}
        </Text>
      </Pressable>

      <Fold
        title={t({ en: "Conditions shift vs your practice", fr: "Évolution des conditions vs tes essais" })}
        badge={String(plan.conditions_shift.length)}
      >
        {plan.conditions_shift.map((l, i) => (
          <Text key={i} style={styles.line}>
            🌡 {l}
          </Text>
        ))}
      </Fold>

      <Fold
        title={t({ en: "Readiness — what your runs say", fr: "Préparation — ce que disent tes sessions" })}
        badge={String(plan.readiness.length)}
      >
        {plan.readiness.map((l, i) => (
          <Text key={i} style={styles.line}>
            🏁 {l}
          </Text>
        ))}
      </Fold>

      {plan.technique_tips.length > 0 && (
        <Fold
          title={t({ en: "Driving adaptation for race day", fr: "Adaptation du pilotage pour le jour de course" })}
          badge={String(plan.technique_tips.length)}
        >
          {plan.technique_tips.map((l, i) => (
            <Text key={i} style={styles.line}>
              🎮 {l}
            </Text>
          ))}
        </Fold>
      )}

      <Fold title={t({ en: "Full engineer report (under forecast)", fr: "Rapport complet de l’ingénieur (selon prévisions)" })}>
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
