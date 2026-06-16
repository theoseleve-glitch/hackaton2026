import React, { useState } from "react";
// prettier-ignore
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { parseFeedback } from "../../../../packages/engine/src";
import type { FeedbackTag } from "../../../../packages/engine/src";
import type { CarEntity } from "../../../../packages/garage/src";
import { lapStats } from "../../../../packages/logbook/src";
// prettier-ignore
import type { Bumpiness, Grip, RunEntry, RunResult, RunType, Sky, TrackEvolution } from "../../../../packages/logbook/src";
import type { CornerSpec, TrackEntity } from "../../../../packages/tracks/src";
import { KB } from "../kb";
import { colors, radius } from "../theme";
import type { WeatherFill } from "../weather";
import { AutofillInput } from "./AutofillInput";
import { FeelingSlider } from "./FeelingSlider";
import { ChipRow, LabeledInput, MultiChipRow, Section, num } from "./forms";
import { LapListInput } from "./LapListInput";

/**
 * Run Form v2 (D27) — THE core data-capture surface. Controlled selectors:
 * the parent owns car/track/setup selection and the creation popups; this
 * form only renders state and reports intents. Chips over keyboards, weather
 * auto-fill from the track's GPS, free-text feedback parsed by the engine NLU.
 */

const RUN_TYPES: RunType[] = ["practice", "qualifier", "main"];
const GRIPS: Grip[] = ["green", "medium", "high", "blue_groove"];
const BUMPINESS: Bumpiness[] = ["smooth", "medium", "rough"];
const SKIES: Sky[] = ["sunny", "cloudy", "rain_risk", "raining"];
const EVOLUTIONS: TrackEvolution[] = ["improving", "stable", "degrading"];
const SYMPTOMS = KB.taxonomy.symptoms.map((s) => s.id);
const PHASES = KB.taxonomy.phases.map((p) => p.id);

export interface RunFormV2Props {
  cars: CarEntity[];
  tracks: TrackEntity[];
  setupsForCar: (carId: string) => { id: string; name: string }[];
  selection: { car_id?: string; track_id?: string; setup_version_id?: string };
  onSelectCar: (id: string) => void;
  onSelectTrack: (id: string) => void;
  onSelectSetup: (id: string) => void;
  onRequestNewCar: () => void;
  onRequestNewTrack: () => void;
  onRequestNewSetup: () => void;
  fetchWeather: (track: TrackEntity, whenIso: string) => Promise<WeatherFill | null>;
  /** prefill (Speedhive import: a detected session opens the form ready) */
  initial?: { created_at?: string; best_lap_s?: number; avg_lap_s?: number; laps_list?: number[] };
  onSave: (run: Omit<RunEntry, "id">) => void;
  onCancel: () => void;
}

// — weather fields: auto-filled values render greyed + "auto" until tapped —
const WX_FIELDS = [
  { key: "air_temp_c", label: "Air temp (°C)" },
  { key: "humidity_pct", label: "Humidity (%)" },
  { key: "wind_kmh", label: "Wind (km/h)" },
  { key: "pressure_hpa", label: "Pressure (hPa)" },
  { key: "sun_pct", label: "Sun (%)" },
] as const;
type WxKey = (typeof WX_FIELDS)[number]["key"];
type WxField = { text: string; auto: boolean; touched: boolean };
const emptyWx = (): Record<WxKey, WxField> =>
  Object.fromEntries(
    WX_FIELDS.map((f) => [f.key, { text: "", auto: false, touched: false }]),
  ) as Record<WxKey, WxField>;

/** Horizontal selector chips + a trailing "+ new …" chip (parent opens popup). */
function PickRow({ items, selectedId, onSelect, newLabel, onNew }: {
  items: { id: string; label: string }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  newLabel: string;
  onNew: () => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
      {items.map((it) => {
        const active = it.id === selectedId;
        return (
          <Pressable key={it.id} style={[styles.pick, active && styles.pickActive]} onPress={() => onSelect(it.id)}>
            <Text style={[styles.pickText, active && styles.pickTextActive]}>{it.label}</Text>
          </Pressable>
        );
      })}
      <Pressable style={[styles.pick, styles.pickNew]} onPress={onNew}>
        <Text style={styles.pickNewText}>+ {newLabel}</Text>
      </Pressable>
    </ScrollView>
  );
}

/** Greyed auto-filled value until tapped; then a normal editable input. */
function WxFieldView({ label, field, onTouch, onChangeText }: {
  label: string;
  field: WxField;
  onTouch: () => void;
  onChangeText: (t: string) => void;
}) {
  if (field.auto) {
    return (
      <Pressable style={styles.wxAuto} onPress={onTouch}>
        <Text style={styles.wxAutoLabel}>{label}</Text>
        <View style={styles.wxAutoRow}>
          <Text style={styles.wxAutoValue}>{field.text}</Text>
          <Text style={styles.wxAutoTag}>auto</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <LabeledInput label={label} value={field.text} onChangeText={onChangeText} keyboardType="numeric" placeholder="—" />
  );
}

function cornerLabel(c: CornerSpec): string {
  const base = `#${c.n} ${c.direction === "left" ? "L" : "R"}${c.shape ? ` ${c.shape}` : ""}`;
  return c.name ? `${base} « ${c.name} »` : base;
}

/** Short pilot phrases the engine NLU understands — corner-note autofill pool. */
const CORNER_NOTE_LEXICON = [
  "understeer on entry",
  "pushes mid-corner",
  "oversteer on exit",
  "loose on power",
  "rear gives up",
  "washes wide",
  "bottoming out",
  "jumps long",
  "lands nose heavy",
  "kerb unsettles it",
  "traction rolls",
  "twitchy on entry",
  "hooks up here",
];

/** "7:00" or "420" → seconds. */
function parseTimeS(text: string): number | undefined {
  const t = text.trim();
  if (t === "") return undefined;
  const m = t.match(/^(\d+):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function RunFormV2(props: RunFormV2Props) {
  const { cars, tracks, setupsForCar, selection } = props;
  const car = cars.find((c) => c.id === selection.car_id);
  const track = tracks.find((t) => t.id === selection.track_id);
  const setups = selection.car_id ? setupsForCar(selection.car_id) : [];
  const setup = setups.find((s) => s.id === selection.setup_version_id);

  const init = props.initial;
  const initDate = init?.created_at !== undefined ? new Date(init.created_at) : new Date();
  const [type, setType] = useState<RunType>("practice");
  const [position, setPosition] = useState("");
  const [entrants, setEntrants] = useState("");
  // when: editable date + time (default now; Speedhive import sets the session's)
  const [dateStr, setDateStr] = useState(initDate.toISOString().slice(0, 10));
  const [timeStr, setTimeStr] = useState(initDate.toISOString().slice(11, 16));
  const [duration, setDuration] = useState("");
  const [grip, setGrip] = useState<Grip>("medium");
  const [bumpiness, setBumpiness] = useState<Bumpiness | undefined>();
  const [dusty, setDusty] = useState(false);
  const [sky, setSky] = useState<Sky | undefined>();
  const [evolution, setEvolution] = useState<TrackEvolution | undefined>();
  const [wx, setWx] = useState<Record<WxKey, WxField>>(emptyWx);
  const [fetching, setFetching] = useState(false);
  const [wxMiss, setWxMiss] = useState(false);
  const [bestLap, setBestLap] = useState(init?.best_lap_s !== undefined ? String(init.best_lap_s) : "");
  const [avgLap, setAvgLap] = useState(init?.avg_lap_s !== undefined ? String(init.avg_lap_s) : "");
  const [lapsList, setLapsList] = useState<number[]>(init?.laps_list ?? []);
  const [note, setNote] = useState("");
  const [autoTagged, setAutoTagged] = useState(false);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [phase, setPhase] = useState<string | undefined>();
  const [cornerNotes, setCornerNotes] = useState<Record<number, string>>({});
  const [feeling, setFeeling] = useState(50);
  const [feelingSet, setFeelingSet] = useState(false);
  const [showAutonomy, setShowAutonomy] = useState(false);
  const [autoTime, setAutoTime] = useState("");
  const [autoLaps, setAutoLaps] = useState("");

  const toggleSymptom = (s: string) =>
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // Engine NLU reads the note as you type — additive only, never un-selects
  // something the driver tapped (same wiring as v1).
  const onNoteChange = (text: string) => {
    setNote(text);
    const parsed = parseFeedback(text);
    if (parsed.tags.length === 0) return;
    setSymptoms((prev) => {
      const next = [...prev];
      for (const t of parsed.tags) if (!next.includes(t.symptom)) next.push(t.symptom);
      return next.length === prev.length ? prev : next;
    });
    const suggestedPhase = parsed.tags.find((t) => t.phase)?.phase;
    if (suggestedPhase) setPhase((prev) => prev ?? suggestedPhase);
    setAutoTagged(true);
  };

  const doFetchWeather = async () => {
    if (!track || fetching) return;
    setFetching(true);
    setWxMiss(false);
    let fill: WeatherFill | null = null;
    try {
      fill = (await props.fetchWeather(track, new Date().toISOString())) as WeatherFill | null;
    } catch {
      fill = null; // offline / API error → manual entry, never a stuck spinner
    } finally {
      setFetching(false);
    }
    if (!fill) {
      setWxMiss(true);
      return;
    }
    setWx((prev) => {
      const next = { ...prev };
      for (const { key } of WX_FIELDS) {
        const v = (fill as WeatherFill)[key];
        if (v !== undefined && !prev[key].touched) {
          next[key] = { text: String(v), auto: true, touched: false };
        }
      }
      return next;
    });
  };

  const touchWx = (key: WxKey) =>
    setWx((prev) => ({ ...prev, [key]: { ...prev[key], auto: false, touched: true } }));
  const editWx = (key: WxKey, text: string) =>
    setWx((prev) => ({ ...prev, [key]: { text, auto: false, touched: true } }));

  const derived = lapsList.length > 0 ? lapStats(lapsList) : null;
  const dateValid = Number.isFinite(
    new Date(`${dateStr}T${timeStr.length === 5 ? timeStr : "12:00"}:00`).getTime(),
  );

  const canSave = !!(car && track && setup);

  const save = () => {
    if (!car || !track || !setup) return;
    const tags: FeedbackTag[] = symptoms.map((symptom) => (phase ? { symptom, phase } : { symptom }));
    const corner_notes = track.corners
      .map((c) => ({ corner: c.n, note: (cornerNotes[c.n] ?? "").trim() }))
      .filter((c) => c.note.length > 0);
    const autonomyTime = parseTimeS(autoTime);
    const autonomyLaps = num(autoLaps);
    const result: RunResult = {
      best_lap_s: num(bestLap),
      avg_lap_s: num(avgLap),
      laps: lapsList.length > 0 ? lapsList.length : undefined,
      laps_list: lapsList.length > 0 ? lapsList : undefined,
      autonomy_test:
        autonomyTime !== undefined || autonomyLaps !== undefined
          ? { time_s: autonomyTime, laps: autonomyLaps }
          : undefined,
      position: type !== "practice" ? num(position) : undefined,
      entrants: type !== "practice" ? num(entrants) : undefined,
    };
    const hasResult = Object.values(result).some((v) => v !== undefined);
    // the pilot's date+time wins; falls back to "now" if unparseable
    const when = new Date(`${dateStr}T${timeStr.length === 5 ? timeStr : "12:00"}:00`);
    props.onSave({
      created_at: Number.isFinite(when.getTime()) ? when.toISOString() : new Date().toISOString(),
      type,
      car_template_id: car.template_id,
      car_id: car.id,
      setup_version_id: setup.id,
      setup_name: setup.name,
      track_id: track.id,
      track: { name: track.name, surface: track.surface, indoor: track.indoor },
      conditions: {
        grip,
        bumpiness,
        dusty: dusty || undefined,
        sky,
        evolution,
        air_temp_c: num(wx.air_temp_c.text),
        humidity_pct: num(wx.humidity_pct.text),
        wind_kmh: num(wx.wind_kmh.text),
        pressure_hpa: num(wx.pressure_hpa.text),
        sun_pct: num(wx.sun_pct.text),
      },
      result: hasResult ? result : undefined,
      feedback: {
        tags,
        text: note.trim() || undefined,
        corner_notes: corner_notes.length > 0 ? corner_notes : undefined,
      },
      note: note.trim() || undefined,
      feeling: feelingSet ? feeling : undefined,
      duration_min: num(duration),
    });
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Section title="Car">
        <PickRow
          items={cars.map((c) => ({ id: c.id, label: c.name }))}
          selectedId={selection.car_id}
          onSelect={props.onSelectCar}
          newLabel="new car"
          onNew={props.onRequestNewCar}
        />
      </Section>

      <Section title="Track">
        <PickRow
          items={tracks.map((t) => ({ id: t.id, label: t.name }))}
          selectedId={selection.track_id}
          onSelect={props.onSelectTrack}
          newLabel="new track"
          onNew={props.onRequestNewTrack}
        />
      </Section>

      <Section title="Setup on the car">
        {car ? (
          <PickRow
            items={setups.map((s) => ({ id: s.id, label: s.name }))}
            selectedId={selection.setup_version_id}
            onSelect={props.onSelectSetup}
            newLabel="new setup"
            onNew={props.onRequestNewSetup}
          />
        ) : (
          <Text style={styles.hint}>pick a car first</Text>
        )}
      </Section>

      <Section title="When">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 3 }}>
            <LabeledInput
              label="Date"
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="2026-06-12"
              keyboardType="numbers-and-punctuation"
              error={!dateValid ? "use YYYY-MM-DD" : undefined}
            />
          </View>
          <View style={{ flex: 2 }}>
            <LabeledInput
              label="Time"
              value={timeStr}
              onChangeText={setTimeStr}
              placeholder="14:30"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>
      </Section>

      <Section title="Session">
        <ChipRow options={RUN_TYPES} value={type} onSelect={setType} />
        <LabeledInput
          label="Session length (min)"
          value={duration}
          onChangeText={setDuration}
          keyboardType="numeric"
          placeholder="e.g. 10"
        />
        {type !== "practice" && (
          <View style={{ marginTop: 10 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <LabeledInput label="Finished P" value={position} onChangeText={setPosition} keyboardType="numeric" placeholder="e.g. 2" />
              </View>
              <View style={{ flex: 1 }}>
                <LabeledInput label="Field size" value={entrants} onChangeText={setEntrants} keyboardType="numeric" placeholder="e.g. 12" />
              </View>
            </View>
            <Text style={{ color: colors.sub, fontSize: 11, marginTop: 4, fontStyle: "italic" }}>
              your result feeds career stats — podiums get their moment 🏆
            </Text>
          </View>
        )}
      </Section>

      <Section title="Conditions">
        {track?.gps ? (
          <Pressable style={styles.wxBtn} onPress={() => void doFetchWeather()}>
            {fetching ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.wxBtnText}>＋ Add weather</Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.hint}>add GPS to the track for auto-weather</Text>
        )}
        {wxMiss && <Text style={styles.wxMiss}>no weather data — fill in manually</Text>}
        <View style={styles.wxGrid}>
          {WX_FIELDS.map((f) => (
            <View key={f.key} style={styles.wxCell}>
              <WxFieldView
                label={f.label}
                field={wx[f.key]}
                onTouch={() => touchWx(f.key)}
                onChangeText={(t) => editWx(f.key, t)}
              />
            </View>
          ))}
        </View>
        <Text style={styles.hint}>Grip</Text>
        <ChipRow options={GRIPS} value={grip} onSelect={setGrip} />
        <Text style={styles.hint}>Bumpiness</Text>
        <ChipRow options={BUMPINESS} value={bumpiness} onSelect={(b) => setBumpiness(bumpiness === b ? undefined : b)} />
        <Text style={styles.hint}>Sky · dust · evolution</Text>
        <ChipRow options={SKIES} value={sky} onSelect={(s) => setSky(sky === s ? undefined : s)} />
        <View style={{ height: 6 }} />
        <MultiChipRow options={["dusty"] as const} values={dusty ? ["dusty"] : []} onToggle={() => setDusty(!dusty)} />
        <View style={{ height: 6 }} />
        <ChipRow options={EVOLUTIONS} value={evolution} onSelect={(e) => setEvolution(evolution === e ? undefined : e)} />
      </Section>

      <Section title="Laps">
        <LabeledInput label="Best lap (s)" value={bestLap} onChangeText={setBestLap} keyboardType="decimal-pad" placeholder="e.g. 34.2" />
        <LabeledInput label="Average lap (s)" value={avgLap} onChangeText={setAvgLap} keyboardType="decimal-pad" placeholder="optional" />
        <LapListInput laps={lapsList} onChange={setLapsList} />
        {derived && (
          <Text style={styles.derivedNote}>
            derived: best {derived.best.toFixed(2)} · avg {derived.avg.toFixed(2)} — manual entry overrides
          </Text>
        )}
      </Section>

      <View style={styles.feedbackCard}>
        <Text style={styles.feedbackTitle}>Feedback — what did the car do?</Text>
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={onNoteChange}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          placeholder='Tell it like it happened — "bottoming out of the sweeper, rear gives up as tyres heat, had to baby it into the chicane"'
          placeholderTextColor={colors.sub}
        />
        {autoTagged && <Text style={styles.autoTag}>🏷 auto-tagged from your note — tap a chip to correct me</Text>}
        <Text style={styles.hint}>Symptoms</Text>
        <MultiChipRow options={SYMPTOMS} values={symptoms} onToggle={toggleSymptom} />
        {symptoms.length > 0 && (
          <>
            <Text style={styles.hint}>Where? (optional)</Text>
            <ChipRow options={PHASES} value={phase} onSelect={(p) => setPhase(phase === p ? undefined : p)} />
          </>
        )}
        {track && track.corners.length > 0 && (
          <>
            <Text style={styles.hint}>Notes by corner</Text>
            {track.corners.map((c) => (
              <AutofillInput
                key={c.n}
                label={cornerLabel(c)}
                value={cornerNotes[c.n] ?? ""}
                onChangeText={(t) => setCornerNotes((prev) => ({ ...prev, [c.n]: t }))}
                pool={CORNER_NOTE_LEXICON}
                placeholder="anything happen here?"
              />
            ))}
          </>
        )}
      </View>

      <Section title="Feeling">
        <FeelingSlider value={feeling} onChange={(v) => { setFeeling(v); setFeelingSet(true); }} />
      </Section>

      {car?.power === "nitro" && (
        <Section title="Autonomy">
          <Pressable style={styles.autonomyBtn} onPress={() => setShowAutonomy((v) => !v)}>
            <Text style={styles.autonomyBtnText}>
              {showAutonomy ? "▾" : "▸"} Autonomy test — ran the tank dry?
            </Text>
          </Pressable>
          {showAutonomy && (
            <View style={{ marginTop: 8 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <LabeledInput label="Time of the run" value={autoTime} onChangeText={setAutoTime} placeholder="7:10 or 430" />
                </View>
                <View style={{ flex: 1 }}>
                  <LabeledInput label="Laps in the run" value={autoLaps} onChangeText={setAutoLaps} keyboardType="numeric" placeholder="e.g. 12" />
                </View>
              </View>
              <Text style={styles.derivedNote}>feeds the pit strategy — a measured fact beats any tank estimate</Text>
            </View>
          )}
        </Section>
      )}

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={props.onCancel}>
          <Text style={styles.btnGhostText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary, !canSave && styles.btnDisabled]} onPress={save}>
          <Text style={styles.btnPrimaryText}>Save run</Text>
        </Pressable>
      </View>
      {!canSave && <Text style={styles.saveHint}>pick a car, a track and a setup to save</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hint: { color: colors.sub, fontSize: 12, marginTop: 8, marginBottom: 4 },
  // — selectors —
  pickRow: { flexDirection: "row", gap: 6, paddingRight: 14 },
  pick: {
    backgroundColor: colors.cardAlt,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  pickActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pickText: { color: colors.sub, fontSize: 13 },
  pickTextActive: { color: colors.accent, fontWeight: "700" },
  pickNew: { borderStyle: "dashed", borderColor: colors.accent, backgroundColor: "transparent" },
  pickNewText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  // — weather —
  wxBtn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 9,
    alignItems: "center",
    marginBottom: 8,
  },
  wxBtnText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  autonomyBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  autonomyBtnText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  wxMiss: { color: colors.warn, fontSize: 12, marginBottom: 6 },
  wxGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 8 },
  wxCell: { flexBasis: "47%", flexGrow: 1 },
  wxAuto: { marginBottom: 8 },
  wxAutoLabel: { color: colors.sub, fontSize: 12, marginBottom: 4 },
  wxAutoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  wxAutoValue: { color: colors.sub, fontSize: 14 },
  wxAutoTag: { color: colors.sub, fontSize: 11, fontStyle: "italic" },
  // — laps —
  derivedNote: { color: colors.sub, fontSize: 12, fontStyle: "italic", marginTop: 6 },
  // — feedback (the gold) —
  feedbackCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 14,
  },
  feedbackTitle: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  noteInput: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    minHeight: 96,
  },
  autoTag: { color: colors.good, fontSize: 11, marginTop: 6, fontStyle: "italic" },
  cornerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  cornerLabel: { color: colors.text, fontSize: 12, fontWeight: "700", width: 86 },
  cornerInput: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  // — actions —
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: colors.accent },
  btnDisabled: { opacity: 0.4 },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  saveHint: { color: colors.sub, fontSize: 11, textAlign: "center", marginTop: 6 },
});
