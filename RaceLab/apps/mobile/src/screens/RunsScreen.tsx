import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { addCar, carLabels, powerLabel } from "../../../../packages/garage/src";
import type { Car, GarageState } from "../../../../packages/garage/src";
import {
  addRun,
  checkRecords,
  groupBySetup,
  lastRun,
  rateRun,
  runBestLap,
  runEntrants,
  runFeeling,
  runPosition,
  sortRuns,
} from "../../../../packages/logbook/src";
import type { LogbookState, Outcome, RunEntry, RunSortKey } from "../../../../packages/logbook/src";
import { deserialize, initSheets, renameDraft, saveVersion, serialize } from "../../../../packages/sheets/src";
import { addTrack, getTrack, upsertRecord } from "../../../../packages/tracks/src";
import type { Track, TrackRecord, TracksState } from "../../../../packages/tracks/src";
import { buildSetupPayload } from "../../../../packages/social/src";
import type { SharedPayload } from "../../../../packages/social/src";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NewCarForm } from "../components/NewCarForm";
import { Overlay } from "../components/Overlay";
import { PodiumSplash } from "../components/PodiumSplash";
import type { Celebration } from "../components/PodiumSplash";
import { RunFormV2 } from "../components/RunFormV2";
import { TrackForm } from "../components/TrackForm";
import { sheetsKeyForCar } from "../garagestore";
import { KB } from "../kb";
import { loadCarSheets } from "../store";
import { colors, radius } from "../theme";
import { fetchWeather } from "../weather";
import { useT } from "../i18n";
import { useGate } from "../entitlements";
import { usePaywall } from "../components/Paywall";

/**
 * Run log v2 (D27): slim sortable recap; selection drives a floating action
 * bar (rate / engineer / compare) instead of per-card buttons; logging goes
 * through RunFormV2 with car/track/setup selectors + popup creation forms.
 */

const SORTS: { key: RunSortKey | "setup"; label: string }[] = [
  { key: "date", label: "date" },
  { key: "best_lap", label: "best" },
  { key: "avg_lap", label: "avg" },
  { key: "feeling", label: "feeling" },
  { key: "setup", label: "by setup" },
];

interface Props {
  logbook: LogbookState;
  updateLogbook: (fn: (prev: LogbookState) => LogbookState) => void;
  garage: GarageState;
  updateGarage: (fn: (prev: GarageState) => GarageState) => void;
  tracks: TracksState;
  updateTracks: (fn: (prev: TracksState) => TracksState) => void;
  startInForm?: boolean;
  /** Speedhive import: open the form with the detected session's numbers */
  speedhivePrefill?: { created_at?: string; best_lap_s?: number; avg_lap_s?: number; laps_list?: number[] };
  /** jump to the Engineer tab and generate a report for this run */
  onEngineer: (runId: string) => void;
  /** open the comparison for two selected runs */
  onCompare: (aId: string, bId: string) => void;
  /** share a run (setup + conditions + result) as a card/link.
   *  HIDDEN FOR LAUNCH — App.tsx no longer passes this, so the ⤴ Share button
   *  below never renders; kept optional so the code stays on disk. */
  onShareRun?: (p: SharedPayload) => void;
}

type Popup = null | "car" | "track" | "setup";

export function RunsScreen(props: Props) {
  const t = useT();
  const { logbook, updateLogbook, garage, updateGarage, tracks, updateTracks } = props;
  const [inForm, setInForm] = useState(props.startInForm ?? false);
  const [popup, setPopup] = useState<Popup>(null);
  const [sortKey, setSortKey] = useState<RunSortKey | "setup">("date");
  const [selected, setSelected] = useState<string[]>([]);
  // multi_car gate (first car FREE, D18 #3): adding a NEW car from inside the
  // run form is gated only once a car already exists.
  const gateMultiCar = useGate("multi_car");
  const paywall = usePaywall();
  const requestNewCar = () => {
    if (garage.cars.length >= 1) {
      void gateMultiCar(() => setPopup("car"), paywall.open);
    } else {
      setPopup("car");
    }
  };
  // a saved run can earn a moment: podium position, or a new personal/track best
  const [celebration, setCelebration] = useState<{ position?: number; record?: Celebration } | null>(null);

  // — selection for the form (parent-owned, popup creations update it)
  const last = lastRun(logbook);
  const [sel, setSel] = useState<{ car_id?: string; track_id?: string; setup_version_id?: string }>({
    car_id: last?.car_id ?? garage.cars[0]?.id,
    track_id: last?.track_id ?? tracks.tracks[0]?.id,
  });

  // setups of the currently selected car (loaded async, cached here)
  const [carSetups, setCarSetups] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sel.car_id) {
        setCarSetups([]);
        return;
      }
      const sheets = await loadCarSheets(sel.car_id);
      if (cancelled) return;
      const list = sheets
        ? [...sheets.versions].reverse().map((v) => ({ id: v.id, name: v.name }))
        : [];
      setCarSetups(list);
      setSel((p) => ({ ...p, setup_version_id: p.setup_version_id ?? list[0]?.id }));
    })();
    return () => {
      cancelled = true;
    };
  }, [sel.car_id, inForm]);

  const saveRun = (run: RunEntry) => {
    // persist against the authoritative previous state (never-lose discipline)
    updateLogbook((prev) => addRun(prev, run).state);
    // auto-maintain the track's lap records (D25)
    const car = garage.cars.find((c) => c.id === run.car_id);
    const best = runBestLap(run);
    if (run.track_id && best !== undefined && car) {
      const labels = carLabels(car);
      const category = `${labels.scale} ${powerLabel(car)} ${labels.category}`.replace(/_/g, " ");
      const record: TrackRecord = {
        class: category,
        best_lap_s: best,
        conditions: run.conditions.grip,
        holder: "me",
        date: run.created_at.slice(0, 10),
        source: "manual",
      };
      updateTracks((prev) => upsertRecord(prev, run.track_id, record));
    }
    setInForm(false);

    // celebration decision (display-only): replay the add on the current log to
    // see which records this run set, then pick the single best moment to show.
    const preview = addRun(logbook, run);
    const rec = checkRecords(preview.state, preview.run);
    const lap = best;
    const p = runPosition(run);
    if (run.type !== "practice" && p !== undefined && p >= 1 && p <= 3) {
      setCelebration({ position: p }); // a podium outranks a lap record
    } else if (rec.careerBestLap && lap !== undefined) {
      setCelebration({
        record: {
          icon: "⏱",
          line: t({ en: "PERSONAL BEST", fr: "RECORD PERSO" }),
          tone: colors.gold,
          sub: t({ en: `${lap.toFixed(2)}s — your fastest lap yet`, fr: `${lap.toFixed(2)}s — ton tour le plus rapide à ce jour` }),
        },
      });
    } else if (rec.trackBestLap && lap !== undefined) {
      setCelebration({
        record: {
          icon: "📍",
          line: t({ en: "TRACK BEST", fr: "RECORD PISTE" }),
          tone: colors.good,
          sub: t({ en: `${lap.toFixed(2)}s at ${run.track.name}`, fr: `${lap.toFixed(2)}s à ${run.track.name}` }),
        },
      });
    } else if (rec.firstWin) {
      setCelebration({
        record: {
          icon: "🥇",
          line: t({ en: "FIRST WIN", fr: "PREMIÈRE VICTOIRE" }),
          tone: colors.gold,
          sub: t({ en: "the first of many", fr: "la première d'une longue série" }),
        },
      });
    } else if (rec.firstPodium) {
      setCelebration({
        record: {
          icon: "🏆",
          line: t({ en: "FIRST PODIUM", fr: "PREMIER PODIUM" }),
          tone: colors.gold,
          sub: t({ en: "on the box", fr: "sur la boîte" }),
        },
      });
    }
  };

  // ——— form mode ———
  if (inForm) {
    return (
      <View style={styles.root}>
        <RunFormV2
          cars={garage.cars}
          tracks={tracks.tracks}
          setupsForCar={(carId) => (carId === sel.car_id ? carSetups : [])}
          selection={sel}
          onSelectCar={(id) => setSel((p) => ({ ...p, car_id: id, setup_version_id: undefined }))}
          onSelectTrack={(id) => setSel((p) => ({ ...p, track_id: id }))}
          onSelectSetup={(id) => setSel((p) => ({ ...p, setup_version_id: id }))}
          onRequestNewCar={requestNewCar}
          onRequestNewTrack={() => setPopup("track")}
          onRequestNewSetup={() => setPopup("setup")}
          fetchWeather={(track: Track, whenIso: string) =>
            track.gps ? fetchWeather(track.gps.lat, track.gps.lon, whenIso) : Promise.resolve(null)
          }
          initial={props.speedhivePrefill}
          onSave={saveRun}
          onCancel={() => setInForm(false)}
        />

        <Overlay visible={popup === "car"}>
          <NewCarForm
            onCancel={() => setPopup(null)}
            onSave={(car) => {
              updateGarage((prev) => {
                const { state, car: created } = addCar(prev, car);
                setSel((p) => ({ ...p, car_id: created.id, setup_version_id: undefined }));
                return state;
              });
              setPopup(null);
            }}
          />
        </Overlay>
        <Overlay visible={popup === "track"}>
          <TrackForm
            onCancel={() => setPopup(null)}
            onSave={(track) => {
              updateTracks((prev) => {
                const { state, track: created } = addTrack(prev, track);
                setSel((p) => ({ ...p, track_id: created.id }));
                return state;
              });
              setPopup(null);
            }}
          />
        </Overlay>
        <Overlay visible={popup === "setup"} dim>
          <NewSetupPopup
            carId={sel.car_id}
            templateId={garage.cars.find((c) => c.id === sel.car_id)?.template_id}
            onClose={() => setPopup(null)}
            onCreated={(versionId, name) => {
              setCarSetups((prev) => [{ id: versionId, name }, ...prev]);
              setSel((p) => ({ ...p, setup_version_id: versionId }));
              setPopup(null);
            }}
          />
        </Overlay>
      </View>
    );
  }

  // ——— recap mode ———
  const groups = useMemo(
    () => (sortKey === "setup" ? groupBySetup(logbook.runs) : null),
    [sortKey, logbook.runs],
  );
  const sorted: RunEntry[] = useMemo(
    () => (groups ? groups.flatMap((g) => g.runs) : sortRuns(logbook.runs, sortKey as RunSortKey)),
    [groups, logbook.runs, sortKey],
  );

  const toggleSelect = useCallback(
    (id: string) =>
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-1), id],
      ),
    [],
  );
  const selectedRuns = selected
    .map((id) => logbook.runs.find((r) => r.id === id))
    .filter(Boolean) as RunEntry[];

  // share a run: pull its setup values from the car's sheets, add the run's
  // context (track / conditions / result), open the share sheet
  const shareRun = async (run: RunEntry) => {
    if (!props.onShareRun) return;
    const car = garage.cars.find((c) => c.id === run.car_id);
    let values: Record<string, string | number> = {};
    if (run.car_id) {
      const sheets = await loadCarSheets(run.car_id);
      values = sheets?.versions.find((v) => v.id === run.setup_version_id)?.values ?? sheets?.draft ?? {};
    }
    const labels = car ? carLabels(car) : undefined;
    props.onShareRun(
      buildSetupPayload(
        {
          setup: { name: run.setup_name || t({ en: "Race setup", fr: "Réglage course" }), template_id: run.car_template_id, values },
          car: {
            brand: labels?.brand || "RC",
            model: labels?.model || run.track.name,
            category: labels?.category || "buggy",
            scale: labels?.scale || "1/8",
            power: car ? powerLabel(car) : "nitro",
          },
          context: {
            track_name: run.track.name,
            surface: run.track.surface,
            grip: run.conditions.grip,
            date: run.created_at.slice(0, 10),
            weather: {
              air_temp_c: run.conditions.air_temp_c,
              humidity_pct: run.conditions.humidity_pct,
              wind_kmh: run.weather?.wind_speed_kmh,
            },
            result: { position: runPosition(run), entrants: runEntrants(run), best_lap_s: runBestLap(run) },
          },
        },
        new Date().toISOString(),
      ),
    );
  };

  return (
    <View style={styles.root}>
      {celebration !== null && (
        <PodiumSplash position={celebration.position} record={celebration.record} onDone={() => setCelebration(null)} />
      )}
      <View style={styles.header}>
        <Text style={styles.title}>
          {t({ en: "Run log", fr: "Journal de sessions" })} <Text style={styles.count}>· {logbook.runs.length}</Text>
        </Text>
        <Pressable
          style={styles.logBtn}
          onPress={() => setInForm(true)}
          accessibilityRole="button"
          accessibilityLabel={t({ en: "Log run", fr: "Enregistrer une session" })}
        >
          <Text style={styles.logBtnText}>{t({ en: "+ Log run", fr: "+ Enregistrer" })}</Text>
        </Pressable>
      </View>

      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.sortChip, sortKey === s.key && styles.sortChipOn]}
            onPress={() => setSortKey(s.key)}
          >
            <Text style={[styles.sortText, sortKey === s.key && styles.sortTextOn]}>
              {s.key === "date"
                ? t({ en: "date", fr: "date" })
                : s.key === "best_lap"
                  ? t({ en: "best", fr: "meilleur" })
                  : s.key === "avg_lap"
                    ? t({ en: "avg", fr: "moyen" })
                    : s.key === "feeling"
                      ? t({ en: "feeling", fr: "ressenti" })
                      : t({ en: "by setup", fr: "par réglage" })}
            </Text>
          </Pressable>
        ))}
      </View>

      {logbook.runs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t({ en: "No runs yet", fr: "Aucune session pour l'instant" })}</Text>
          <Text style={styles.emptyText}>
            {t({
              en: "Log your first run — car, track, conditions, how it felt. Every run makes the engineer smarter about YOUR car on YOUR tracks.",
              fr: "Enregistre ta première session — voiture, piste, conditions, ton ressenti. Chaque session rend l'ingénieur plus pertinent sur TA voiture et TES pistes.",
            })}
          </Text>
          <Pressable
            style={styles.emptyCta}
            onPress={() => setInForm(true)}
            accessibilityRole="button"
            accessibilityLabel={t({ en: "Log your first run", fr: "Enregistrer ta première session" })}
          >
            <Text style={styles.emptyCtaText}>{t({ en: "＋ Log your first run", fr: "＋ Enregistrer ta première session" })}</Text>
          </Pressable>
        </View>
      ) : groups ? (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 90 }}>
          {groups.map((g) => (
            <View key={g.setup_version_id}>
              <Text style={styles.groupHeader}>⚙ {g.setup_name}</Text>
              {g.runs.map((run) => (
                <SlimRunCard key={run.id} run={run} selected={selected.includes(run.id)} onPress={toggleSelect} />
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <SlimRunCard run={item} selected={selected.includes(item.id)} onPress={toggleSelect} />
          )}
          contentContainerStyle={{ padding: 14, paddingBottom: 90 }}
        />
      )}

      {selectedRuns.length > 0 && (
        <View style={styles.floatBar}>
          {selectedRuns.length === 1 && (
            <>
              <View style={styles.rateGroup}>
                {(["better", "same", "worse"] as Outcome[]).map((o) => (
                  <Pressable
                    key={o}
                    style={[styles.rate, selectedRuns[0].outcome === o && styles.rateOn]}
                    onPress={() => updateLogbook((prev) => rateRun(prev, selectedRuns[0].id, o))}
                  >
                    <Text style={[styles.rateText, selectedRuns[0].outcome === o && styles.rateTextOn]}>
                      {o === "better"
                        ? t({ en: "better", fr: "mieux" })
                        : o === "worse"
                          ? t({ en: "worse", fr: "moins bien" })
                          : t({ en: "same", fr: "pareil" })}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.floatBtn} onPress={() => props.onEngineer(selectedRuns[0].id)}>
                <Text style={styles.floatBtnText}>{t({ en: "🔧 Engineer", fr: "🔧 Ingénieur" })}</Text>
              </Pressable>
              {props.onShareRun && (
                <Pressable style={styles.floatBtn} onPress={() => void shareRun(selectedRuns[0])}>
                  <Text style={styles.floatBtnText}>{t({ en: "⤴ Share", fr: "⤴ Partager" })}</Text>
                </Pressable>
              )}
            </>
          )}
          {selectedRuns.length === 2 && (
            <Pressable
              style={[styles.floatBtn, { flex: 1 }]}
              onPress={() => props.onCompare(selectedRuns[0].id, selectedRuns[1].id)}
            >
              <Text style={styles.floatBtnText}>{t({ en: "⚖ Compare these two runs", fr: "⚖ Comparer ces deux sessions" })}</Text>
            </Pressable>
          )}
          <Pressable style={styles.floatClose} onPress={() => setSelected([])}>
            <Text style={styles.floatCloseText}>✕</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** One run, one glance: when · where · how fast · how it felt. */
const SlimRunCard = React.memo(function SlimRunCard({
  run,
  selected,
  onPress,
}: {
  run: RunEntry;
  selected: boolean;
  onPress: (id: string) => void;
}) {
  const t = useT();
  return (
    <Pressable
      style={[styles.slim, selected && styles.slimSelected]}
      onPress={() => onPress(run.id)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={t({
        en: `Run at ${run.track.name}, ${run.created_at.slice(5, 10)}`,
        fr: `Session à ${run.track.name}, ${run.created_at.slice(5, 10)}`,
      })}
    >
      <View style={styles.slimLeft}>
        <Text style={styles.slimDate}>{run.created_at.slice(5, 10)}</Text>
        <Text style={styles.slimType}>{run.type.slice(0, 4).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.slimTrack} numberOfLines={1}>
          {run.track.name} · {run.conditions.grip.replace("_", " ")}
        </Text>
        <Text style={styles.slimSetup} numberOfLines={1}>
          ⚙ {run.setup_name}
        </Text>
      </View>
      <View style={styles.slimRight}>
        <Text style={styles.slimLap}>
          {runBestLap(run) !== undefined ? `${runBestLap(run)!.toFixed(2)}s` : "—"}
        </Text>
        <View style={styles.slimMeta}>
          {runFeeling(run) !== undefined && <View style={[styles.dot, { backgroundColor: feelingColor((runFeeling(run) ?? 0) * 10) }]} />}
          {run.outcome && (
            <Text style={styles.outcomeIcon}>
              {run.outcome === "better" ? "↑" : run.outcome === "worse" ? "↓" : "="}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
});

/** red → green → violet, same stops as the FeelingSlider */
function feelingColor(v: number): string {
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const hex = (r: number, g: number, b: number) =>
    `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  if (v <= 50) {
    const t = v / 50;
    return hex(lerp(0xe5, 0x3d, t), lerp(0x48, 0xdc, t), lerp(0x4d, 0x84, t));
  }
  const t = (v - 50) / 50;
  return hex(lerp(0x3d, 0x9d, t), lerp(0xdc, 0x6b, t), lerp(0x84, 0xff, t));
}

/** "New setup" popup: snapshots the car's current draft as a named version. */
function NewSetupPopup({
  carId,
  templateId,
  onClose,
  onCreated,
}: {
  carId?: string;
  templateId?: string;
  onClose: () => void;
  onCreated: (versionId: string, name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!carId) return;
    const key = sheetsKeyForCar(carId);
    const raw = await AsyncStorage.getItem(key);
    let base;
    if (raw) {
      const parsed = deserialize(raw, JSON.parse(raw).state.template_id);
      if (!parsed.ok) {
        setError(t({ en: "Could not read this car's sheets.", fr: "Impossible de lire les fiches de cette voiture." }));
        return;
      }
      base = parsed.state;
    } else {
      // car never opened in the Sheet tab: start it from its kit baseline here
      const template = KB.templates[templateId ?? ""] ?? KB.templates["generic-offroad"];
      base = initSheets(template, new Date().toISOString());
    }
    const fallbackName = t({ en: "New setup", fr: "Nouveau réglage" });
    const renamed = renameDraft(base, name.trim() || fallbackName);
    const { state, saved } = saveVersion(renamed, new Date().toISOString());
    const versionId = saved?.id ?? state.draft_base_id;
    try {
      await AsyncStorage.setItem(key, serialize(state));
    } catch {
      setError(t({ en: "Could not save this setup — storage may be full.", fr: "Impossible d'enregistrer ce réglage — le stockage est peut-être plein." }));
      return;
    }
    onCreated(versionId, saved?.name ?? (name.trim() || fallbackName));
  };

  return (
    <View style={styles.popupWrap}>
      <View style={styles.popup}>
        <Text style={styles.popupTitle}>{t({ en: "New setup", fr: "Nouveau réglage" })}</Text>
        <Text style={styles.popupHint}>
          {t({
            en: "Snapshots the car's current draft sheet as a named version (edit details in the Sheet tab).",
            fr: "Capture la fiche de réglages en cours de la voiture comme version nommée (modifie les détails dans l'onglet Réglages).",
          })}
        </Text>
        <View style={styles.popupInputRow}>
          <Pressable style={{ flex: 1 }}>
            <TextInputBox value={name} onChangeText={setName} placeholder={t({ en: 'e.g. "Sunday quali"', fr: 'ex. "Quali du dimanche"' })} />
          </Pressable>
        </View>
        {error && <Text style={styles.popupError}>{error}</Text>}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Pressable style={[styles.popupBtn, styles.popupGhost]} onPress={onClose}>
            <Text style={styles.popupGhostText}>{t({ en: "Cancel", fr: "Annuler" })}</Text>
          </Pressable>
          <Pressable style={[styles.popupBtn, styles.popupPrimary]} onPress={() => void create()}>
            <Text style={styles.popupPrimaryText}>{t({ en: "Create", fr: "Créer" })}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

import { TextInput } from "react-native";
function TextInputBox(props: { value: string; onChangeText: (t: string) => void; placeholder?: string }) {
  return (
    <TextInput
      style={styles.popupInput}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={colors.sub}
    />
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
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "800" },
  count: { color: colors.sub, fontWeight: "400" },
  logBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14 },
  logBtnText: { color: colors.onAccent, fontWeight: "800", fontSize: 13 },
  sortRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sortChip: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  sortChipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  sortText: { color: colors.sub, fontSize: 11 },
  sortTextOn: { color: colors.accent, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 8 },
  emptyText: { color: colors.sub, fontSize: 13, textAlign: "center", lineHeight: 19 },
  emptyCta: { marginTop: 18, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 11, paddingHorizontal: 20 },
  emptyCtaText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },
  groupHeader: { color: colors.accent, fontSize: 12, fontWeight: "800", marginTop: 10, marginBottom: 6 },
  slim: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  slimSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  slimLeft: { alignItems: "center", width: 44 },
  slimDate: { color: colors.text, fontSize: 12, fontWeight: "700" },
  slimType: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  slimTrack: { color: colors.text, fontSize: 13, fontWeight: "600" },
  slimSetup: { color: colors.sub, fontSize: 11, marginTop: 1 },
  slimRight: { alignItems: "flex-end" },
  slimLap: { color: colors.text, fontSize: 14, fontWeight: "800" },
  slimMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  outcomeIcon: { color: colors.sub, fontSize: 12, fontWeight: "800" },
  floatBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  rateGroup: { flexDirection: "row", gap: 4 },
  rate: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  rateOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  rateText: { color: colors.sub, fontSize: 11 },
  rateTextOn: { color: colors.accent, fontWeight: "700" },
  floatBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  floatBtnText: { color: colors.onAccent, fontWeight: "800", fontSize: 13, textAlign: "center" },
  floatClose: { marginLeft: "auto", padding: 6 },
  floatCloseText: { color: colors.sub, fontSize: 14 },
  popupWrap: { flex: 1, backgroundColor: colors.scrim, alignItems: "center", justifyContent: "center", padding: 24 },
  popup: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16,
    width: "100%",
  },
  popupTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  popupHint: { color: colors.sub, fontSize: 12, marginTop: 4, lineHeight: 17 },
  popupInputRow: { marginTop: 10 },
  popupInput: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  popupError: { color: colors.warn, fontSize: 12, marginTop: 8 },
  popupBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: "center" },
  popupPrimary: { backgroundColor: colors.accent },
  popupPrimaryText: { color: colors.onAccent, fontWeight: "800" },
  popupGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  popupGhostText: { color: colors.text, fontWeight: "600" },
});
