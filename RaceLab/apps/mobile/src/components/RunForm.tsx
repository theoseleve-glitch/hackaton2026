import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { parseFeedback } from "../../../../packages/engine/src";
import type { FeedbackTag } from "../../../../packages/engine/src";
import type {
  Bumpiness,
  Grip,
  RunEntry,
  RunType,
  Sky,
  TrackEvolution,
  TyreWear,
} from "../../../../packages/logbook/src";
import { KB, MP11_ID } from "../kb";
import { useT } from "../i18n";
import { colors, radius } from "../theme";
import { ChipRow, LabeledInput, MultiChipRow, Section, num } from "./forms";

/**
 * Layer 1 entry surface. One scrollable form, chips over keyboards. The setup
 * is attached automatically (the version the sheet draft is based on) — the
 * user never retypes what the app already knows.
 */

const RUN_TYPES: RunType[] = ["practice", "qualifier", "main"];
const SURFACES = ["clay", "hard-packed", "loam", "astro", "carpet", "grass"] as const;
const GRIPS: Grip[] = ["green", "medium", "high", "blue_groove"];
const BUMPINESS: Bumpiness[] = ["smooth", "medium", "rough"];
const SKIES: Sky[] = ["sunny", "cloudy", "rain_risk", "raining"];
const EVOLUTIONS: TrackEvolution[] = ["improving", "stable", "degrading"];
const WEARS: TyreWear[] = ["new", "light", "medium", "worn"];
const CONFIDENCES = ["1", "2", "3", "4", "5"] as const;

const SYMPTOMS = KB.taxonomy.symptoms.map((s) => s.id);
const PHASES = KB.taxonomy.phases.map((p) => p.id);

interface Props {
  setupVersionId: string;
  setupName: string;
  defaultTrack?: { name: string; surface: string; indoor: boolean };
  onSave: (run: Omit<RunEntry, "id">) => void;
  onCancel: () => void;
}

export function RunForm({ setupVersionId, setupName, defaultTrack, onSave, onCancel }: Props) {
  const t = useT();
  const [type, setType] = useState<RunType>("practice");
  const [trackName, setTrackName] = useState(defaultTrack?.name ?? "");
  const [surface, setSurface] = useState<string>(defaultTrack?.surface ?? "clay");
  const [indoor, setIndoor] = useState(defaultTrack?.indoor ?? false);
  const [grip, setGrip] = useState<Grip>("medium");
  const [bumpiness, setBumpiness] = useState<Bumpiness | undefined>();
  const [dusty, setDusty] = useState(false);
  const [sky, setSky] = useState<Sky | undefined>();
  const [evolution, setEvolution] = useState<TrackEvolution | undefined>();
  const [airTemp, setAirTemp] = useState("");
  const [compound, setCompound] = useState("");
  const [wear, setWear] = useState<TyreWear | undefined>();
  const [tyreRuns, setTyreRuns] = useState("");
  const [bestLap, setBestLap] = useState("");
  const [avgLap, setAvgLap] = useState("");
  const [confidence, setConfidence] = useState<(typeof CONFIDENCES)[number] | undefined>();
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [phase, setPhase] = useState<string | undefined>();
  const [note, setNote] = useState("");
  const [autoTagged, setAutoTagged] = useState(false);

  const toggleSymptom = (s: string) =>
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // The engine's deterministic NLU reads the note as you type: "pushes mid
  // corner" lights up understeer + mid_corner. Additive only — it never
  // un-selects something the driver tapped.
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

  const save = () => {
    const tags: FeedbackTag[] = symptoms.map((symptom) => (phase ? { symptom, phase } : { symptom }));
    onSave({
      created_at: new Date().toISOString(),
      type,
      car_template_id: MP11_ID,
      setup_version_id: setupVersionId,
      setup_name: setupName,
      track: { name: trackName.trim() || "My track", surface, indoor },
      conditions: {
        grip,
        bumpiness,
        dusty: dusty || undefined,
        sky,
        evolution,
        air_temp_c: num(airTemp),
      },
      tyres:
        compound.trim() || wear || tyreRuns.trim()
          ? { compound: compound.trim() || undefined, wear, run_count: num(tyreRuns) }
          : undefined,
      result:
        bestLap.trim() || avgLap.trim() || confidence
          ? {
              best_lap_s: num(bestLap),
              avg_lap_s: num(avgLap),
              driver_confidence: confidence ? Number(confidence) : undefined,
            }
          : undefined,
      feedback: { tags, text: note.trim() || undefined },
      note: note.trim() || undefined,
    });
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <View style={styles.setupBanner}>
        <Text style={styles.setupBannerLabel}>{t({ en: "Setup on the car", fr: "Réglage sur la voiture" })}</Text>
        <Text style={styles.setupBannerName}>{setupName}</Text>
      </View>

      <Section title={t({ en: "Run", fr: "Session" })}>
        <ChipRow options={RUN_TYPES} value={type} onSelect={setType} />
      </Section>

      <Section title={t({ en: "Track", fr: "Piste" })}>
        <LabeledInput label={t({ en: "Track name", fr: "Nom de la piste" })} value={trackName} onChangeText={setTrackName} placeholder={t({ en: "e.g. MRT", fr: "ex. MRT" })} />
        <ChipRow options={SURFACES} value={surface as (typeof SURFACES)[number]} onSelect={setSurface} />
        <View style={{ height: 6 }} />
        <ChipRow
          options={["outdoor", "indoor"] as const}
          value={indoor ? "indoor" : "outdoor"}
          onSelect={(v) => setIndoor(v === "indoor")}
        />
      </Section>

      <Section title={t({ en: "Conditions", fr: "Conditions" })}>
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
        <View style={{ height: 8 }} />
        <LabeledInput label={t({ en: "Air temp (°C)", fr: "Température air (°C)" })} value={airTemp} onChangeText={setAirTemp} keyboardType="numeric" placeholder={t({ en: "optional", fr: "facultatif" })} />
      </Section>

      <Section title={t({ en: "Tyres", fr: "Pneus" })}>
        <LabeledInput label={t({ en: "Compound", fr: "Gomme" })} value={compound} onChangeText={setCompound} placeholder={t({ en: "e.g. soft pin", fr: "ex. soft pin" })} />
        <ChipRow options={WEARS} value={wear} onSelect={(w) => setWear(wear === w ? undefined : w)} />
        <View style={{ height: 8 }} />
        <LabeledInput label={t({ en: "Runs on this set", fr: "Sessions sur ce train" })} value={tyreRuns} onChangeText={setTyreRuns} keyboardType="numeric" placeholder={t({ en: "optional", fr: "facultatif" })} />
      </Section>

      <Section title={t({ en: "Result", fr: "Résultat" })}>
        <LabeledInput label={t({ en: "Best lap (s)", fr: "Meilleur tour (s)" })} value={bestLap} onChangeText={setBestLap} keyboardType="decimal-pad" placeholder={t({ en: "e.g. 34.2", fr: "ex. 34.2" })} />
        <LabeledInput label={t({ en: "Average lap (s)", fr: "Tour moyen (s)" })} value={avgLap} onChangeText={setAvgLap} keyboardType="decimal-pad" placeholder={t({ en: "optional", fr: "facultatif" })} />
        <Text style={styles.hint}>{t({ en: "Driver confidence (1 = fighting it, 5 = on rails)", fr: "Confiance pilote (1 = je me bats avec, 5 = sur des rails)" })}</Text>
        <ChipRow options={CONFIDENCES} value={confidence} onSelect={(c) => setConfidence(confidence === c ? undefined : c)} />
      </Section>

      <Section title={t({ en: "How did the car feel?", fr: "Comment la voiture s'est comportée ?" })}>
        <MultiChipRow options={SYMPTOMS} values={symptoms} onToggle={toggleSymptom} />
        {symptoms.length > 0 && (
          <>
            <Text style={styles.hint}>{t({ en: "Where? (optional)", fr: "Où ? (facultatif)" })}</Text>
            <ChipRow options={PHASES} value={phase} onSelect={(p) => setPhase(phase === p ? undefined : p)} />
          </>
        )}
        <View style={{ height: 8 }} />
        <LabeledInput
          label={t({ en: "Note", fr: "Note" })}
          value={note}
          onChangeText={onNoteChange}
          placeholder={t({ en: 'e.g. "pushes once tyres heat up"', fr: 'ex. « ça pousse une fois les pneus chauds »' })}
        />
        {autoTagged && <Text style={styles.autoTag}>{t({ en: "🏷 auto-tagged from your note — tap a chip to correct me", fr: "🏷 tagué auto depuis ta note — touche un chip pour me corriger" })}</Text>}
      </Section>

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
          <Text style={styles.btnGhostText}>{t({ en: "Cancel", fr: "Annuler" })}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={save}>
          <Text style={styles.btnPrimaryText}>{t({ en: "Save run", fr: "Enregistrer la session" })}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  setupBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 14,
  },
  setupBannerLabel: { color: colors.sub, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 },
  setupBannerName: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 2 },
  hint: { color: colors.sub, fontSize: 12, marginTop: 8, marginBottom: 4 },
  autoTag: { color: colors.good, fontSize: 11, marginTop: 6, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: "600", fontSize: 15 },
});
