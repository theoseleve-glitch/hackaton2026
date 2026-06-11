import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { addCar } from "../../../../packages/garage/src";
import type { CarEntity, GarageState } from "../../../../packages/garage/src";
import {
  addRun,
  groupBySetup,
  lastRun,
  rateRun,
  sortRuns,
} from "../../../../packages/logbook/src";
import type { LogbookState, Outcome, RunEntry, RunSortKey } from "../../../../packages/logbook/src";
import { deserialize, initSheets, renameDraft, saveVersion, serialize } from "../../../../packages/sheets/src";
import { addTrack, getTrack, upsertRecord } from "../../../../packages/tracks/src";
import type { TrackEntity, TracksState } from "../../../../packages/tracks/src";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NewCarForm } from "../components/NewCarForm";
import { PodiumSplash } from "../components/PodiumSplash";
import { RunFormV2 } from "../components/RunFormV2";
import { TrackForm } from "../components/TrackForm";
import { sheetsKeyForCar } from "../garagestore";
import { KB } from "../kb";
import { loadCarSheets } from "../store";
import { colors, radius } from "../theme";
import { fetchWeather } from "../weather";

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
  /** jump to the Engineer tab and generate a report for this run */
  onEngineer: (runId: string) => void;
  /** open the comparison for two selected runs */
  onCompare: (aId: string, bId: string) => void;
}

type Popup = null | "car" | "track" | "setup";

export function RunsScreen(props: Props) {
  const { logbook, updateLogbook, garage, updateGarage, tracks, updateTracks } = props;
  const [inForm, setInForm] = useState(props.startInForm ?? false);
  const [popup, setPopup] = useState<Popup>(null);
  const [sortKey, setSortKey] = useState<RunSortKey | "setup">("date");
  const [selected, setSelected] = useState<string[]>([]);
  const [podium, setPodium] = useState<number | null>(null);

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

  const saveRun = (run: Omit<RunEntry, "id">) => {
    updateLogbook((prev) => addRun(prev, run, run.created_at).state);
    // auto-maintain the track's lap records (D25)
    const car = garage.cars.find((c) => c.id === run.car_id);
    if (run.track_id && run.result?.best_lap_s !== undefined && car) {
      const category = `${car.scale} ${car.power} ${car.category}`.replace(/_/g, " ");
      updateTracks((prev) =>
        upsertRecord(prev, run.track_id!, {
          category,
          conditions: run.conditions.grip,
          lap_s: run.result!.best_lap_s!,
          holder: "me",
          date: run.created_at.slice(0, 10),
        }),
      );
    }
    setInForm(false);
    // bragging rights: competitive top-3 gets its moment (item from Théo's test pass)
    const p = run.result?.position;
    if (run.type !== "practice" && p !== undefined && p >= 1 && p <= 3) {
      setPodium(p);
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
          onRequestNewCar={() => setPopup("car")}
          onRequestNewTrack={() => setPopup("track")}
          onRequestNewSetup={() => setPopup("setup")}
          fetchWeather={(track: TrackEntity, whenIso: string) =>
            track.gps ? fetchWeather(track.gps.lat, track.gps.lon, whenIso) : Promise.resolve(null)
          }
          onSave={saveRun}
          onCancel={() => setInForm(false)}
        />

        <Modal visible={popup === "car"} animationType="slide" onRequestClose={() => setPopup(null)}>
          <NewCarForm
            onCancel={() => setPopup(null)}
            onSave={(car) => {
              updateGarage((prev) => {
                const { state, car: created } = addCar(prev, { ...car, created_at: new Date().toISOString() } as Omit<CarEntity, "id">, new Date().toISOString());
                setSel((p) => ({ ...p, car_id: created.id, setup_version_id: undefined }));
                return state;
              });
              setPopup(null);
            }}
          />
        </Modal>
        <Modal visible={popup === "track"} animationType="slide" onRequestClose={() => setPopup(null)}>
          <TrackForm
            onCancel={() => setPopup(null)}
            onSave={(track) => {
              updateTracks((prev) => {
                const { state, track: created } = addTrack(prev, track as Omit<TrackEntity, "id">, new Date().toISOString());
                setSel((p) => ({ ...p, track_id: created.id }));
                return state;
              });
              setPopup(null);
            }}
          />
        </Modal>
        <Modal visible={popup === "setup"} animationType="slide" transparent onRequestClose={() => setPopup(null)}>
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
        </Modal>
      </View>
    );
  }

  // ——— recap mode ———
  const sorted: RunEntry[] =
    sortKey === "setup"
      ? groupBySetup(logbook.runs).flatMap((g) => g.runs)
      : sortRuns(logbook.runs, sortKey);
  const groups = sortKey === "setup" ? groupBySetup(logbook.runs) : null;

  const toggleSelect = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-1), id],
    );
  const selectedRuns = selected
    .map((id) => logbook.runs.find((r) => r.id === id))
    .filter(Boolean) as RunEntry[];

  return (
    <View style={styles.root}>
      {podium !== null && <PodiumSplash position={podium} onDone={() => setPodium(null)} />}
      <View style={styles.header}>
        <Text style={styles.title}>
          Run log <Text style={styles.count}>· {logbook.runs.length}</Text>
        </Text>
        <Pressable style={styles.logBtn} onPress={() => setInForm(true)}>
          <Text style={styles.logBtnText}>+ Log run</Text>
        </Pressable>
      </View>

      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.sortChip, sortKey === s.key && styles.sortChipOn]}
            onPress={() => setSortKey(s.key)}
          >
            <Text style={[styles.sortText, sortKey === s.key && styles.sortTextOn]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {logbook.runs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No runs yet</Text>
          <Text style={styles.emptyText}>
            Log your first run — car, track, conditions, how it felt. Every run makes the engineer
            smarter about YOUR car on YOUR tracks.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 90 }}>
          {groups
            ? groups.map((g) => (
                <View key={g.setup_version_id}>
                  <Text style={styles.groupHeader}>⚙ {g.setup_name}</Text>
                  {g.runs.map((run) => (
                    <SlimRunCard key={run.id} run={run} selected={selected.includes(run.id)} onPress={() => toggleSelect(run.id)} />
                  ))}
                </View>
              ))
            : sorted.map((run) => (
                <SlimRunCard key={run.id} run={run} selected={selected.includes(run.id)} onPress={() => toggleSelect(run.id)} />
              ))}
        </ScrollView>
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
                    <Text style={[styles.rateText, selectedRuns[0].outcome === o && styles.rateTextOn]}>{o}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.floatBtn} onPress={() => props.onEngineer(selectedRuns[0].id)}>
                <Text style={styles.floatBtnText}>🔧 Engineer</Text>
              </Pressable>
            </>
          )}
          {selectedRuns.length === 2 && (
            <Pressable
              style={[styles.floatBtn, { flex: 1 }]}
              onPress={() => props.onCompare(selectedRuns[0].id, selectedRuns[1].id)}
            >
              <Text style={styles.floatBtnText}>⚖ Compare these two runs</Text>
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
function SlimRunCard({ run, selected, onPress }: { run: RunEntry; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.slim, selected && styles.slimSelected]} onPress={onPress}>
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
          {run.result?.best_lap_s !== undefined ? `${run.result.best_lap_s.toFixed(2)}s` : "—"}
        </Text>
        <View style={styles.slimMeta}>
          {run.feeling !== undefined && <View style={[styles.dot, { backgroundColor: feelingColor(run.feeling) }]} />}
          {run.outcome && (
            <Text style={styles.outcomeIcon}>
              {run.outcome === "better" ? "↑" : run.outcome === "worse" ? "↓" : "="}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

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
        setError("Could not read this car's sheets.");
        return;
      }
      base = parsed.state;
    } else {
      // car never opened in the Sheet tab: start it from its kit baseline here
      const template = KB.templates[templateId ?? ""] ?? KB.templates["generic-offroad"];
      base = initSheets(template, new Date().toISOString());
    }
    const renamed = renameDraft(base, name.trim() || "New setup");
    const { state, saved } = saveVersion(renamed, new Date().toISOString());
    const versionId = saved?.id ?? state.draft_base_id;
    await AsyncStorage.setItem(key, serialize(state)).catch(() => {});
    onCreated(versionId, saved?.name ?? (name.trim() || "New setup"));
  };

  return (
    <View style={styles.popupWrap}>
      <View style={styles.popup}>
        <Text style={styles.popupTitle}>New setup</Text>
        <Text style={styles.popupHint}>
          Snapshots the car's current draft sheet as a named version (edit details in the Sheet tab).
        </Text>
        <View style={styles.popupInputRow}>
          <Pressable style={{ flex: 1 }}>
            <TextInputBox value={name} onChangeText={setName} placeholder='e.g. "Sunday quali"' />
          </Pressable>
        </View>
        {error && <Text style={styles.popupError}>{error}</Text>}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Pressable style={[styles.popupBtn, styles.popupGhost]} onPress={onClose}>
            <Text style={styles.popupGhostText}>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.popupBtn, styles.popupPrimary]} onPress={() => void create()}>
            <Text style={styles.popupPrimaryText}>Create</Text>
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
  logBtn: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  logBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
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
  floatBtnText: { color: "#fff", fontWeight: "800", fontSize: 13, textAlign: "center" },
  floatClose: { marginLeft: "auto", padding: 6 },
  floatCloseText: { color: colors.sub, fontSize: 14 },
  popupWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
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
  popupPrimaryText: { color: "#fff", fontWeight: "800" },
  popupGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  popupGhostText: { color: colors.text, fontWeight: "600" },
});
