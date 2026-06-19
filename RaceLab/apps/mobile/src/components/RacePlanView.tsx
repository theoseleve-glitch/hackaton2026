import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { RacePlan } from "../../../../packages/engine/src";
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
  // C1: William's grounded forecast adjustments lead the verdict when present —
  // they are the forecast-specific, KB-cited call; the full Theo report stays
  // one fold below. Theo's report primary leads only when there is no adjustment.
  const lead = plan.adjustments && plan.adjustments.length > 0 ? plan.adjustments[0] : undefined;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Text style={styles.echo}>{r.conditions_echo}</Text>

      {lead ? (
        <View style={styles.verdictCard}>
          <Text style={styles.kicker}>
            {t({ en: "FORECAST ADJUSTMENT", fr: "AJUSTEMENT PRÉVISIONS" })} ·{" "}
            {lead.setting.replace(/_/g, " ").toUpperCase()}
          </Text>
          <Text style={styles.verdict}>{lead.change}</Text>
          <Text style={styles.mech}>{lead.mechanism}</Text>
          <Text style={styles.note}>
            {t({
              en: "Full setup report below in “Full engineer report”.",
              fr: "Rapport de réglage complet ci-dessous dans « Rapport complet de l’ingénieur ».",
            })}
          </Text>
        </View>
      ) : r.kind === "report" && r.primary ? (
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

      {plan.adjustments && plan.adjustments.length > 0 && (
        <Fold
          title={t({ en: "Forecast adjustments", fr: "Ajustements prévisions" })}
          badge={String(plan.adjustments.length)}
        >
          {plan.adjustments.map((adj, i) => (
            <View key={i} style={styles.adjustment}>
              <Text style={styles.adjustTrigger}>{adj.trigger}</Text>
              <Text style={styles.adjustChange}>
                {adj.setting.replace(/_/g, " ").toUpperCase()}: {adj.change}
              </Text>
              <Text style={styles.adjustMech}>{adj.mechanism}</Text>
              <Text style={styles.adjustMeta}>
                {t({ en: "revert", fr: "annuler" })}: {adj.revert} · {t({ en: "confidence", fr: "confiance" })}:{" "}
                {adj.confidence} · {t({ en: "cites", fr: "cite" })} {adj.citations.join(", ")}
              </Text>
            </View>
          ))}
        </Fold>
      )}

      {plan.refusals && plan.refusals.length > 0 && (
        <Fold
          title={t({ en: "Ungrounded aspects", fr: "Aspects non couverts" })}
          badge={String(plan.refusals.length)}
        >
          {plan.refusals.map((ref, i) => (
            <Text key={i} style={styles.line}>
              🚫 {ref.aspect.toUpperCase()}: {ref.message}
            </Text>
          ))}
        </Fold>
      )}

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
  note: { color: colors.sub, fontSize: 11, fontStyle: "italic", marginTop: 8 },
  adjustment: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 10, marginBottom: 10 },
  adjustTrigger: { color: colors.sub, fontSize: 11, fontWeight: "700", marginBottom: 3 },
  adjustChange: { color: colors.text, fontSize: 14, fontWeight: "800", lineHeight: 19 },
  adjustMech: { color: colors.text, fontSize: 12, marginTop: 4, lineHeight: 18 },
  adjustMeta: { color: colors.sub, fontSize: 11, marginTop: 4 },
});
