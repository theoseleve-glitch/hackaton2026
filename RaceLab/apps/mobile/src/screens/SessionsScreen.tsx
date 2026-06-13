import React, { useState, type JSX } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius } from "../theme";
import type {
  Grip,
  RunType,
  Session,
  SessionsState,
  Surface,
  TrackInfo,
} from "../../../../packages/sessions/src";
import type { SheetsState } from "../../../../packages/sheets/src";

/**
 * Session log screen (docs/02 §2.3): start a session at a track, log runs
 * (practice / qualifier / main) against the setup version that was on the
 * car, watch engineer outcome records land, and browse past sessions.
 *
 * Pure view — all state lives in packages/sessions and is mutated by the
 * parent through the callbacks. `setup_version_id` is injected by the parent
 * on each run; it is deliberately absent from the onAddRun payload. Setup
 * version names resolve through sheets.versions (short id slice fallback).
 */

export interface SessionsScreenProps {
  sessions: SessionsState;
  sheets: SheetsState;
  onStart: (track: TrackInfo) => void;
  onEnd: () => void;
  onAddRun: (run: { type: RunType; best_lap_s?: number; lap_count?: number; feedback_text?: string }) => void;
  onUpdateTrack: (patch: Partial<TrackInfo>) => void;
}

type NewRun = Parameters<SessionsScreenProps["onAddRun"]>[0];
type Run = Session["runs"][number];
type OutcomeRec = Session["outcomes"][number];

const SURFACES: Surface[] = ["clay", "hard-packed", "loam", "astro", "carpet", "grass"];
const GRIPS: Grip[] = ["green", "medium", "high", "blue_groove"];
const RUN_TYPES: RunType[] = ["practice", "qualifier", "main"];

/** Taxonomy condition tags derived from the manual grip level (UI contract). */
function gripConditions(grip: Grip): string[] {
  switch (grip) {
    case "green":
      return ["low_grip"];
    case "high":
      return ["high_grip"];
    case "blue_groove":
      return ["high_grip", "blue_groove"];
    default:
      return [];
  }
}

function surfaceLabel(surface: Surface): string {
  return String(surface);
}

function gripLabel(grip: Grip): string {
  return String(grip).replace(/_/g, " ");
}

function typeLabel(type: RunType): string {
  const t = String(type);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function runBadge(type: RunType): { letter: string; color: string } {
  switch (type) {
    case "qualifier":
      return { letter: "Q", color: colors.warn };
    case "main":
      return { letter: "M", color: colors.accent };
    default:
      return { letter: "P", color: colors.good };
  }
}

function outcomeMark(outcome: string): { mark: string; color: string } {
  if (outcome === "better") return { mark: "✓", color: colors.good };
  if (outcome === "worse") return { mark: "↩", color: colors.warn };
  return { mark: "—", color: colors.sub };
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SessionsScreen(props: SessionsScreenProps): JSX.Element {
  const { sessions, sheets, onStart, onEnd, onAddRun, onUpdateTrack } = props;
  const active =
    sessions.active_session_id === null
      ? null
      : sessions.sessions.find((s) => s.id === sessions.active_session_id) ?? null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {active ? (
        <ActiveSessionView
          session={active}
          sheets={sheets}
          onEnd={onEnd}
          onAddRun={onAddRun}
          onUpdateTrack={onUpdateTrack}
        />
      ) : (
        <View>
          <Text style={[styles.section, styles.sectionFirst]}>Start session</Text>
          <StartSessionCard onStart={onStart} />
          <PastSessionsList sessions={sessions.sessions} />
        </View>
      )}
    </ScrollView>
  );
}

function StartSessionCard({ onStart }: { onStart: (track: TrackInfo) => void }) {
  const [name, setName] = useState("");
  const [surface, setSurface] = useState<Surface>("clay");
  const [grip, setGrip] = useState<Grip>("medium");
  const canStart = name.trim().length > 0;

  return (
    <View style={styles.card}>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Track name"
        placeholderTextColor={colors.sub}
      />
      <Text style={styles.fieldLabel}>Surface</Text>
      <ChipRow options={SURFACES} selected={surface} format={surfaceLabel} onPick={setSurface} />
      <Text style={styles.fieldLabel}>Grip</Text>
      <ChipRow options={GRIPS} selected={grip} format={gripLabel} onPick={setGrip} />
      <Pressable
        style={[styles.primaryBtn, !canStart && styles.btnDisabled]}
        disabled={!canStart}
        onPress={() => onStart({ name: name.trim(), surface, grip, conditions: gripConditions(grip) })}
      >
        <Text style={styles.primaryBtnText}>Start session</Text>
      </Pressable>
    </View>
  );
}

function PastSessionsList({ sessions }: { sessions: Session[] }) {
  const ordered = [...sessions].sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  return (
    <View>
      <Text style={styles.section}>Past sessions</Text>
      {ordered.length === 0 && (
        <Text style={styles.emptyText}>No sessions yet — start one above.</Text>
      )}
      {ordered.map((s) => {
        const ended = s.ended_at !== undefined;
        return (
          <View key={s.id} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{s.track.name}</Text>
              {ended ? <Text style={styles.endedBadge}>ended</Text> : null}
            </View>
            <Text style={styles.meta}>
              {new Date(s.started_at).toLocaleDateString()}
              {"  ·  "}
              {s.runs.length} run{s.runs.length === 1 ? "" : "s"}
              {"  ·  "}
              {s.outcomes.length} outcome{s.outcomes.length === 1 ? "" : "s"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ActiveSessionView({
  session,
  sheets,
  onEnd,
  onAddRun,
  onUpdateTrack,
}: {
  session: Session;
  sheets: SheetsState;
  onEnd: () => void;
  onAddRun: (run: NewRun) => void;
  onUpdateTrack: (patch: Partial<TrackInfo>) => void;
}) {
  return (
    <View>
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTrack}>{session.track.name}</Text>
          <Text style={styles.meta}>
            {surfaceLabel(session.track.surface)}
            {"  ·  "}started {clockTime(session.started_at)}
          </Text>
        </View>
        <Pressable style={styles.smallBtn} onPress={onEnd}>
          <Text style={styles.smallBtnText}>End session</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Track grip</Text>
      <ChipRow
        options={GRIPS}
        selected={session.track.grip}
        format={gripLabel}
        onPick={(g) => onUpdateTrack({ grip: g, conditions: gripConditions(g) })}
      />

      <Text style={styles.section}>Runs</Text>
      {session.runs.length === 0 && (
        <Text style={styles.emptyText}>No runs yet — log your first below.</Text>
      )}
      {session.runs.map((run) => (
        <RunRow key={run.id} run={run} sheets={sheets} />
      ))}
      <AddRunRow onAdd={onAddRun} />

      <Text style={styles.section}>Outcomes</Text>
      {session.outcomes.length === 0 ? (
        <Text style={styles.emptyText}>Outcomes recorded by the engineer land here.</Text>
      ) : (
        session.outcomes.map((o) => <OutcomeRow key={o.id} outcome={o} />)
      )}
    </View>
  );
}

function RunRow({ run, sheets }: { run: Run; sheets: SheetsState }) {
  const badge = runBadge(run.type);
  // denormalized at log time — survives a sheets-store reset; live lookup
  // only as a fallback for pre-hardening records
  const version = sheets.versions.find((v) => v.id === run.setup_version_id);
  const versionName = run.setup_name || (version ? version.name : String(run.setup_version_id).slice(0, 8));
  const metaParts = [
    clockTime(run.at),
    run.lap_count !== undefined ? `${run.lap_count} laps` : "",
    versionName,
  ].filter(Boolean);

  return (
    <View style={styles.runCard}>
      <View style={[styles.runBadge, { borderColor: badge.color }]}>
        <Text style={[styles.runBadgeText, { color: badge.color }]}>{badge.letter}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.runTitle}>
          {run.best_lap_s !== undefined ? `${run.best_lap_s.toFixed(2)}s best` : typeLabel(run.type)}
        </Text>
        {run.feedback_text ? (
          <Text style={styles.runFeedback} numberOfLines={2}>
            “{run.feedback_text}”
          </Text>
        ) : null}
        <Text style={styles.meta}>{metaParts.join("  ·  ")}</Text>
      </View>
    </View>
  );
}

function AddRunRow({ onAdd }: { onAdd: (run: NewRun) => void }) {
  const [type, setType] = useState<RunType>("practice");
  const [bestLap, setBestLap] = useState("");
  const [laps, setLaps] = useState("");
  const [feedback, setFeedback] = useState("");

  const add = () => {
    const run: NewRun = { type };
    const best = parseFloat(bestLap);
    if (!Number.isNaN(best)) run.best_lap_s = best;
    const lapCount = parseInt(laps, 10);
    if (!Number.isNaN(lapCount)) run.lap_count = lapCount;
    if (feedback.trim()) run.feedback_text = feedback.trim();
    onAdd(run);
    setBestLap("");
    setLaps("");
    setFeedback("");
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Add run</Text>
      <View style={{ marginTop: 8 }}>
        <ChipRow options={RUN_TYPES} selected={type} format={(t) => String(t)} onPick={setType} />
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputHalf]}
          value={bestLap}
          onChangeText={setBestLap}
          placeholder="Best lap (s)"
          placeholderTextColor={colors.sub}
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.input, styles.inputHalf]}
          value={laps}
          onChangeText={setLaps}
          placeholder="Laps"
          placeholderTextColor={colors.sub}
          keyboardType="numeric"
        />
      </View>
      <View style={{ marginTop: 8 }}>
        <TextInput
          style={styles.input}
          value={feedback}
          onChangeText={setFeedback}
          placeholder="pushes mid-corner"
          placeholderTextColor={colors.sub}
        />
      </View>
      <Pressable style={styles.primaryBtn} onPress={add}>
        <Text style={styles.primaryBtnText}>Add</Text>
      </Pressable>
    </View>
  );
}

function OutcomeRow({ outcome }: { outcome: OutcomeRec }) {
  const mark = outcomeMark(outcome.outcome);
  return (
    <View style={styles.outcomeRow}>
      <Text style={[styles.outcomeMark, { color: mark.color }]}>{mark.mark}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.outcomeSetting}>{outcome.setting}</Text>
        {outcome.change ? (
          <Text style={styles.outcomeChange} numberOfLines={2}>
            {outcome.change}
          </Text>
        ) : null}
      </View>
      <Text style={styles.meta}>{clockTime(outcome.at)}</Text>
    </View>
  );
}

function ChipRow<T extends string>({
  options,
  selected,
  format,
  onPick,
}: {
  options: T[];
  selected: T;
  format: (v: T) => string;
  onPick: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.chips}>
        {options.map((opt) => {
          const active = selected === opt;
          return (
            <Pressable
              key={opt}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onPick(opt)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{format(opt)}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  section: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 22,
    marginBottom: 8,
  },
  sectionFirst: { marginTop: 0 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  meta: { color: colors.sub, fontSize: 11, marginTop: 2 },
  emptyText: { color: colors.sub, fontSize: 12, marginBottom: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fieldLabel: { color: colors.sub, fontSize: 12, marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  inputRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  inputHalf: { flex: 1 },
  chips: { flexDirection: "row", gap: 6 },
  chip: {
    backgroundColor: colors.cardAlt,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.sub, fontSize: 13 },
  chipTextActive: { color: colors.accent, fontWeight: "700" },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: "center",
    marginTop: 12,
  },
  primaryBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  btnDisabled: { opacity: 0.4 },
  smallBtn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  smallBtnText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  headerTrack: { color: colors.text, fontSize: 18, fontWeight: "800" },
  endedBadge: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  runCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  runBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cardAlt,
    marginTop: 1,
  },
  runBadgeText: { fontSize: 13, fontWeight: "800" },
  runTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  runFeedback: { color: colors.text, fontSize: 12, fontStyle: "italic", marginTop: 2 },
  outcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 6,
  },
  outcomeMark: { fontSize: 16, fontWeight: "800", width: 20, textAlign: "center" },
  outcomeSetting: { color: colors.text, fontSize: 13, fontWeight: "600" },
  outcomeChange: { color: colors.sub, fontSize: 12, marginTop: 2 },
});
