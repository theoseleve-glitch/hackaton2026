import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { LogbookState, RunEntry } from "../../../../packages/logbook/src";
import { computePitPlan, stretchOptions } from "../../../../packages/strategy/src";
import type { PitPlan, StrategyInputs } from "../../../../packages/strategy/src";
import { colors, radius } from "../theme";
import { ChipRow, LabeledInput, Section, num } from "./forms";

/**
 * Race-plan rendering, the track-first run picker and the pit-strategy
 * form/result (D30, reworked on pilot feedback): pilots talk TIME, not
 * laps — every strategy number renders mm:ss and the plan explains itself.
 */

// ——— time helpers ———

/** mm:ss — the one time format pilots read (385 → "6:25"). */
export function fmtTime(s: number): string {
  const total = Math.max(0, Math.round(s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Accepts "6:25" (mm:ss) or plain seconds ("385"). */
function parseTimeS(text: string): number | undefined {
  const m = text.trim().match(/^(\d+):([0-5]?\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : num(text);
}

// ——— race plan (Pit Board layout lives in its own file) ———

export { RacePlanView } from "./RacePlanView";

// ——— track-first run picker ———

export interface TrackChoice {
  key: string;
  label: string;
  track_id?: string;
}

/** Tracks that actually have logged runs — the pilot picks the venue first. */
export function tracksWithRuns(logbook: LogbookState): TrackChoice[] {
  const out: TrackChoice[] = [];
  for (const r of logbook.runs) {
    const key = r.track_id ?? `name:${r.track.name}`;
    if (!out.some((t) => t.key === key)) out.push({ key, label: r.track.name, track_id: r.track_id });
  }
  return out;
}

const runTrackKey = (r: RunEntry) => r.track_id ?? `name:${r.track.name}`;

export interface RaceParams {
  startIso: string;
  lengthMin: number;
  type: "sprint" | "endurance";
}

interface RunPickerProps {
  logbook: LogbookState;
  multi: boolean;
  cta: string;
  /** show the race date/time/length/type inputs (race planner) */
  askRace?: boolean;
  /** show the free-text notes field (setup engineer) */
  askNotes?: boolean;
  /** pilot picks the track first; only that track's runs are listed */
  trackFirst?: boolean;
  /** CTA enabled with zero runs once a track is picked (direct strategy entry) */
  allowEmpty?: boolean;
  /** escape hatch: skip picking, enter every number manually */
  onSkip?: () => void;
  onDone: (runs: RunEntry[], extras: { notes: string; race?: RaceParams; track?: TrackChoice }) => void;
}

/** Run selection (single or multi), track-first when asked, + optional race window. */
export function RunPicker({ logbook, multi, cta, askRace, askNotes, trackFirst, allowEmpty, onSkip, onDone }: RunPickerProps) {
  const [trackKey, setTrackKey] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("14:00");
  const [lengthMin, setLengthMin] = useState("30");
  const [type, setType] = useState<"sprint" | "endurance">("endurance");

  const trackChoices = trackFirst ? tracksWithRuns(logbook) : [];
  const track = trackChoices.find((t) => t.key === trackKey);
  const visible = [...logbook.runs]
    .reverse()
    .filter((r) => !trackFirst || (track !== undefined && runTrackKey(r) === track.key));

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : multi ? [...prev, id] : [id]));
  const pickTrack = (key: string) => {
    setTrackKey(key);
    setSelected([]); // runs from another track never leak into the selection
  };

  const canSubmit = trackFirst ? track !== undefined && (allowEmpty === true || selected.length > 0) : selected.length > 0;
  const done = () => {
    if (!canSubmit) return;
    const chosen = logbook.runs.filter((r) => selected.includes(r.id));
    const race: RaceParams | undefined = askRace
      ? {
          startIso: `${date.trim() || new Date().toISOString().slice(0, 10)}T${time.trim() || "14:00"}:00`,
          lengthMin: num(lengthMin) ?? 30,
          type,
        }
      : undefined;
    onDone(chosen, { notes, race, track });
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      {logbook.runs.length === 0 && <Text style={styles.empty}>Log a run first — the engineer works from your log.</Text>}
      {trackFirst && trackChoices.length > 0 && (
        <Section title="Track — where is the race?">
          <ChipRow
            options={trackChoices.map((t) => t.key)}
            value={trackKey}
            onSelect={pickTrack}
            labelFor={(k) => trackChoices.find((t) => t.key === k)?.label ?? k}
          />
        </Section>
      )}
      {trackFirst && track === undefined ? (
        trackChoices.length > 0 && <Text style={styles.empty}>Pick the track first — only runs you logged there count.</Text>
      ) : (
        visible.map((r) => {
          const on = selected.includes(r.id);
          const tank = r.result?.autonomy_test;
          const tankLabel =
            tank !== undefined
              ? tank.time_s !== undefined
                ? ` · ⛽ tank ${fmtTime(tank.time_s)}`
                : " · ⛽ autonomy test"
              : "";
          return (
            <Pressable key={r.id} style={[styles.runCard, on && { borderColor: colors.accent }]} onPress={() => toggle(r.id)}>
              <Text style={styles.runLabel}>
                {on ? "☑ " : "☐ "}
                {r.track.name} · {r.type} · {r.created_at.slice(5, 16).replace("T", " ")}
              </Text>
              <Text style={styles.runMeta}>
                {r.conditions.grip.replace("_", " ")} grip
                {r.result?.best_lap_s !== undefined ? ` · best ${r.result.best_lap_s.toFixed(2)}s` : ""}
                {r.result?.laps_list !== undefined ? ` · ${r.result.laps_list.length} laps logged` : ""}
                {tankLabel}
                {r.feedback.tags.length > 0 ? ` · ${r.feedback.tags.map((t) => t.symptom.replace(/_/g, " ")).join(", ")}` : ""}
              </Text>
            </Pressable>
          );
        })
      )}

      {askRace && (
        <Section title="Race window">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Race day (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-06-14" />
            </View>
            <View style={{ width: 96 }}>
              <LabeledInput label="Start" value={time} onChangeText={setTime} placeholder="14:00" />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <View style={{ width: 96 }}>
              <LabeledInput label="Length (min)" value={lengthMin} onChangeText={setLengthMin} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1, marginTop: 8 }}>
              <ChipRow options={["sprint", "endurance"] as const} value={type} onSelect={setType} />
            </View>
          </View>
        </Section>
      )}

      {askNotes && (
        <Section title="Notes for the engineer (optional)">
          <TextInput
            style={styles.notes}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder='e.g. "mostly in the long sweeper, worse with the second tank"'
            placeholderTextColor={colors.sub}
          />
        </Section>
      )}

      <Pressable style={[styles.cta, !canSubmit && { opacity: 0.4 }]} disabled={!canSubmit} onPress={done}>
        <Text style={styles.ctaText}>{cta}</Text>
      </Pressable>
      {onSkip && (
        <Pressable onPress={onSkip} hitSlop={8}>
          <Text style={styles.skip}>or enter everything manually →</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// ——— strategy form ———

export interface StrategyPrefill {
  /** from the race plan's race window */
  race_length_s?: number;
  race_type?: "sprint" | "endurance";
  /** plan's race_avg_lap_s, or the best average of the selected runs */
  avg_lap_s?: number;
  /** longest logged lap series of the context runs — feeds tyre-cliff detection */
  lap_times?: number[];
  /** best logged autonomy test for the track context — greyed autofill, tap to override */
  autonomy?: { time_s: number; date: string };
}

interface StrategyFormProps {
  prefill: StrategyPrefill;
  onResult: (plan: PitPlan, options: PitPlan[], inputs: StrategyInputs) => void;
  onCancel: () => void;
}

const MARGINS = ["none", "1 lap", "2 laps", "30s"] as const;
type MarginChoice = (typeof MARGINS)[number];

export function StrategyForm({ prefill, onResult, onCancel }: StrategyFormProps) {
  const [lengthMin, setLengthMin] = useState(
    prefill.race_length_s !== undefined ? String(Math.round(prefill.race_length_s / 60)) : "30",
  );
  const [type, setType] = useState<"sprint" | "endurance">(prefill.race_type ?? "endurance");
  const [avgLap, setAvgLap] = useState(prefill.avg_lap_s !== undefined ? String(prefill.avg_lap_s) : "");
  // same auto/touched idiom as the RunFormV2 weather fields: greyed until tapped
  const [autonomy, setAutonomy] = useState<{ text: string; auto: boolean }>(() =>
    prefill.autonomy ? { text: fmtTime(prefill.autonomy.time_s), auto: true } : { text: "", auto: false },
  );
  const [pitLoss, setPitLoss] = useState("25");
  const [margin, setMargin] = useState<MarginChoice>("1 lap");
  const [error, setError] = useState<string | null>(null);

  const compute = () => {
    setError(null);
    const avg = num(avgLap) ?? 0;
    const autonomyS = parseTimeS(autonomy.text);
    if (autonomyS === undefined || autonomyS <= 0) {
      setError("Autonomy is the one fuel number I need — time a full tank and enter it (mm:ss or seconds).");
      return;
    }
    const marginS = margin === "none" ? 0 : margin === "30s" ? 30 : margin === "1 lap" ? avg : avg * 2;
    const inputs: StrategyInputs = {
      race_length_s: (num(lengthMin) ?? 0) * 60,
      race_type: type,
      avg_lap_s: avg,
      autonomy_s: autonomyS,
      pit_loss_s: num(pitLoss) ?? 25,
      margin_s: marginS,
      lap_times: prefill.lap_times,
    };
    try {
      const plan = computePitPlan(inputs);
      onResult(plan, stretchOptions(plan, inputs), inputs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      {prefill.race_length_s !== undefined && (
        <Text style={styles.prefillHint}>Prefilled from your race plan — everything stays editable.</Text>
      )}
      <Section title="Race">
        <LabeledInput label="Race length (minutes)" value={lengthMin} onChangeText={setLengthMin} keyboardType="numeric" />
        <ChipRow options={["sprint", "endurance"] as const} value={type} onSelect={setType} />
      </Section>
      <Section title="Pace">
        <LabeledInput
          label="Average lap (s) — your race pace"
          value={avgLap}
          onChangeText={setAvgLap}
          keyboardType="decimal-pad"
          placeholder="e.g. 34.5"
        />
      </Section>
      <Section title="Fuel — one number: how long does a full tank last?">
        {autonomy.auto && prefill.autonomy ? (
          <Pressable style={styles.autoField} onPress={() => setAutonomy((a) => ({ ...a, auto: false }))}>
            <Text style={styles.autoLabel}>Autonomy — full tank lasts</Text>
            <View style={styles.autoRow}>
              <Text style={styles.autoValue}>{autonomy.text}</Text>
              <Text style={styles.autoTag}>
                {prefill.autonomy.date
                  ? `from your autonomy test on ${prefill.autonomy.date}`
                  : "from your autonomy test"}{" "}
                — tap to override
              </Text>
            </View>
          </Pressable>
        ) : (
          <LabeledInput
            label="Autonomy — time to burn a full tank (mm:ss or seconds)"
            value={autonomy.text}
            onChangeText={(t) => setAutonomy({ text: t, auto: false })}
            placeholder="e.g. 6:30"
          />
        )}
      </Section>
      <Section title="Pit">
        <LabeledInput label="Time lost per pit stop (s)" value={pitLoss} onChangeText={setPitLoss} keyboardType="numeric" />
        <Text style={styles.hint}>Safety margin — fuel kept in reserve</Text>
        <ChipRow options={MARGINS} value={margin} onSelect={setMargin} />
      </Section>
      {prefill.lap_times !== undefined && prefill.lap_times.length >= 8 && (
        <Text style={styles.hint}>
          ✓ {prefill.lap_times.length} logged laps from your runs — tyre-cliff detection active (endurance).
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
          <Text style={styles.btnGhostText}>Back</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={compute}>
          <Text style={styles.btnPrimaryText}>Compute strategy</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ——— pit plan (the verdict, in time) ———

export function PitPlanView({ plan, options, inputs }: { plan: PitPlan; options: PitPlan[]; inputs?: StrategyInputs }) {
  // pit_at_s maps 1:1, in order, onto the stints flagged pit_after
  let pitIdx = 0;
  const pitLabels = plan.stints.map((s) => (s.pit_after ? plan.pit_at_s[pitIdx++] : undefined));
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={[styles.block, { borderColor: colors.accent }]}>
        <Text style={styles.verdict}>
          {plan.stops === 0
            ? "No stops — the tank covers the race"
            : `Box ${plan.stops} time${plan.stops === 1 ? "" : "s"} — every ~${fmtTime(plan.stint_max_s)}`}
        </Text>

        <View style={styles.tlBar}>
          {plan.stints.map((s, i) => (
            <React.Fragment key={i}>
              <View style={[styles.tlSeg, { flex: Math.max(1, s.duration_s) }]} />
              {s.pit_after && <View style={styles.tlPit} />}
            </React.Fragment>
          ))}
        </View>
        <View style={styles.tlLabels}>
          {plan.stints.map((s, i) => (
            <React.Fragment key={i}>
              <View style={[styles.tlCell, { flex: Math.max(1, s.duration_s) }]}>
                {pitLabels[i] !== undefined ? (
                  <Text style={styles.tlPitLabel}>⛽ {fmtTime(pitLabels[i]!)}</Text>
                ) : i === plan.stints.length - 1 ? (
                  <Text style={styles.tlEndLabel}>🏁 {fmtTime(plan.total_time_s)}</Text>
                ) : null}
              </View>
              {s.pit_after && <View style={{ width: 3 }} />}
            </React.Fragment>
          ))}
        </View>

        {plan.pit_driver === "tyre_cliff" && plan.cliff_lap !== undefined && (
          <View style={styles.cliff}>
            <Text style={styles.cliffText}>
              ⚠️ Your tyres fall off a cliff around lap {plan.cliff_lap} — the tyres, not the fuel, decide when
              you box. Stints are cut short to stay ahead of it.
            </Text>
          </View>
        )}

        <Text style={styles.notesTitle}>Why this plan</Text>
        {plan.notes.map((l, i) => (
          <View key={i} style={styles.noteRow}>
            <Text style={styles.noteIcon}>▸</Text>
            <Text style={styles.noteText}>{l}</Text>
          </View>
        ))}
      </View>

      {options.length > 0 && <Text style={styles.optionsHeader}>If you want fewer stops</Text>}
      {options.map((o, i) => {
        const fewer = plan.stops - o.stops;
        const marginLeft = inputs !== undefined ? Math.max(0, inputs.autonomy_s - o.stint_max_s) : undefined;
        return (
          <View key={i} style={styles.optionCard}>
            <Text style={styles.optionTitle}>
              {fewer === 1 ? "1 less stop" : fewer > 1 ? `${fewer} fewer stops` : "Alternative"} — stint{" "}
              {fmtTime(o.stint_max_s)}
              {marginLeft !== undefined ? `, ${fmtTime(marginLeft)} fuel margin left` : ""}
            </Text>
            {o.notes.map((l, j) => (
              <Text key={j} style={styles.optionNote}>
                {l}
              </Text>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  block: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginHorizontal: 14, marginTop: 10 },
  blockTitle: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 6 },
  line: { color: colors.text, fontSize: 13, lineHeight: 19 },
  // — picker —
  empty: { color: colors.sub, fontSize: 13, textAlign: "center", lineHeight: 19, marginVertical: 10 },
  runCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  runLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  runMeta: { color: colors.sub, fontSize: 11, marginTop: 2 },
  notes: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, paddingVertical: 8, paddingHorizontal: 12, fontSize: 14, minHeight: 70 },
  cta: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", marginTop: 16 },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  skip: { color: colors.accent, fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 12 },
  // — strategy form —
  prefillHint: { color: colors.good, fontSize: 12, fontStyle: "italic", marginBottom: 10 },
  autoField: { marginBottom: 8 },
  autoLabel: { color: colors.sub, fontSize: 12, marginBottom: 4 },
  autoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  autoValue: { color: colors.sub, fontSize: 14 },
  autoTag: { color: colors.sub, fontSize: 11, fontStyle: "italic", flexShrink: 1, textAlign: "right" },
  hint: { color: colors.sub, fontSize: 12, marginTop: 8, marginBottom: 4 },
  error: { color: colors.warn, fontSize: 13, marginTop: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  // — pit plan —
  verdict: { color: colors.text, fontSize: 18, fontWeight: "900", lineHeight: 24 },
  tlBar: { flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", borderWidth: 1, borderColor: colors.border, marginTop: 12 },
  tlSeg: { backgroundColor: colors.accentSoft },
  tlPit: { width: 3, backgroundColor: colors.accent },
  tlLabels: { flexDirection: "row", marginTop: 4 },
  tlCell: { alignItems: "flex-end" },
  tlPitLabel: { color: colors.accent, fontSize: 11, fontWeight: "800" },
  tlEndLabel: { color: colors.sub, fontSize: 11 },
  cliff: { borderWidth: 1, borderColor: colors.warn, borderRadius: radius.md, padding: 10, marginTop: 12 },
  cliffText: { color: colors.warn, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  notesTitle: { color: colors.sub, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 14, marginBottom: 6 },
  noteRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  noteIcon: { color: colors.accent, fontSize: 13, lineHeight: 20 },
  noteText: { color: colors.sub, fontSize: 13, lineHeight: 20, flex: 1 },
  optionsHeader: { color: colors.sub, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginHorizontal: 14, marginTop: 14 },
  optionCard: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginHorizontal: 14, marginTop: 8 },
  optionTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
  optionNote: { color: colors.sub, fontSize: 12, lineHeight: 17, marginTop: 4 },
});
