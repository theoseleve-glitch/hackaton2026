import React, { useState } from "react";
// prettier-ignore
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { parseFeedback } from "../../../../packages/engine/src";
import type { FeedbackTag } from "../../../../packages/engine/src";
import { powerLabel } from "../../../../packages/garage/src";
import type { Car } from "../../../../packages/garage/src";
import { lapStats, makeRun } from "../../../../packages/logbook/src";
// prettier-ignore
import type { Bumpiness, Grip, MakeRunInput, RunEntry, RunResult, RunType, Sky, TrackEvolution } from "../../../../packages/logbook/src";
import { cornersOf, snapshotTrack } from "../../../../packages/tracks/src";
import type { CornerSpec, Track } from "../../../../packages/tracks/src";
import { KB } from "../kb";
import { colors, radius } from "../theme";
import type { WeatherFill } from "../weather";
import { AutofillInput } from "./AutofillInput";
import { FeelingSlider } from "./FeelingSlider";
import { ChipRow, LabeledInput, MultiChipRow, Section, num } from "./forms";
import { LapListInput } from "./LapListInput";
import { useT } from "../i18n";
import { useGate } from "../entitlements";
import { usePaywall } from "./Paywall";

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
  cars: Car[];
  tracks: Track[];
  setupsForCar: (carId: string) => { id: string; name: string }[];
  selection: { car_id?: string; track_id?: string; setup_version_id?: string };
  onSelectCar: (id: string) => void;
  onSelectTrack: (id: string) => void;
  onSelectSetup: (id: string) => void;
  onRequestNewCar: () => void;
  onRequestNewTrack: () => void;
  onRequestNewSetup: () => void;
  fetchWeather: (track: Track, whenIso: string) => Promise<WeatherFill | null>;
  /** prefill (Speedhive import: a detected session opens the form ready) */
  initial?: { created_at?: string; best_lap_s?: number; avg_lap_s?: number; laps_list?: number[] };
  onSave: (run: RunEntry) => void;
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
// — French labels for the weather fields (mirrors WX_FIELDS keys) —
const WX_LABELS_FR: Record<WxKey, string> = {
  air_temp_c: "Temp. air (°C)",
  humidity_pct: "Humidité (%)",
  wind_kmh: "Vent (km/h)",
  pressure_hpa: "Pression (hPa)",
  sun_pct: "Soleil (%)",
};
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

/** 0–100 feeling slider → schema feeling_1to10 (makeRun clamps to [1,10]). */
function to1to10(v: number): number {
  return Math.max(1, Math.min(10, Math.round(v / 10)));
}

/** Synthesize a stable SessionId per calendar day (spec §B2: one session per
 *  run/day). A schema SessionId is "ss-…"-shaped; same-day runs share it so
 *  lifted/fresh history joins on the session. */
function sessionIdFor(iso: string): MakeRunInput["session_id"] {
  const day = iso.slice(0, 10).replace(/-/g, "");
  return `ss-day-${day}` as MakeRunInput["session_id"];
}

export function RunFormV2(props: RunFormV2Props) {
  const t = useT();
  // auto_weather gate: fetching weather from the track GPS is premium; MANUAL
  // weather entry (the editable fields below) stays free.
  const gateWeather = useGate("auto_weather");
  const paywall = usePaywall();
  const { cars, tracks, setupsForCar, selection } = props;
  const car = cars.find((c) => c.id === selection.car_id);
  const track = tracks.find((t) => t.id === selection.track_id);
  const trackCorners: CornerSpec[] = track ? cornersOf(track) : [];
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
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const runFetchWeather = async () => {
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

  // premium gate: starts the trial on first touch, opens the paywall on denial;
  // manual weather entry remains available regardless.
  const doFetchWeather = () => void gateWeather(() => void runFetchWeather(), paywall.open);

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
    // per-corner notes → schema RunFeedback.turns (text per corner number)
    const turns = trackCorners
      .map((c) => ({ turn_n: c.n, text: (cornerNotes[c.n] ?? "").trim() }))
      .filter((tn) => tn.text.length > 0)
      .map((tn) => ({ turn_n: tn.turn_n, text: tn.text }));
    const autonomyTime = parseTimeS(autoTime);
    const autonomyLaps = num(autoLaps);
    const autonomy =
      autonomyTime !== undefined || autonomyLaps !== undefined
        ? { ...(autonomyTime !== undefined ? { time_s: autonomyTime } : {}), ...(autonomyLaps !== undefined ? { laps: autonomyLaps } : {}) }
        : undefined;

    // summary-branch result (theo's RunResult vocab; laps_list preserved)
    const result: RunResult = {
      ...(num(bestLap) !== undefined ? { best_lap_s: num(bestLap) } : {}),
      ...(num(avgLap) !== undefined ? { avg_lap_s: num(avgLap) } : {}),
      ...(lapsList.length > 0 ? { laps: lapsList.length, laps_list: lapsList } : {}),
      ...(type !== "practice" && num(position) !== undefined ? { position: num(position) } : {}),
      ...(type !== "practice" && num(entrants) !== undefined ? { entrants: num(entrants) } : {}),
    };
    const hasResult = Object.keys(result).length > 0;

    // the pilot's date+time wins; falls back to "now" if unparseable
    const whenDate = new Date(`${dateStr}T${timeStr.length === 5 ? timeStr : "12:00"}:00`);
    const when = Number.isFinite(whenDate.getTime()) ? whenDate.toISOString() : new Date().toISOString();

    // wind/pressure land on the frozen schema weather observation (not conditions)
    const wind = num(wx.wind_kmh.text);
    const pressure = num(wx.pressure_hpa.text);
    const weather =
      wind !== undefined || pressure !== undefined
        ? { source: "manual" as const, observed_at: when, ...(wind !== undefined ? { wind_speed_kmh: wind } : {}), ...(pressure !== undefined ? { pressure_hpa: pressure } : {}) }
        : undefined;

    const input: MakeRunInput = {
      type,
      session_id: sessionIdFor(when),
      car_id: car.id,
      car_name: car.name,
      car_template_id: car.template_id ?? car.chassis_id,
      setup_version_id: setup.id,
      setup_name: setup.name,
      track: snapshotTrack(track),
      conditions: {
        grip,
        ...(bumpiness !== undefined ? { bumpiness } : {}),
        ...(dusty ? { dusty: true } : {}),
        ...(sky !== undefined ? { sky } : {}),
        ...(evolution !== undefined ? { evolution } : {}),
        ...(num(wx.air_temp_c.text) !== undefined ? { air_temp_c: num(wx.air_temp_c.text) } : {}),
        ...(num(wx.humidity_pct.text) !== undefined ? { humidity_pct: num(wx.humidity_pct.text) } : {}),
      },
      ...(weather !== undefined ? { weather } : {}),
      ...(hasResult ? { timing: { kind: "summary", result } } : {}),
      ...(autonomy !== undefined ? { autonomy_test: autonomy } : {}),
      ...(num(duration) !== undefined ? { duration_min: num(duration) } : {}),
      feedback: {
        tags,
        ...(note.trim() !== "" ? { text: note.trim() } : {}),
        ...(turns.length > 0 ? { turns } : {}),
      },
      ...(feelingSet ? { driver: { feeling_1to10: to1to10(feeling) } } : {}),
      ...(note.trim() !== "" ? { note: note.trim() } : {}),
    };
    const res = makeRun(input, when);
    if (!res.ok) {
      setSaveError(res.reason);
      return;
    }
    props.onSave(res.run);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Section title={t({ en: "Car", fr: "Voiture" })}>
        <PickRow
          items={cars.map((c) => ({ id: c.id, label: c.name }))}
          selectedId={selection.car_id}
          onSelect={props.onSelectCar}
          newLabel={t({ en: "new car", fr: "nouvelle voiture" })}
          onNew={props.onRequestNewCar}
        />
      </Section>

      <Section title={t({ en: "Track", fr: "Piste" })}>
        <PickRow
          items={tracks.map((t) => ({ id: t.id, label: t.name }))}
          selectedId={selection.track_id}
          onSelect={props.onSelectTrack}
          newLabel={t({ en: "new track", fr: "nouvelle piste" })}
          onNew={props.onRequestNewTrack}
        />
      </Section>

      <Section title={t({ en: "Setup on the car", fr: "Réglage sur la voiture" })}>
        {car ? (
          <PickRow
            items={setups.map((s) => ({ id: s.id, label: s.name }))}
            selectedId={selection.setup_version_id}
            onSelect={props.onSelectSetup}
            newLabel={t({ en: "new setup", fr: "nouveau réglage" })}
            onNew={props.onRequestNewSetup}
          />
        ) : (
          <Text style={styles.hint}>{t({ en: "pick a car first", fr: "choisis d’abord une voiture" })}</Text>
        )}
      </Section>

      <Section title={t({ en: "When", fr: "Quand" })}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 3 }}>
            <LabeledInput
              label={t({ en: "Date", fr: "Date" })}
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="2026-06-12"
              keyboardType="numbers-and-punctuation"
              error={!dateValid ? t({ en: "use YYYY-MM-DD", fr: "format AAAA-MM-JJ" }) : undefined}
            />
          </View>
          <View style={{ flex: 2 }}>
            <LabeledInput
              label={t({ en: "Time", fr: "Heure" })}
              value={timeStr}
              onChangeText={setTimeStr}
              placeholder="14:30"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </View>
      </Section>

      <Section title={t({ en: "Session", fr: "Session" })}>
        <ChipRow options={RUN_TYPES} value={type} onSelect={setType} />
        <LabeledInput
          label={t({ en: "Session length (min)", fr: "Durée de la session (min)" })}
          value={duration}
          onChangeText={setDuration}
          keyboardType="numeric"
          placeholder={t({ en: "e.g. 10", fr: "ex. 10" })}
        />
        {type !== "practice" && (
          <View style={{ marginTop: 10 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <LabeledInput label={t({ en: "Finished P", fr: "Place finale" })} value={position} onChangeText={setPosition} keyboardType="numeric" placeholder={t({ en: "e.g. 2", fr: "ex. 2" })} />
              </View>
              <View style={{ flex: 1 }}>
                <LabeledInput label={t({ en: "Field size", fr: "Nb de partants" })} value={entrants} onChangeText={setEntrants} keyboardType="numeric" placeholder={t({ en: "e.g. 12", fr: "ex. 12" })} />
              </View>
            </View>
            <Text style={{ color: colors.sub, fontSize: 11, marginTop: 4, fontStyle: "italic" }}>
              {t({ en: "your result feeds career stats — podiums get their moment 🏆", fr: "ton résultat alimente tes stats de carrière — les podiums ont leur moment 🏆" })}
            </Text>
          </View>
        )}
      </Section>

      <Section title={t({ en: "Conditions", fr: "Conditions" })}>
        {track?.gps ? (
          <Pressable style={styles.wxBtn} onPress={() => void doFetchWeather()}>
            {fetching ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.wxBtnText}>{t({ en: "＋ Add weather", fr: "＋ Ajouter la météo" })}</Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.hint}>{t({ en: "add GPS to the track for auto-weather", fr: "ajoute le GPS à la piste pour la météo auto" })}</Text>
        )}
        {wxMiss && <Text style={styles.wxMiss}>{t({ en: "no weather data — fill in manually", fr: "pas de données météo — saisis-les à la main" })}</Text>}
        <View style={styles.wxGrid}>
          {WX_FIELDS.map((f) => (
            <View key={f.key} style={styles.wxCell}>
              <WxFieldView
                label={t({ en: f.label, fr: WX_LABELS_FR[f.key] })}
                field={wx[f.key]}
                onTouch={() => touchWx(f.key)}
                onChangeText={(txt) => editWx(f.key, txt)}
              />
            </View>
          ))}
        </View>
        <Text style={styles.hint}>{t({ en: "Grip", fr: "Grip" })}</Text>
        <ChipRow options={GRIPS} value={grip} onSelect={setGrip} />
        <Text style={styles.hint}>{t({ en: "Bumpiness", fr: "Bosses" })}</Text>
        <ChipRow options={BUMPINESS} value={bumpiness} onSelect={(b) => setBumpiness(bumpiness === b ? undefined : b)} />
        <Text style={styles.hint}>{t({ en: "Sky · dust · evolution", fr: "Ciel · poussière · évolution" })}</Text>
        <ChipRow options={SKIES} value={sky} onSelect={(s) => setSky(sky === s ? undefined : s)} />
        <View style={{ height: 6 }} />
        <MultiChipRow options={["dusty"] as const} values={dusty ? ["dusty"] : []} onToggle={() => setDusty(!dusty)} />
        <View style={{ height: 6 }} />
        <ChipRow options={EVOLUTIONS} value={evolution} onSelect={(e) => setEvolution(evolution === e ? undefined : e)} />
      </Section>

      <Section title={t({ en: "Laps", fr: "Tours" })}>
        <LabeledInput label={t({ en: "Best lap (s)", fr: "Meilleur tour (s)" })} value={bestLap} onChangeText={setBestLap} keyboardType="decimal-pad" placeholder={t({ en: "e.g. 34.2", fr: "ex. 34.2" })} />
        <LabeledInput label={t({ en: "Average lap (s)", fr: "Tour moyen (s)" })} value={avgLap} onChangeText={setAvgLap} keyboardType="decimal-pad" placeholder={t({ en: "optional", fr: "optionnel" })} />
        <LapListInput laps={lapsList} onChange={setLapsList} />
        {derived && (
          <Text style={styles.derivedNote}>
            {t({ en: `derived: best ${derived.best.toFixed(2)} · avg ${derived.avg.toFixed(2)} — manual entry overrides`, fr: `calculé : meilleur ${derived.best.toFixed(2)} · moyen ${derived.avg.toFixed(2)} — la saisie manuelle prime` })}
          </Text>
        )}
      </Section>

      <View style={styles.feedbackCard}>
        <Text style={styles.feedbackTitle}>{t({ en: "Feedback — what did the car do?", fr: "Ressenti — qu’a fait la voiture ?" })}</Text>
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={onNoteChange}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          placeholder={t({ en: 'Tell it like it happened — "bottoming out of the sweeper, rear gives up as tyres heat, had to baby it into the chicane"', fr: 'Raconte comme ça s’est passé — « ça talonne en sortie du grand virage, l’arrière lâche quand les pneus chauffent, obligé de lever pour la chicane »' })}
          placeholderTextColor={colors.sub}
        />
        {autoTagged && <Text style={styles.autoTag}>{t({ en: "🏷 auto-tagged from your note — tap a chip to correct me", fr: "🏷 tags auto depuis ta note — touche une puce pour me corriger" })}</Text>}
        <Text style={styles.hint}>{t({ en: "Symptoms", fr: "Symptômes" })}</Text>
        <MultiChipRow options={SYMPTOMS} values={symptoms} onToggle={toggleSymptom} />
        {symptoms.length > 0 && (
          <>
            <Text style={styles.hint}>{t({ en: "Where? (optional)", fr: "Où ? (optionnel)" })}</Text>
            <ChipRow options={PHASES} value={phase} onSelect={(p) => setPhase(phase === p ? undefined : p)} />
          </>
        )}
        {trackCorners.length > 0 && (
          <>
            <Text style={styles.hint}>{t({ en: "Notes by corner", fr: "Notes par virage" })}</Text>
            {trackCorners.map((c) => (
              <AutofillInput
                key={c.n}
                label={cornerLabel(c)}
                value={cornerNotes[c.n] ?? ""}
                onChangeText={(txt) => setCornerNotes((prev) => ({ ...prev, [c.n]: txt }))}
                pool={CORNER_NOTE_LEXICON}
                placeholder={t({ en: "anything happen here?", fr: "il s’est passé quelque chose ici ?" })}
              />
            ))}
          </>
        )}
      </View>

      <Section title={t({ en: "Feeling", fr: "Ressenti" })}>
        <FeelingSlider value={feeling} onChange={(v) => { setFeeling(v); setFeelingSet(true); }} />
      </Section>

      {car !== undefined && powerLabel(car) === "nitro" && (
        <Section title={t({ en: "Autonomy", fr: "Autonomie" })}>
          <Pressable style={styles.autonomyBtn} onPress={() => setShowAutonomy((v) => !v)}>
            <Text style={styles.autonomyBtnText}>
              {showAutonomy ? "▾" : "▸"} {t({ en: "Autonomy test — ran the tank dry?", fr: "Test d’autonomie — réservoir à sec ?" })}
            </Text>
          </Pressable>
          {showAutonomy && (
            <View style={{ marginTop: 8 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <LabeledInput label={t({ en: "Time of the run", fr: "Durée du run" })} value={autoTime} onChangeText={setAutoTime} placeholder={t({ en: "7:10 or 430", fr: "7:10 ou 430" })} />
                </View>
                <View style={{ flex: 1 }}>
                  <LabeledInput label={t({ en: "Laps in the run", fr: "Tours du run" })} value={autoLaps} onChangeText={setAutoLaps} keyboardType="numeric" placeholder={t({ en: "e.g. 12", fr: "ex. 12" })} />
                </View>
              </View>
              <Text style={styles.derivedNote}>{t({ en: "feeds the pit strategy — a measured fact beats any tank estimate", fr: "alimente la stratégie aux stands — une mesure réelle vaut mieux qu’une estimation de réservoir" })}</Text>
            </View>
          )}
        </Section>
      )}

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={props.onCancel}>
          <Text style={styles.btnGhostText}>{t({ en: "Cancel", fr: "Annuler" })}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary, !canSave && styles.btnDisabled]} onPress={save}>
          <Text style={styles.btnPrimaryText}>{t({ en: "Save run", fr: "Enregistrer la session" })}</Text>
        </Pressable>
      </View>
      {!canSave && <Text style={styles.saveHint}>{t({ en: "pick a car, a track and a setup to save", fr: "choisis une voiture, une piste et un réglage pour enregistrer" })}</Text>}
      {saveError !== null && <Text style={[styles.saveHint, { color: colors.warn }]}>{t({ en: "Could not save this run — check the numbers entered.", fr: "Impossible d'enregistrer cette session — vérifie les valeurs saisies." })}</Text>}
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
