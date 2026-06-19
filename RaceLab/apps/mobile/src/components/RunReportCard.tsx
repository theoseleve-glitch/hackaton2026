import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { EngineerReport, RecommendationOption } from "../../../../packages/engine/src";
import { colors, radius } from "../theme";

/**
 * Engineer report, Pit Board layout (Théo's pick): the verdict IS the report —
 * one huge call at the top, three key tiles, everything else folded. All 8
 * promised sections survive inside the folds; citations stay visible
 * (grounded or silent).
 */

export function RunReportCard({ report }: { report: EngineerReport }) {
  const cites = report.primary?.citations ?? [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Text style={styles.echo}>{report.conditions_echo}</Text>

      {/* ——— plain-English headline: read this FIRST (R4-3) ——— */}
      {report.headline ? <Text style={styles.headline}>{report.headline}</Text> : null}

      {/* ——— the verdict ——— */}
      {report.kind === "report" && report.primary ? (
        <View style={styles.verdictCard}>
          <Text style={styles.verdictKicker}>{report.primary.setting.replace(/_/g, " ").toUpperCase()}</Text>
          <Text style={styles.verdict}>{report.primary.change}</Text>
          {report.primary.magnitude ? (
            <Text style={styles.verdictMag}>{report.primary.magnitude}</Text>
          ) : null}
          <Text style={styles.verdictMech}>{report.primary.mechanism}</Text>
          <Text style={styles.verdictRevert}>revert: {report.primary.revert}</Text>
        </View>
      ) : (
        <View style={[styles.verdictCard, report.kind === "refusal" && styles.verdictRefusal]}>
          <Text style={styles.verdictKicker}>{report.kind === "refusal" ? "OUT OF MY LANE" : "STAY PUT"}</Text>
          <Text style={styles.verdictSmall}>{report.message ?? report.diagnosis}</Text>
        </View>
      )}

      {/* ——— three tiles ——— */}
      <View style={styles.tiles}>
        <Tile value={report.confidence.toUpperCase()} label="confidence" tone={confidenceColor(report.confidence)} />
        <Tile value={String(cites.length)} label={cites.length === 1 ? "rule cited" : "rules cited"} />
        <Tile value={String(report.driving_tips.length)} label="drive tips" />
      </View>

      {/* ——— folds: the full 8 sections live here ——— */}
      <Fold title="Why — diagnosis & grounds" badge={cites.join(" · ") || undefined}>
        <Text style={styles.body}>{report.diagnosis}</Text>
        <Text style={[styles.body, { marginTop: 8 }]}>{report.rationale}</Text>
      </Fold>

      {report.do_not_touch.length > 0 && (
        <Fold title="Don't touch yet" badge={String(report.do_not_touch.length)}>
          {report.do_not_touch.map((d, i) => (
            <Text key={i} style={styles.bullet}>
              ✋ {d}
            </Text>
          ))}
        </Fold>
      )}

      {(report.expected_behavior !== undefined || report.primary?.expected_effect !== undefined) && (
        <Fold title="Expected behavior">
          {report.primary?.expected_effect !== undefined && (
            <Text style={styles.expect}>{report.primary.expected_effect}</Text>
          )}
          {report.expected_behavior !== undefined && <Text style={styles.body}>{report.expected_behavior}</Text>}
        </Fold>
      )}

      {(report.secondary || report.primary?.if_it_does_not_help !== undefined) && (
        <Fold title="Plan B — if it doesn't help">
          {report.primary?.if_it_does_not_help !== undefined && (
            <Text style={styles.body}>{report.primary.if_it_does_not_help}</Text>
          )}
          {report.secondary && <OptionRow option={report.secondary} />}
        </Fold>
      )}

      {report.driving_tips.length > 0 && (
        <Fold title="Driving adaptation" badge={String(report.driving_tips.length)}>
          {report.driving_tips.map((t, i) => (
            <Text key={i} style={styles.bullet}>
              🎮 {t}
            </Text>
          ))}
        </Fold>
      )}
    </ScrollView>
  );
}

export function Tile({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, tone !== undefined && { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/** Collapsed by default — the verdict is the report; details on demand. */
export function Fold({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fold}>
      <Pressable style={styles.foldHead} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.foldChevron}>{open ? "▾" : "▸"}</Text>
        <Text style={styles.foldTitle}>{title}</Text>
        {badge !== undefined && <Text style={styles.foldBadge}>{badge}</Text>}
      </Pressable>
      {open && <View style={styles.foldBody}>{children}</View>}
    </View>
  );
}

function OptionRow({ option }: { option: RecommendationOption }) {
  return (
    <View style={styles.option}>
      <Text style={styles.optionChange}>{option.change}</Text>
      {option.magnitude ? <Text style={styles.optionMag}>{option.magnitude}</Text> : null}
      <Text style={styles.optionDetail}>{option.mechanism}</Text>
      <Text style={styles.optionMeta}>
        revert: {option.revert} · cites {option.citations.join(", ")}
      </Text>
    </View>
  );
}

export function confidenceColor(c: EngineerReport["confidence"]): string {
  switch (c) {
    case "high":
      return colors.good;
    case "medium":
      return colors.warn;
    default:
      return colors.sub;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  echo: { color: colors.sub, fontSize: 12, fontStyle: "italic", marginBottom: 10 },
  headline: { color: colors.text, fontSize: 17, fontWeight: "800", lineHeight: 23, marginBottom: 12 },
  verdictCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 10,
  },
  verdictRefusal: { borderColor: colors.warn },
  verdictKicker: { color: colors.sub, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 6 },
  verdict: { color: colors.accent, fontSize: 26, fontWeight: "900", lineHeight: 32 },
  verdictMag: { color: colors.text, fontSize: 15, fontWeight: "800", lineHeight: 21, marginTop: 8 },
  verdictSmall: { color: colors.text, fontSize: 16, fontWeight: "700", lineHeight: 23 },
  verdictMech: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 10 },
  verdictRevert: { color: colors.sub, fontSize: 11, fontStyle: "italic", marginTop: 6 },
  tiles: { flexDirection: "row", gap: 8, marginBottom: 10 },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  tileValue: { color: colors.text, fontSize: 19, fontWeight: "900" },
  tileLabel: { color: colors.sub, fontSize: 10, marginTop: 3, textTransform: "uppercase", letterSpacing: 0.6 },
  fold: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
    overflow: "hidden",
  },
  foldHead: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 12, gap: 8 },
  foldChevron: { color: colors.accent, fontSize: 13, width: 14 },
  foldTitle: { color: colors.text, fontSize: 13, fontWeight: "800", flex: 1 },
  foldBadge: { color: colors.sub, fontSize: 11, fontWeight: "700" },
  foldBody: { paddingHorizontal: 12, paddingBottom: 12 },
  body: { color: colors.text, fontSize: 13, lineHeight: 19 },
  bullet: { color: colors.text, fontSize: 13, lineHeight: 21 },
  expect: { color: colors.good, fontSize: 13, fontWeight: "700", marginBottom: 6, lineHeight: 19 },
  option: { borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 10, marginTop: 8 },
  optionChange: { color: colors.text, fontSize: 14, fontWeight: "700" },
  optionMag: { color: colors.text, fontSize: 13, fontWeight: "800", marginTop: 3 },
  optionDetail: { color: colors.text, fontSize: 12, marginTop: 4, lineHeight: 18 },
  optionMeta: { color: colors.sub, fontSize: 11, marginTop: 4 },
});
