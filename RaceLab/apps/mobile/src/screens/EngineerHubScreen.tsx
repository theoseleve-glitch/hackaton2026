import React, { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type Svg from "react-native-svg";
import { buildReport, buildRacePlan } from "../../../../packages/engine/src";
import type { SelectedRunSummary } from "../../../../packages/engine/src";
import type { GarageState } from "../../../../packages/garage/src";
import { bestAutonomy, bundleFromRun, deriveConsumption, learningTuples, runAvgLap, runBestLap, runEntrants, runLapsList, runPosition } from "../../../../packages/logbook/src";
import type { LearningTuple, LogbookState, OutcomeRecord, RunEntry } from "../../../../packages/logbook/src";
import { getTrack, snapshotTrack } from "../../../../packages/tracks/src";
import type { TracksState } from "../../../../packages/tracks/src";
import { makeWeatherObservation } from "../../../../packages/schema/src";
import type { WeatherObservation } from "../../../../packages/schema/src";
import type { PitPlan, StrategyInputs } from "../../../../packages/strategy/src";
import { fmtTime, PitPlanView, RacePlanView, RunPicker, StrategyForm } from "../components/PlanViews";
import type { StrategyPrefill, TrackChoice } from "../components/PlanViews";
import { RunReportCard } from "../components/RunReportCard";
import { ReportCard } from "../components/ReportCard";
import { KB } from "../kb";
import type { SavedReport } from "../reportstore";
import { loadCarSheets } from "../store";
import { sharePng } from "../share";
import { colors, radius } from "../theme";
import { fetchWeather } from "../weather";
import { useT } from "../i18n";

/**
 * Engineer hub (D28): report-first. You see past reports, you generate a new
 * one FROM a run, you test, you come back — the iterative loop. Race planner
 * and pit strategy live here too (D30): both are track-first now, and the
 * strategy form prefills itself from your logged autonomy tests and laps.
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
  | { k: "strategy_pick" }
  | { k: "strategy_form"; prefill: StrategyPrefill; runIds: string[]; from?: SavedReport }
  | { k: "strategy_view"; plan: PitPlan; options: PitPlan[]; inputs?: StrategyInputs };

/** The race window is denormalized into the plan's label ("… · 30min endurance"). */
function parseRaceWindow(label: string): { race_length_s?: number; race_type?: "sprint" | "endurance" } {
  const m = label.match(/(\d+)\s*min\s+(sprint|endurance)/);
  return m ? { race_length_s: Number(m[1]) * 60, race_type: m[2] as "sprint" | "endurance" } : {};
}

/**
 * ★ Phase 2B unlock — the deferred engine william inputs. Now that runs are
 * schema RunEntry/OutcomeRecord, compose the schema-shaped inputs William's
 * race-day planner consumes:
 *  - `practice`: LearningTuples from the selected runs' self-ratings. (Advised-
 *    change OutcomeRecords are not persisted in-app yet — no outcome store —
 *    so [] there; rated runs still yield run-rating tuples. Deferred: wire an
 *    outcomes repo so advised-change attribution feeds this too.)
 *  - `forecastObs`: a one-element WeatherObservation[] built from the theo
 *    forecast at race start (offset-carrying ISO so makeWeatherObservation
 *    accepts it). Empty when there is no forecast.
 *  - `track`: the latest selected run's frozen TrackSnapshot.
 */
function buildWilliamInputs(
  runs: readonly RunEntry[],
  latest: RunEntry,
  startIso: string,
  forecast: { air_temp_c?: number; humidity_pct?: number; wind_kmh?: number; pressure_hpa?: number; rain_risk_pct?: number } | undefined,
): { practice: readonly LearningTuple[]; forecastObs: readonly WeatherObservation[]; track: ReturnType<typeof snapshotTrack> } | undefined {
  const outcomes: OutcomeRecord[] = []; // no in-app outcomes store yet (deferred)
  const practice = learningTuples([...runs], outcomes);

  const forecastObs: WeatherObservation[] = [];
  if (forecast !== undefined) {
    const w = makeWeatherObservation({
      source: "auto",
      observed_at: startIso,
      ...(forecast.air_temp_c !== undefined ? { air_temp_c: forecast.air_temp_c } : {}),
      ...(forecast.humidity_pct !== undefined ? { humidity_pct: forecast.humidity_pct } : {}),
      ...(forecast.wind_kmh !== undefined ? { wind_speed_kmh: forecast.wind_kmh } : {}),
      ...(forecast.pressure_hpa !== undefined ? { pressure_hpa: forecast.pressure_hpa } : {}),
      ...(forecast.rain_risk_pct !== undefined ? { precipitation_probability_pct: forecast.rain_risk_pct } : {}),
    });
    if (w.ok) forecastObs.push(w.observation);
  }

  // latest.track is already a frozen TrackSnapshot; re-snapshot is a cheap
  // detached copy that satisfies the planner's TrackSnapshot input.
  return { practice, forecastObs, track: { ...latest.track } };
}

export function EngineerHubScreen({ logbook, garage, tracks, reports, addReport, requestRunId }: Props) {
  const t = useT();
  const [view, setView] = useState<ViewState>({ k: "list" });
  const [busy, setBusy] = useState(false);
  // share the engineer report as a PNG poster (off-screen SVG → toDataURL)
  const reportCardRef = useRef<Svg>(null);
  const [sharingReport, setSharingReport] = useState(false);
  const shareReport = () => {
    const svg = reportCardRef.current;
    if (!svg) return;
    setSharingReport(true);
    svg.toDataURL((b64: string) => {
      void sharePng(b64, "engineer-report").finally(() => setSharingReport(false));
    });
  };

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
        best_lap_s: runBestLap(r),
        avg_lap_s: runAvgLap(r),
        symptoms: r.feedback.tags.map((t) => t.symptom),
        outcome: r.outcome,
      }));
      // forecast from the latest selected run's track GPS, at race start
      let forecast;
      const track = latest.track_id ? getTrack(tracks, latest.track_id) : undefined;
      if (track?.gps) {
        forecast = (await fetchWeather(track.gps.lat, track.gps.lon, startIso)) ?? undefined;
      }

      // ★ UNLOCK (Phase 2B): now that runs are schema RunEntry, compose the
      // deferred engine william inputs — practice learning tuples from rated
      // runs (outcomes store not wired in-app yet, so [] for advised changes —
      // see deferred note), a one-element forecast WeatherObservation built from
      // the theo forecast, and the latest run's frozen TrackSnapshot.
      const william = buildWilliamInputs(runs, latest, startIso, forecast);

      const plan = buildRacePlan(
        bundle,
        summaries,
        { start_iso: startIso, length_s: lengthMin * 60, type },
        forecast,
        KB,
        william,
      );
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

  /** Strategy prefill from the context runs + track: pace from their best
   *  average, lap series for cliff detection, autonomy from the best logged
   *  autonomy test on that track (greyed autofill, tap to override). */
  const buildStrategyPrefill = (
    runs: RunEntry[],
    track?: TrackChoice,
    extra?: { race_length_s?: number; race_type?: "sprint" | "endurance"; avg_lap_s?: number },
  ): StrategyPrefill => {
    const sorted = [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const latest: RunEntry | undefined = sorted[sorted.length - 1];
    let lapTimes: number[] | undefined;
    for (const r of sorted) {
      const l = runLapsList(r);
      if (l !== undefined && l.length > (lapTimes?.length ?? 0)) lapTimes = [...l];
    }
    const avgs = sorted.map((r) => runAvgLap(r)).filter((v): v is number => v !== undefined);
    const trackId = track?.track_id ?? latest?.track_id;
    const trackName = track?.label ?? latest?.track.name;
    let autonomy: StrategyPrefill["autonomy"];
    if (trackId !== undefined || trackName !== undefined) {
      const best = bestAutonomy(logbook.runs, { track_id: trackId, track_name: trackName, grip: latest?.conditions.grip });
      if (best) {
        const src = logbook.runs.find((r) => r.id === best.from_run_id);
        autonomy = { time_s: best.time_s, date: src?.created_at.slice(0, 10) ?? "" };
      }
    }
    // F1 — consumption history (cc-per-lap mean/std) from the context runs' fuel
    // logs; undefined when none carry both fuel + laps.
    const consumption = deriveConsumption(sorted);
    // F3 — field size + position from the latest context run, when logged.
    const entrants = latest !== undefined ? runEntrants(latest) : undefined;
    const current_position = latest !== undefined ? runPosition(latest) : undefined;
    return {
      race_length_s: extra?.race_length_s,
      race_type: extra?.race_type,
      avg_lap_s: extra?.avg_lap_s ?? (avgs.length > 0 ? Math.min(...avgs) : undefined),
      lap_times: lapTimes,
      autonomy,
      ...(consumption !== undefined ? { consumption } : {}),
      ...(entrants !== undefined ? { entrants } : {}),
      ...(current_position !== undefined ? { current_position } : {}),
    };
  };

  /** "Race strategy" from a race-plan report arrives prefilled: race window,
   *  type, race pace — plus the autonomy/lap context of the plan's runs. */
  const openStrategyFromPlan = (s: SavedReport) => {
    const runs = logbook.runs.filter((r) => s.run_ids.includes(r.id));
    setView({
      k: "strategy_form",
      prefill: buildStrategyPrefill(runs, undefined, { ...parseRaceWindow(s.run_label), avg_lap_s: s.plan?.race_avg_lap_s }),
      runIds: s.run_ids,
      from: s,
    });
  };

  if (busy) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.busyText}>{t({ en: "Engineer is reading your log…", fr: "L'ingénieur lit ton carnet…" })}</Text>
      </View>
    );
  }

  if (view.k === "new_report") {
    return (
      <View style={styles.root}>
        <Header title={t({ en: "New report — pick the run to analyse", fr: "Nouveau rapport — choisis la session à analyser" })} onBack={() => setView({ k: "list" })} />
        <RunPicker
          logbook={logbook}
          multi={false}
          askNotes
          cta={t({ en: "Generate report", fr: "Générer le rapport" })}
          onDone={(runs, { notes }) => void generateReport(runs[0], notes)}
        />
      </View>
    );
  }

  if (view.k === "plan_form") {
    return (
      <View style={styles.root}>
        <Header title={t({ en: "Race planner — track, then training runs", fr: "Préparateur de course — piste, puis sessions d'entraînement" })} onBack={() => setView({ k: "list" })} />
        <RunPicker
          logbook={logbook}
          multi
          trackFirst
          askRace
          cta={t({ en: "Build race plan", fr: "Construire le plan de course" })}
          onDone={(runs, { race }) => void generatePlan(runs, race!.startIso, race!.lengthMin, race!.type)}
        />
      </View>
    );
  }

  if (view.k === "strategy_pick") {
    return (
      <View style={styles.root}>
        <Header title={t({ en: "Pit strategy — track, then practice runs", fr: "Stratégie d'arrêts — piste, puis sessions d'essais" })} onBack={() => setView({ k: "list" })} />
        <RunPicker
          logbook={logbook}
          multi
          trackFirst
          allowEmpty
          cta={t({ en: "Set up the strategy", fr: "Configurer la stratégie" })}
          onSkip={() => setView({ k: "strategy_form", prefill: {}, runIds: [] })}
          onDone={(runs, { track }) =>
            setView({ k: "strategy_form", prefill: buildStrategyPrefill(runs, track), runIds: runs.map((r) => r.id) })
          }
        />
      </View>
    );
  }

  if (view.k === "strategy_form") {
    const backTo = () => setView(view.from ? { k: "view", saved: view.from } : { k: "list" });
    return (
      <View style={styles.root}>
        <Header title={t({ en: "Race strategy", fr: "Stratégie de course" })} onBack={backTo} />
        <StrategyForm
          prefill={view.prefill}
          onCancel={backTo}
          onResult={(plan, options, inputs) => {
            addReport({
              kind: "strategy",
              run_ids: view.runIds,
              run_label: t({
                en: `strategy · ${plan.stops === 0 ? "no stops" : `box ${plan.stops}× · every ${fmtTime(plan.stint_max_s)}`}`,
                fr: `stratégie · ${plan.stops === 0 ? "aucun arrêt" : `arrêt ${plan.stops}× · toutes les ${fmtTime(plan.stint_max_s)}`}`,
              }),
              strategy: plan,
            });
            setView({ k: "strategy_view", plan, options, inputs });
          }}
        />
      </View>
    );
  }

  if (view.k === "strategy_view") {
    return (
      <View style={styles.root}>
        <Header title={t({ en: "Pit strategy", fr: "Stratégie d'arrêts" })} onBack={() => setView({ k: "list" })} />
        <PitPlanView plan={view.plan} options={view.options} inputs={view.inputs} />
      </View>
    );
  }

  if (view.k === "view") {
    const s = view.saved;
    return (
      <View style={styles.root}>
        <Header title={s.kind === "race_plan" ? t({ en: "Race plan", fr: "Plan de course" }) : t({ en: "Engineer report", fr: "Rapport d'ingénieur" })} onBack={() => setView({ k: "list" })} />
        {s.kind === "race_plan" && s.plan ? (
          <RacePlanView plan={s.plan} onStrategy={() => openStrategyFromPlan(s)} />
        ) : s.report ? (
          <View style={{ flex: 1 }}>
            {s.report.kind !== "report" && (
              <View style={styles.askMore}>
                <Text style={styles.askMoreText}>
                  {t({
                    en: "The engineer couldn't ground a recommendation on this run. Add more detail to its feedback — symptoms, where on track, when it happens — then generate again.",
                    fr: "L'ingénieur n'a pas pu fonder de recommandation sur cette session. Ajoute du détail à ton ressenti — symptômes, où sur la piste, quand ça arrive — puis regénère.",
                  })}
                </Text>
              </View>
            )}
            <RunReportCard report={s.report} />
            {s.report.kind === "report" && (
              <View style={styles.shareBar}>
                <Pressable
                  style={styles.shareBtn}
                  onPress={shareReport}
                  disabled={sharingReport}
                  accessibilityRole="button"
                  accessibilityLabel={t({ en: "Share report", fr: "Partager le rapport" })}
                >
                  <Text style={styles.shareBtnText}>{sharingReport ? t({ en: "Rendering…", fr: "Génération…" }) : t({ en: "⤴ Share report", fr: "⤴ Partager le rapport" })}</Text>
                </Pressable>
              </View>
            )}
            {/* off-screen poster for toDataURL capture */}
            <View style={styles.offscreen} pointerEvents="none">
              <ReportCard ref={reportCardRef} report={s.report} subtitle={s.run_label} />
            </View>
          </View>
        ) : s.strategy ? (
          <PitPlanView plan={s.strategy} options={[]} />
        ) : null}
      </View>
    );
  }

  // ——— list: the 3 tools ARE the section; history comes after ———
  const ordered = [...reports].reverse();
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.h1}>{t({ en: "Engineer", fr: "Ingénieur" })}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
        <FeatureCard
          icon="🔧"
          title={t({ en: "Setup engineer", fr: "Ingénieur réglages" })}
          desc={t({
            en: "Pick a run — I read the setup, conditions, tyres and your feedback, then propose up to 3 grounded changes.",
            fr: "Choisis une session — je lis le réglage, les conditions, les pneus et ton ressenti, puis je propose jusqu'à 3 changements fondés.",
          })}
          onPress={() => setView({ k: "new_report" })}
        />
        <FeatureCard
          icon="🏆"
          title={t({ en: "Race planner", fr: "Préparateur de course" })}
          desc={t({
            en: "Pick your race track, compound your training runs there with the race-day forecast into a final-hours plan.",
            fr: "Choisis ta piste de course, combine tes sessions d'entraînement avec les prévisions du jour de course en un plan des dernières heures.",
          })}
          onPress={() => setView({ k: "plan_form" })}
        />
        <FeatureCard
          icon="⛽"
          title={t({ en: "Pit strategy", fr: "Stratégie d'arrêts" })}
          desc={t({
            en: "When to box and why — your logged autonomy tests and lap times prefill the numbers.",
            fr: "Quand t'arrêter et pourquoi — tes essais d'autonomie enregistrés et tes temps au tour préremplissent les chiffres.",
          })}
          onPress={() =>
            setView(logbook.runs.length > 0 ? { k: "strategy_pick" } : { k: "strategy_form", prefill: {}, runIds: [] })
          }
        />

        <Text style={styles.sectionTitle}>{t({ en: "Past reports", fr: "Rapports précédents" })}</Text>
        {ordered.length === 0 ? (
          <Text style={styles.emptyText}>
            {t({
              en: "Nothing yet. Every report, race plan and strategy you generate lands here — ask, test, come back with more data. That loop is the whole job.",
              fr: "Rien pour l'instant. Chaque rapport, plan de course et stratégie que tu génères atterrit ici — demande, teste, reviens avec plus de données. Cette boucle, c'est tout le métier.",
            })}
          </Text>
        ) : (
          ordered.map((r) => (
            <Pressable key={r.id} style={styles.card} onPress={() => setView({ k: "view", saved: r })}>
              <Text style={styles.cardKind}>
                {r.kind === "race_plan"
                  ? t({ en: "🏆 RACE PLAN", fr: "🏆 PLAN DE COURSE" })
                  : r.kind === "strategy"
                    ? t({ en: "⛽ STRATEGY", fr: "⛽ STRATÉGIE" })
                    : t({ en: "🔧 REPORT", fr: "🔧 RAPPORT" })}
              </Text>
              <Text style={styles.cardLabel}>{r.run_label}</Text>
              <Text style={styles.cardMeta}>
                {r.created_at.slice(5, 16).replace("T", " ")}
                {r.report ? ` · ${r.report.kind === "report" ? t({ en: `confidence ${r.report.confidence}`, fr: `confiance ${r.report.confidence}` }) : r.report.kind}` : ""}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
  onPress,
}: {
  icon: string;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.featureCard} onPress={onPress}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
      <Text style={styles.featureChev}>›</Text>
    </Pressable>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useT();
  return (
    <View style={styles.headerBar}>
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={styles.back}>{t({ en: "‹ back", fr: "‹ retour" })}</Text>
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
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 10,
  },
  featureIcon: { fontSize: 26 },
  featureTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  featureDesc: { color: colors.sub, fontSize: 12, lineHeight: 17, marginTop: 3 },
  featureChev: { color: colors.accent, fontSize: 24, fontWeight: "700" },
  sectionTitle: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 8,
  },
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
  shareBar: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  shareBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  shareBtnText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },
  offscreen: { position: "absolute", left: -10000, top: 0, width: 1080, height: 1350 },
});
