import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { buildReport } from "../../../../packages/engine/src";
import type { EngineerReport } from "../../../../packages/engine/src";
import {
  addRun,
  bundleFromRun,
  lastRun,
  previousRun,
  rateRun,
  similarRuns,
} from "../../../../packages/logbook/src";
import type { LogbookState, Outcome, RunEntry } from "../../../../packages/logbook/src";
import { getVersion } from "../../../../packages/sheets/src";
import type { SheetsState } from "../../../../packages/sheets/src";
import { RunForm } from "../components/RunForm";
import { RunReportCard } from "../components/RunReportCard";
import { KB } from "../kb";
import { colors, radius } from "../theme";

/**
 * Layer 1 surface — the run log. Log fast, rate the run (learning loop), and
 * ask the engineer about any run: the report is built from the log, the user
 * never retypes context.
 */

const OUTCOMES: Outcome[] = ["better", "same", "worse"];

interface Props {
  sheets: SheetsState;
  logbook: LogbookState;
  updateLogbook: (fn: (prev: LogbookState) => LogbookState) => void;
  /** jump to the Compare tab with two runs preselected */
  onCompare: (aId: string, bId: string) => void;
}

type View_ = { kind: "list" } | { kind: "form" } | { kind: "report"; report: EngineerReport; runId: string };

export function RunsScreen({ sheets, logbook, updateLogbook, onCompare }: Props) {
  const [view, setView] = useState<View_>({ kind: "list" });
  const last = lastRun(logbook);

  const activeSetup = getVersion(sheets, sheets.draft_base_id);
  const setupName = activeSetup?.locked ? sheets.draft_name : (activeSetup?.name ?? sheets.draft_name);

  const openReport = (run: RunEntry) => {
    // Resolve the EXACT setup that was on the car; fall back to today's draft
    // (clearly possible when a version came from another device).
    const values = getVersion(sheets, run.setup_version_id)?.values ?? sheets.draft;
    const report = buildReport(bundleFromRun(run, values, logbook), KB);
    setView({ kind: "report", report, runId: run.id });
  };

  if (view.kind === "form") {
    return (
      <RunForm
        setupVersionId={sheets.draft_base_id}
        setupName={setupName}
        defaultTrack={last ? { ...last.track } : undefined}
        onCancel={() => setView({ kind: "list" })}
        onSave={(run) => {
          updateLogbook((prev) => addRun(prev, run, run.created_at).state);
          setView({ kind: "list" });
        }}
      />
    );
  }

  if (view.kind === "report") {
    return (
      <View style={styles.root}>
        <Pressable style={styles.back} onPress={() => setView({ kind: "list" })}>
          <Text style={styles.backText}>← Back to runs</Text>
        </Pressable>
        <RunReportCard report={view.report} />
      </View>
    );
  }

  const runs = [...logbook.runs].reverse(); // newest first

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Run log <Text style={styles.count}>· {runs.length}</Text>
        </Text>
        <Pressable style={styles.logBtn} onPress={() => setView({ kind: "form" })}>
          <Text style={styles.logBtnText}>+ Log run</Text>
        </Pressable>
      </View>

      {runs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No runs yet</Text>
          <Text style={styles.emptyText}>
            Log your first run — setup, conditions, tyres, how it felt. Every run you log makes the
            engineer smarter about YOUR car on YOUR tracks.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
          {last && <ConditionsInsight logbook={logbook} current={last} />}
          {runs.map((run) => {
            const prev = previousRun(logbook, run.id);
            return (
              <RunCard
                key={run.id}
                run={run}
                onRate={(o) => updateLogbook((p) => rateRun(p, run.id, o))}
                onReport={() => openReport(run)}
                onComparePrev={prev ? () => onCompare(prev.id, run.id) : undefined}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

/** Layer 2 made ambient: "what did I usually do in these conditions?" —
 *  rendered from the latest run's grip/surface, entirely from the log. */
function ConditionsInsight({ logbook, current }: { logbook: LogbookState; current: RunEntry }) {
  const similar = similarRuns(
    logbook,
    { grip: current.conditions.grip },
    { surface: current.track.surface, exclude_id: current.id },
  );
  if (similar.length === 0) return null;

  const better = similar.filter((r) => r.outcome === "better");
  const timed = similar.filter((r) => r.result?.best_lap_s !== undefined);
  const fastest = timed.length
    ? timed.reduce((a, b) => (a.result!.best_lap_s! <= b.result!.best_lap_s! ? a : b))
    : undefined;

  const bits: string[] = [`${similar.length} past run${similar.length > 1 ? "s" : ""}`];
  if (fastest) bits.push(`best ${fastest.result!.best_lap_s!.toFixed(2)}s on “${fastest.setup_name}”`);
  if (better.length > 0)
    bits.push(`rated better: ${[...new Set(better.map((r) => `“${r.setup_name}”`))].join(", ")}`);

  return (
    <View style={styles.insight}>
      <Text style={styles.insightTitle}>
        In these conditions before ({current.conditions.grip.replace("_", " ")} grip{" "}
        {current.track.surface})
      </Text>
      <Text style={styles.insightText}>{bits.join(" · ")}</Text>
    </View>
  );
}

function RunCard({
  run,
  onRate,
  onReport,
  onComparePrev,
}: {
  run: RunEntry;
  onRate: (o: Outcome) => void;
  onReport: () => void;
  onComparePrev?: () => void;
}) {
  const date = run.created_at.slice(5, 16).replace("T", " ");
  const symptoms = run.feedback.tags.map((t) => t.symptom.replace(/_/g, " ")).join(", ");

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardType}>{run.type.toUpperCase()}</Text>
        <Text style={styles.cardDate}>{date}</Text>
      </View>
      <Text style={styles.cardTrack}>
        {run.track.name} · {run.track.surface} · {run.conditions.grip.replace("_", " ")} grip
      </Text>
      <Text style={styles.cardSetup}>⚙ {run.setup_name}</Text>
      <View style={styles.cardStats}>
        {run.result?.best_lap_s !== undefined && (
          <Text style={styles.cardStat}>best {run.result.best_lap_s.toFixed(2)}s</Text>
        )}
        {run.result?.driver_confidence !== undefined && (
          <Text style={styles.cardStat}>confidence {run.result.driver_confidence}/5</Text>
        )}
        {run.tyres?.wear && <Text style={styles.cardStat}>tyres {run.tyres.wear}</Text>}
      </View>
      {symptoms.length > 0 && <Text style={styles.cardSymptoms}>“{symptoms}”</Text>}

      <View style={styles.cardActions}>
        <View style={styles.rateRow}>
          {OUTCOMES.map((o) => (
            <Pressable
              key={o}
              style={[styles.rate, run.outcome === o && styles.rateActive]}
              onPress={() => onRate(o)}
            >
              <Text style={[styles.rateText, run.outcome === o && styles.rateTextActive]}>{o}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {onComparePrev && (
            <Pressable style={styles.reportBtn} onPress={onComparePrev}>
              <Text style={styles.reportBtnText}>⚖ vs prev</Text>
            </Pressable>
          )}
          <Pressable style={styles.reportBtn} onPress={onReport}>
            <Text style={styles.reportBtnText}>🔧 Engineer</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "800" },
  count: { color: colors.sub, fontWeight: "400" },
  logBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  logBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 8 },
  emptyText: { color: colors.sub, fontSize: 13, textAlign: "center", lineHeight: 19 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  cardType: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  cardDate: { color: colors.sub, fontSize: 11 },
  cardTrack: { color: colors.text, fontSize: 14, fontWeight: "700" },
  cardSetup: { color: colors.sub, fontSize: 12, marginTop: 2 },
  cardStats: { flexDirection: "row", gap: 10, marginTop: 6 },
  cardStat: { color: colors.text, fontSize: 12, fontWeight: "600" },
  cardSymptoms: { color: colors.warn, fontSize: 12, marginTop: 6, fontStyle: "italic" },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  rateRow: { flexDirection: "row", gap: 6 },
  rate: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  rateActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  rateText: { color: colors.sub, fontSize: 11 },
  rateTextActive: { color: colors.accent, fontWeight: "700" },
  reportBtn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  reportBtnText: { color: colors.accent, fontWeight: "800", fontSize: 12 },
  back: { paddingHorizontal: 14, paddingVertical: 10 },
  backText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  insight: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  insightTitle: { color: colors.accent, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  insightText: { color: colors.text, fontSize: 13, marginTop: 4, lineHeight: 19 },
});
