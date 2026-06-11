import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { buildReport } from "../../../../packages/engine/src";
import { buildRacePlan } from "../../../../packages/engine/src/planner";
import type { SelectedRunSummary } from "../../../../packages/engine/src/planner";
import type { GarageState } from "../../../../packages/garage/src";
import { bundleFromRun } from "../../../../packages/logbook/src";
import type { LogbookState, RunEntry } from "../../../../packages/logbook/src";
import { getTrack } from "../../../../packages/tracks/src";
import type { TracksState } from "../../../../packages/tracks/src";
import type { PitPlan } from "../../../../packages/strategy/src";
import { PitPlanView, RacePlanView, StrategyForm } from "../components/PlanViews";
import { RunReportCard } from "../components/RunReportCard";
import { KB } from "../kb";
import type { SavedReport } from "../reportstore";
import { loadCarSheets } from "../store";
import { colors, radius } from "../theme";
import { fetchWeather } from "../weather";
import { num } from "../components/forms";

/**
 * Engineer hub (D28): report-first. You see past reports, you generate a new
 * one FROM a run, you test, you come back — the iterative loop. Race planner
 * and pit strategy live here too (D30).
 */

interface Props {
  logbook: LogbookState;
  garage: GarageState;
  tracks: TracksState;
  reports: SavedReport[];
  addReport: (r: Omit<SavedReport, "id" | "created_at">) => void;
  /** arriving from the run log's floating bar: generate for this run immediately */
  requestRunId?: string;
}

type ViewState =
  | { k: "list" }
  | { k: "new_report" }
  | { k: "view"; saved: SavedReport }
  | { k: "plan_form" }
  | { k: "strategy_form"; from?: SavedReport }
  | { k: "strategy_view"; plan: PitPlan; options: PitPlan[] };

export function EngineerHubScreen({ logbook, garage, tracks, reports, addReport, requestRunId }: Props) {
  const [view, setView] = useState<ViewState>({ k: "list" });
  const [busy, setBusy] = useState(false);

  // one-shot auto-generation when the run log handed us a run
  const [consumedRequest, setConsumedRequest] = useState<string | undefined>();
  React.useEffect(() => {
    if (requestRunId && requestRunId !== consumedRequest) {
      const run = logbook.runs.find((r) => r.id === requestRunId);
      if (run) {
        setConsumedRequest(requestRunId);
        void generateReport(run, "");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestRunId]);

  /** the run's setup values, from its car's sheet store (draft as fallback) */
  const resolveSetup = async (run: RunEntry): Promise<Record<string, string | number>> => {
    const carId = run.car_id ?? garage.cars[0]?.id;
    if (!carId) return {};
    const sheets = await loadCarSheets(carId);
    if (!sheets) return {};
    const version = sheets.versions.find((v) => v.id === run.setup_version_id);
    return version?.values ?? sheets.draft;
  };

  const generateReport = async (run: RunEntry, notes: string) => {
    setBusy(true);
    try {
      const setup = await resolveSetup(run);
      const bundle = bundleFromRun(run, setup, logbook);
      if (notes.trim()) {
        bundle.feedback = {
          ...bundle.feedback,
          text: [bundle.feedback.text, notes.trim()].filter(Boolean).join(". "),
        };
      }
      const report = buildReport(bundle, KB);
      const saved: Omit<SavedReport, "id" | "created_at"> = {
        kind: "report",
        run_ids: [run.id],
        run_label: `${run.track.name} · ${run.type} · ${run.created_at.slice(5, 10)}`,
        notes: notes.trim() || undefined,
        report,
      };
      addReport(saved);
      setView({ k: "view", saved: { ...saved, id: "pending", created_at: run.created_at } });
    } finally {
      setBusy(false);
    }
  };

  const generatePlan = async (runs: RunEntry[], startIso: string, lengthMin: number, type: "sprint" | "endurance") => {
    setBusy(true);
    try {
      const latest = runs[runs.length - 1];
      const setup = await resolveSetup(latest);
      const bundle = bundleFromRun(latest, setup, logbook);
      const summaries: SelectedRunSummary[] = runs.map((r) => ({
        date: r.created_at,
        track_name: r.track.name,
        grip: r.conditions.grip,
        surface: r.track.surface,
        air_temp_c: r.conditions.air_temp_c,
        best_lap_s: r.result?.best_lap_s,
        avg_lap_s: r.result?.avg_lap_s,
        symptoms: r.feedback.tags.map((t) => t.symptom),
        outcome: r.outcome,
      }));
      // forecast from the latest selected run's track GPS, at race start
      let forecast;
      const track = latest.track_id ? getTrack(tracks, latest.track_id) : undefined;
      if (track?.gps) {
        forecast = (await fetchWeather(track.gps.lat, track.gps.lon, startIso)) ?? undefined;
      }
      const plan = buildRacePlan(bundle, summaries, { start_iso: startIso, length_s: lengthMin * 60, type }, forecast, KB);
      const saved: Omit<SavedReport, "id" | "created_at"> = {
        kind: "race_plan",
        run_ids: runs.map((r) => r.id),
        run_label: `${latest.track.name} · race ${startIso.slice(5, 10)} · ${lengthMin}min ${type}`,
        plan,
      };
      addReport(saved);
      setView({ k: "view", saved: { ...saved, id: "pending", created_at: startIso } });
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.busyText}>Engineer is reading your log…</Text>
      </View>
    );
  }

  if (view.k === "new_report") {
    return (
      <RunPicker
        logbook={logbook}
        multi={false}
        title="New report — pick the run to analyse"
        cta="Generate report"
        onCancel={() => setView({ k: "list" })}
        onDone={(runs, notes) => void generateReport(runs[0], notes)}
      />
    );
  }

  if (view.k === "plan_form") {
    return (
      <RunPicker
        logbook={logbook}
        multi
        title="Race planner — pick the training runs to compound"
        cta="Build race plan"
        askRace
        onCancel={() => setView({ k: "list" })}
        onDone={(runs, _notes, race) =>
          void generatePlan(runs, race!.startIso, race!.lengthMin, race!.type)
        }
      />
    );
  }

  if (view.k === "strategy_form") {
    const from = view.from?.plan;
    const latestRunId = view.from?.run_ids[view.from.run_ids.length - 1];
    const latestRun = logbook.runs.find((r) => r.id === latestRunId);
    const car = garage.cars.find((c) => c.id === latestRun?.car_id) ?? garage.cars[0];
    return (
      <View style={styles.root}>
        <Header title="Race strategy" onBack={() => setView({ k: "list" })} />
        <StrategyForm
          defaults={{
            avg_lap_s: from?.race_avg_lap_s,
            tank_cc: car?.fuel_tank_cc,
            lap_times: latestRun?.result?.laps_list,
            race_type: "endurance",
          }}
          onCancel={() => setView(view.from ? { k: "view", saved: view.from } : { k: "list" })}
          onResult={(plan, options) => {
            addReport({
              kind: "strategy",
              run_ids: view.from?.run_ids ?? [],
              run_label: `strategy · ${plan.total_laps} laps · ${plan.stops} stops`,
              strategy: plan,
            });
            setView({ k: "strategy_view", plan, options });
          }}
        />
      </View>
    );
  }

  if (view.k === "strategy_view") {
    return (
      <View style={styles.root}>
        <Header title="Pit strategy" onBack={() => setView({ k: "list" })} />
        <PitPlanView plan={view.plan} options={view.options} />
      </View>
    );
  }

  if (view.k === "view") {
    const s = view.saved;
    return (
      <View style={styles.root}>
        <Header title={s.kind === "race_plan" ? "Race plan" : "Engineer report"} onBack={() => setView({ k: "list" })} />
        {s.kind === "race_plan" && s.plan ? (
          <RacePlanView plan={s.plan} onStrategy={() => setView({ k: "strategy_form", from: s })} />
        ) : s.report ? (
          <View style={{ flex: 1 }}>
            {s.report.kind !== "report" && (
              <View style={styles.askMore}>
                <Text style={styles.askMoreText}>
                  The engineer couldn't ground a recommendation on this run. Add more detail to its
                  feedback — symptoms, where on track, when it happens — then generate again.
                </Text>
              </View>
            )}
            <RunReportCard report={s.report} />
          </View>
        ) : s.strategy ? (
          <PitPlanView plan={s.strategy} options={[]} />
        ) : null}
      </View>
    );
  }

  // ——— list ———
  const ordered = [...reports].reverse();
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.h1}>Engineer</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable style={styles.pillGhost} onPress={() => setView({ k: "plan_form" })}>
            <Text style={styles.pillGhostText}>🏆 Plan a race</Text>
          </Pressable>
          <Pressable style={styles.pill} onPress={() => setView({ k: "new_report" })}>
            <Text style={styles.pillText}>＋ New report</Text>
          </Pressable>
        </View>
      </View>

      {ordered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.emptyText}>
            Generate a report from a logged run: the engineer reads the setup, the conditions, the
            tyres and your feedback — then proposes up to 3 grounded changes. Test, log, come back.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
          {ordered.map((r) => (
            <Pressable key={r.id} style={styles.card} onPress={() => setView({ k: "view", saved: r })}>
              <Text style={styles.cardKind}>
                {r.kind === "race_plan" ? "🏆 RACE PLAN" : r.kind === "strategy" ? "⛽ STRATEGY" : "🔧 REPORT"}
              </Text>
              <Text style={styles.cardLabel}>{r.run_label}</Text>
              <Text style={styles.cardMeta}>
                {r.created_at.slice(5, 16).replace("T", " ")}
                {r.report ? ` · ${r.report.kind === "report" ? `confidence ${r.report.confidence}` : r.report.kind}` : ""}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** Run selection (single or multi) + optional notes + optional race window. */
function RunPicker({
  logbook,
  multi,
  title,
  cta,
  askRace,
  onDone,
  onCancel,
}: {
  logbook: LogbookState;
  multi: boolean;
  title: string;
  cta: string;
  askRace?: boolean;
  onDone: (runs: RunEntry[], notes: string, race?: { startIso: string; lengthMin: number; type: "sprint" | "endurance" }) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("14:00");
  const [lengthMin, setLengthMin] = useState("30");
  const [type, setType] = useState<"sprint" | "endurance">("endurance");
  const runs = [...logbook.runs].reverse();

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : multi ? [...prev, id] : [id],
    );

  const done = () => {
    const chosen = logbook.runs.filter((r) => selected.includes(r.id));
    if (chosen.length === 0) return;
    if (askRace) {
      const startIso = `${date.trim() || new Date().toISOString().slice(0, 10)}T${time.trim() || "14:00"}:00`;
      onDone(chosen, notes, { startIso, lengthMin: num(lengthMin) ?? 30, type });
    } else {
      onDone(chosen, notes);
    }
  };

  return (
    <View style={styles.root}>
      <Header title={title} onBack={onCancel} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
        {runs.length === 0 && <Text style={styles.emptyText}>Log a run first — the engineer works from your log.</Text>}
        {runs.map((r) => {
          const on = selected.includes(r.id);
          return (
            <Pressable key={r.id} style={[styles.card, on && { borderColor: colors.accent }]} onPress={() => toggle(r.id)}>
              <Text style={styles.cardLabel}>
                {on ? "☑ " : "☐ "}
                {r.track.name} · {r.type} · {r.created_at.slice(5, 16).replace("T", " ")}
              </Text>
              <Text style={styles.cardMeta}>
                {r.conditions.grip.replace("_", " ")} grip
                {r.result?.best_lap_s !== undefined ? ` · best ${r.result.best_lap_s.toFixed(2)}s` : ""}
                {r.feedback.tags.length > 0 ? ` · ${r.feedback.tags.map((t) => t.symptom.replace(/_/g, " ")).join(", ")}` : ""}
              </Text>
            </Pressable>
          );
        })}

        {askRace && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.fieldLabel}>Race day (YYYY-MM-DD) + start time</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput style={[styles.input, { flex: 1 }]} value={date} onChangeText={setDate} placeholder="2026-06-14" placeholderTextColor={colors.sub} />
              <TextInput style={[styles.input, { width: 90 }]} value={time} onChangeText={setTime} placeholder="14:00" placeholderTextColor={colors.sub} />
            </View>
            <Text style={styles.fieldLabel}>Race length (minutes) + type</Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput style={[styles.input, { width: 90 }]} value={lengthMin} onChangeText={setLengthMin} keyboardType="numeric" placeholderTextColor={colors.sub} />
              {(["sprint", "endurance"] as const).map((t) => (
                <Pressable key={t} style={[styles.typeChip, type === t && styles.typeChipOn]} onPress={() => setType(t)}>
                  <Text style={[styles.typeChipText, type === t && { color: colors.accent, fontWeight: "700" }]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {!askRace && (
          <>
            <Text style={styles.fieldLabel}>Additional notes for the engineer (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 70 }]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder='e.g. "mostly in the long sweeper, worse with the second tank"'
              placeholderTextColor={colors.sub}
            />
          </>
        )}

        <Pressable style={[styles.cta, selected.length === 0 && { opacity: 0.4 }]} disabled={selected.length === 0} onPress={done}>
          <Text style={styles.ctaText}>{cta}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.headerBar}>
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={styles.back}>‹ back</Text>
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  busyText: { color: colors.sub, fontSize: 13, marginTop: 10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  h1: { color: colors.text, fontSize: 16, fontWeight: "800" },
  pill: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  pillText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  pillGhost: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  pillGhostText: { color: colors.text, fontWeight: "700", fontSize: 12 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 8 },
  emptyText: { color: colors.sub, fontSize: 13, textAlign: "center", lineHeight: 19 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  cardKind: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  cardLabel: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 2 },
  cardMeta: { color: colors.sub, fontSize: 11, marginTop: 2 },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  headerTitle: { color: colors.text, fontSize: 15, fontWeight: "800", flex: 1 },
  fieldLabel: { color: colors.sub, fontSize: 12, marginTop: 12, marginBottom: 4 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  typeChip: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  typeChipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  typeChipText: { color: colors.sub, fontSize: 12 },
  askMore: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.warn,
    borderRadius: radius.md,
    padding: 10,
    margin: 14,
    marginBottom: 0,
  },
  askMoreText: { color: colors.text, fontSize: 12, lineHeight: 18 },
});
