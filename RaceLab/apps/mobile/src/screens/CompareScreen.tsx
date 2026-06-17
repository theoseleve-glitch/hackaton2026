import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { compareRuns } from "../../../../packages/logbook/src";
import type { LogbookState, RunComparison } from "../../../../packages/logbook/src";
import type { SetupValues } from "../../../../packages/sheets/src";
import type { ChangedField } from "../../../../packages/sheets/src";
import { label } from "../kb";
import { loadCarSheets } from "../store";
import { colors, radius } from "../theme";
import { useT } from "../i18n";

/**
 * Layer 2 — comparison of two runs picked from the run log: what changed
 * (setup / conditions / tyres), what got faster, what got easier to drive.
 * Setup versions are resolved across BOTH runs' cars (multi-car, D26).
 */

interface Props {
  logbook: LogbookState;
  aId: string;
  bId: string;
  onClose: () => void;
}

export function CompareScreen({ logbook, aId, bId, onClose }: Props) {
  const t = useT();
  const [comparison, setComparison] = useState<RunComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const a = logbook.runs.find((r) => r.id === aId);
      const b = logbook.runs.find((r) => r.id === bId);
      if (!a || !b) {
        setLoading(false);
        return;
      }
      // resolve setup versions from every involved car's sheet store
      const values = new Map<string, SetupValues>();
      const carIds = new Set([a.car_id ?? "car-legacy-mp11", b.car_id ?? "car-legacy-mp11"]);
      for (const carId of carIds) {
        const sheets = await loadCarSheets(carId);
        for (const v of sheets?.versions ?? []) values.set(v.id, v.values);
      }
      const [first, second] = a.created_at <= b.created_at ? [a, b] : [b, a];
      if (!cancelled) {
        setComparison(compareRuns(first, second, (id) => values.get(id)));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aId, bId, logbook]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>{t({ en: "‹ runs", fr: "‹ sessions" })}</Text>
        </Pressable>
        <Text style={styles.title}>{t({ en: "Compare", fr: "Comparer" })}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !comparison ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t({ en: "Could not find those runs.", fr: "Impossible de retrouver ces sessions." })}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
          <View style={styles.pair}>
            <RunHalf title={t({ en: "A (earlier)", fr: "A (avant)" })} run={comparison.a} />
            <Text style={styles.vs}>{t({ en: "vs", fr: "vs" })}</Text>
            <RunHalf title={t({ en: "B (later)", fr: "B (après)" })} run={comparison.b} />
          </View>

          <View style={[styles.card, { borderColor: colors.accent }]}>
            <Text style={styles.cardTitle}>{t({ en: "Verdict", fr: "Verdict" })}</Text>
            {comparison.summary.map((line, i) => (
              <Text key={i} style={styles.line}>
                · {line}
              </Text>
            ))}
          </View>

          {comparison.setup_changes !== undefined && comparison.setup_changes.length > 0 && (
            <DiffTable
              title={t({
                en: `Setup changes (${comparison.setup_changes.length})`,
                fr: `Changements de réglages (${comparison.setup_changes.length})`,
              })}
              changes={comparison.setup_changes}
              accent
            />
          )}
          {comparison.condition_changes.length > 0 && (
            <DiffTable title={t({ en: "Condition drift", fr: "Dérive des conditions" })} changes={comparison.condition_changes} />
          )}
          {comparison.tyre_changes.length > 0 && (
            <DiffTable title={t({ en: "Tyre changes", fr: "Changements de pneus" })} changes={comparison.tyre_changes} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function RunHalf({ title, run }: { title: string; run: RunComparison["a"] }) {
  const t = useT();
  return (
    <View style={styles.half}>
      <Text style={styles.halfTitle}>{title}</Text>
      <Text style={styles.halfText}>{run.created_at.slice(5, 16).replace("T", " ")}</Text>
      <Text style={styles.halfText}>
        {run.track.name} · {run.conditions.grip.replace("_", " ")}
      </Text>
      <Text style={styles.halfLap}>
        {run.result?.best_lap_s !== undefined
          ? `${run.result.best_lap_s.toFixed(2)}s`
          : t({ en: "no laps", fr: "aucun tour" })}
      </Text>
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
            <Text style={{ color: colors.sub }}>{c.from ?? "—"}</Text>
            {"  →  "}
            <Text style={{ color: colors.accent, fontWeight: "700" }}>{c.to ?? "—"}</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  title: { color: colors.text, fontSize: 16, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.sub, fontSize: 13 },
  pair: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  half: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
  },
  halfTitle: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  halfText: { color: colors.text, fontSize: 12, marginTop: 2 },
  halfLap: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 4 },
  vs: { color: colors.sub, fontSize: 12, fontWeight: "800" },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  line: { color: colors.text, fontSize: 13, lineHeight: 20 },
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
});
