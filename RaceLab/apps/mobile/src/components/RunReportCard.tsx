import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { EngineerReport, RecommendationOption } from "../../../../packages/engine/src";
import { colors, radius } from "../theme";

/** Renders the 8-part engineer report (Layer 3 + 4). Every section the
 *  product promises, in reading order, citations visible — grounded or silent. */

export function RunReportCard({ report }: { report: EngineerReport }) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Text style={styles.echo}>{report.conditions_echo}</Text>

      <Block n="1" title="Diagnosis">
        <Text style={styles.body}>{report.diagnosis}</Text>
      </Block>

      {report.message !== undefined && (
        <View style={[styles.card, styles.messageCard]}>
          <Text style={styles.body}>{report.message}</Text>
        </View>
      )}

      {report.primary && (
        <Block n="2" title="Priority change">
          <Option option={report.primary} highlight />
        </Block>
      )}

      {report.secondary && (
        <Block n="3" title="Secondary change (only if the first doesn't do it)">
          <Option option={report.secondary} />
        </Block>
      )}

      {report.do_not_touch.length > 0 && (
        <Block n="4" title="Don't touch yet">
          {report.do_not_touch.map((d, i) => (
            <Text key={i} style={styles.bullet}>
              · {d}
            </Text>
          ))}
        </Block>
      )}

      {report.expected_behavior !== undefined && (
        <Block n="5" title="Expected behavior change">
          <Text style={styles.body}>{report.expected_behavior}</Text>
        </Block>
      )}

      {report.driving_tips.length > 0 && (
        <Block n="6" title="Driving adaptation">
          {report.driving_tips.map((t, i) => (
            <Text key={i} style={styles.bullet}>
              🎮 {t}
            </Text>
          ))}
        </Block>
      )}

      <Block n="7" title="Confidence">
        <Text style={[styles.confidence, confidenceStyle(report.confidence)]}>
          {report.confidence.toUpperCase()}
        </Text>
      </Block>

      <Block n="8" title="Why this recommendation">
        <Text style={styles.body}>{report.rationale}</Text>
      </Block>
    </ScrollView>
  );
}

function Block({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.blockTitle}>
        <Text style={styles.blockNum}>{n} · </Text>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Option({ option, highlight }: { option: RecommendationOption; highlight?: boolean }) {
  return (
    <View style={[styles.option, highlight && styles.optionHighlight]}>
      <Text style={styles.optionChange}>{option.change}</Text>
      <Text style={styles.optionDetail}>{option.mechanism}</Text>
      <Text style={styles.optionMeta}>
        Revert: {option.revert} · cites {option.citations.join(", ")}
      </Text>
      <Text style={styles.optionFallback}>If it doesn't help: {option.if_it_does_not_help}</Text>
    </View>
  );
}

function confidenceStyle(c: EngineerReport["confidence"]) {
  switch (c) {
    case "high":
      return { color: colors.good };
    case "medium":
      return { color: colors.warn };
    default:
      return { color: colors.sub };
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  echo: { color: colors.sub, fontSize: 12, fontStyle: "italic", marginBottom: 10 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  messageCard: { borderColor: colors.warn },
  blockTitle: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 6 },
  blockNum: { color: colors.accent },
  body: { color: colors.text, fontSize: 13, lineHeight: 19 },
  bullet: { color: colors.text, fontSize: 13, lineHeight: 20 },
  option: { borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 10 },
  optionHighlight: { borderLeftColor: colors.accent },
  optionChange: { color: colors.text, fontSize: 14, fontWeight: "700" },
  optionDetail: { color: colors.text, fontSize: 12, marginTop: 4, lineHeight: 18 },
  optionMeta: { color: colors.sub, fontSize: 11, marginTop: 4 },
  optionFallback: { color: colors.sub, fontSize: 11, marginTop: 2, fontStyle: "italic" },
  confidence: { fontSize: 16, fontWeight: "900", letterSpacing: 1 },
});
