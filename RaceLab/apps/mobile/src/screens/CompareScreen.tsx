import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { compareRuns } from "../../../../packages/logbook/src";
import type { LogbookState, RunEntry } from "../../../../packages/logbook/src";
import { getVersion } from "../../../../packages/sheets/src";
import type { SheetsState } from "../../../../packages/sheets/src";
import type { ChangedField } from "../../../../packages/sheets/src";
import { label } from "../kb";
import { colors, radius } from "../theme";

/**
 * Layer 2 — run comparison. Pick any two runs: what changed (setup,
 * conditions, tyres), what got faster, what got easier to drive. Defaults to
 * the last two runs — the between-heats question.
 */

interface Props {
  sheets: SheetsState;
  logbook: LogbookState;
  /** preselected pair (e.g. "vs prev" from a run card); remount with a key to apply */
  initialA?: string;
  initialB?: string;
}

export function CompareScreen({ sheets, logbook, initialA, initialB }: Props) {
  const runs = [...logbook.runs].reverse(); // newest first
  const [aId, setAId] = useState<string | undefined>(initialA ?? runs[1]?.id);
  const [bId, setBId] = useState<string | undefined>(initialB ?? runs[0]?.id);

  const comparison = useMemo(() => {
    const a = logbook.runs.find((r) => r.id === aId);
    const b = logbook.runs.find((r) => r.id === bId);
    if (!a || !b || a.id === b.id) return null;
    // chronological order: a = earlier, b = later
    const [first, second] = a.created_at <= b.created_at ? [a, b] : [b, a];
    return compareRuns(first, second, (id) => getVersion(sheets, id)?.values);
  }, [aId, bId, logbook, sheets]);

  if (runs.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Need two runs to compare</Text>
        <Text style={styles.emptyText}>
          Log at least two runs, then this screen answers: what changed, what got faster, what got
          easier to drive.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Picker title="Run A (baseline)" runs={runs} selected={aId} exclude={bId} onSelect={setAId} />
      <Picker title="Run B (compare)" runs={runs} selected={bId} exclude={aId} onSelect={setBId} />

      {comparison && (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Verdict</Text>
            {comparison.summary.map((line, i) => (
              <Text key={i} style={styles.verdictLine}>
                · {line}
              </Text>
            ))}
          </View>

          {comparison.setup_changes !== undefined && comparison.setup_changes.length > 0 && (
            <DiffTable title={`Setup changes (${comparison.setup_changes.length})`} changes={comparison.setup_changes} accent />
          )}
          {comparison.condition_changes.length > 0 && (
            <DiffTable title="Condition drift" changes={comparison.condition_changes} />
          )}
          {comparison.tyre_changes.length > 0 && (
            <DiffTable title="Tyre changes" changes={comparison.tyre_changes} />
          )}
        </>
      )}
    </ScrollView>
  );
}

function Picker({
  title,
  runs,
  selected,
  exclude,
  onSelect,
}: {
  title: string;
  runs: RunEntry[];
  selected: string | undefined;
  exclude: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.pickerTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.pickerRow}>
          {runs.map((r) => {
            const active = r.id === selected;
            const disabled = r.id === exclude;
            return (
              <Pressable
                key={r.id}
                style={[styles.pick, active && styles.pickActive, disabled && styles.pickDisabled]}
                onPress={() => !disabled && onSelect(r.id)}
              >
                <Text style={[styles.pickType, active && styles.pickTextActive]}>
                  {r.type.slice(0, 4).toUpperCase()}
                </Text>
                <Text style={[styles.pickText, active && styles.pickTextActive]}>
                  {r.created_at.slice(5, 16).replace("T", " ")}
                </Text>
                <Text style={[styles.pickSub, active && styles.pickTextActive]}>
                  {r.result?.best_lap_s !== undefined ? `${r.result.best_lap_s.toFixed(2)}s` : "no laps"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function DiffTable({ title, changes, accent }: { title: string; changes: ChangedField[]; accent?: boolean }) {
  return (
    <View style={[styles.card, accent && { borderColor: colors.accent }]}>
      <Text style={styles.cardTitle}>{title}</Text>
      {changes.map((c) => (
        <View key={c.field} style={styles.diffRow}>
          <Text style={styles.diffField}>{label(c.field)}</Text>
          <Text style={styles.diffValues}>
            <Text style={styles.diffFrom}>{c.from ?? "—"}</Text>
            {"  →  "}
            <Text style={styles.diffTo}>{c.to ?? "—"}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: colors.bg },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 8 },
  emptyText: { color: colors.sub, fontSize: 13, textAlign: "center", lineHeight: 19 },
  pickerWrap: { marginBottom: 12 },
  pickerTitle: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  pickerRow: { flexDirection: "row", gap: 8 },
  pick: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 110,
  },
  pickActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pickDisabled: { opacity: 0.35 },
  pickType: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  pickText: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 2 },
  pickSub: { color: colors.sub, fontSize: 11, marginTop: 2 },
  pickTextActive: { color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  verdictLine: { color: colors.text, fontSize: 13, lineHeight: 20 },
  diffRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  diffField: { color: colors.text, fontSize: 12, flex: 1 },
  diffValues: { fontSize: 12 },
  diffFrom: { color: colors.sub },
  diffTo: { color: colors.accent, fontWeight: "700" },
});
