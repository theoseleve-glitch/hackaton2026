import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { RacePlan } from "../../../../packages/engine/src/planner";
import type { PitPlan, StrategyInputs } from "../../../../packages/strategy/src";
import { computePitPlan, stretchOptions } from "../../../../packages/strategy/src";
import { colors, radius } from "../theme";
import { ChipRow, LabeledInput, Section, num } from "./forms";
import { RunReportCard } from "./RunReportCard";

/** Race-plan rendering + the pit-strategy form/result (D30). */

export function RacePlanView({ plan, onStrategy }: { plan: RacePlan; onStrategy: () => void }) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Conditions shift</Text>
        {plan.conditions_shift.map((l, i) => (
          <Text key={i} style={styles.line}>
            · {l}
          </Text>
        ))}
      </View>
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Readiness</Text>
        {plan.readiness.map((l, i) => (
          <Text key={i} style={styles.line}>
            · {l}
          </Text>
        ))}
      </View>
      {plan.technique_tips.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Driving adaptation for race day</Text>
          {plan.technique_tips.map((l, i) => (
            <Text key={i} style={styles.line}>
              🎮 {l}
            </Text>
          ))}
        </View>
      )}
      <Pressable style={styles.strategyBtn} onPress={onStrategy}>
        <Text style={styles.strategyBtnText}>⛽ Race strategy →</Text>
      </Pressable>
      <Text style={styles.reportHeader}>Setup adjustments (engineer report under forecast)</Text>
      <RunReportCard report={plan.report} />
    </ScrollView>
  );
}

interface StrategyFormProps {
  /** prefills from the plan / car / runs */
  defaults: {
    race_length_min?: number;
    race_type?: "sprint" | "endurance";
    avg_lap_s?: number;
    tank_cc?: number;
    lap_times?: number[];
  };
  onResult: (plan: PitPlan, options: PitPlan[], inputs: StrategyInputs) => void;
  onCancel: () => void;
}

export function StrategyForm({ defaults, onResult, onCancel }: StrategyFormProps) {
  const [lengthMin, setLengthMin] = useState(defaults.race_length_min !== undefined ? String(defaults.race_length_min) : "30");
  const [type, setType] = useState<"sprint" | "endurance">(defaults.race_type ?? "endurance");
  const [avgLap, setAvgLap] = useState(defaults.avg_lap_s !== undefined ? String(defaults.avg_lap_s) : "");
  const [tankCc, setTankCc] = useState(defaults.tank_cc !== undefined ? String(defaults.tank_cc) : "");
  const [burnPerLap, setBurnPerLap] = useState("");
  const [tankBurnMin, setTankBurnMin] = useState("");
  const [pitLoss, setPitLoss] = useState("25");
  const [margin, setMargin] = useState<"1" | "2" | "3">("1");
  const [error, setError] = useState<string | null>(null);

  const compute = () => {
    const inputs: StrategyInputs = {
      race_length_s: (num(lengthMin) ?? 0) * 60,
      race_type: type,
      avg_lap_s: num(avgLap) ?? 0,
      start_buffer_s: 2,
      fuel: {
        tank_cc: num(tankCc),
        burn_cc_per_lap: num(burnPerLap),
        tank_burn_s: num(tankBurnMin) !== undefined ? num(tankBurnMin)! * 60 : undefined,
      },
      pit_loss_s: num(pitLoss) ?? 25,
      margin_laps: Number(margin),
      lap_times: defaults.lap_times,
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
      <Section title="Race">
        <LabeledInput label="Race length (minutes)" value={lengthMin} onChangeText={setLengthMin} keyboardType="numeric" />
        <ChipRow options={["sprint", "endurance"] as const} value={type} onSelect={setType} />
      </Section>
      <Section title="Pace">
        <LabeledInput
          label="Average lap (s) — best average in race conditions (+2s start is added automatically)"
          value={avgLap}
          onChangeText={setAvgLap}
          keyboardType="decimal-pad"
        />
      </Section>
      <Section title="Fuel — fill tank+consumption OR time per tank">
        <LabeledInput label="Tank capacity (cc)" value={tankCc} onChangeText={setTankCc} keyboardType="numeric" placeholder="from the car profile" />
        <LabeledInput label="Consumption (cc per lap)" value={burnPerLap} onChangeText={setBurnPerLap} keyboardType="decimal-pad" placeholder="e.g. 4.2" />
        <LabeledInput label="…or time to burn a full tank (minutes)" value={tankBurnMin} onChangeText={setTankBurnMin} keyboardType="decimal-pad" placeholder="e.g. 7.5" />
      </Section>
      <Section title="Pit">
        <LabeledInput label="Time lost per pit stop (s)" value={pitLoss} onChangeText={setPitLoss} keyboardType="numeric" />
        <Text style={styles.hint}>Fuel margin (laps kept in reserve)</Text>
        <ChipRow options={["1", "2", "3"] as const} value={margin} onSelect={setMargin} />
      </Section>
      {defaults.lap_times && defaults.lap_times.length >= 8 && (
        <Text style={styles.hint}>
          ✓ {defaults.lap_times.length} logged laps available — tyre-cliff detection active (endurance).
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

export function PitPlanView({ plan, options }: { plan: PitPlan; options: PitPlan[] }) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={[styles.block, { borderColor: colors.accent }]}>
        <Text style={styles.blockTitle}>
          Plan — {plan.total_laps} laps · {plan.stops} stop{plan.stops === 1 ? "" : "s"}
          {plan.pit_driver === "tyre_cliff" ? " · pits driven by TYRE CLIFF" : ""}
        </Text>
        <View style={styles.stintRow}>
          {plan.stints.map((s, i) => (
            <React.Fragment key={i}>
              <View style={styles.stint}>
                <Text style={styles.stintLaps}>{s.laps}</Text>
                <Text style={styles.stintLabel}>laps</Text>
              </View>
              {s.pit_after && <Text style={styles.pitMark}>⛽</Text>}
            </React.Fragment>
          ))}
        </View>
        {plan.cliff_lap !== undefined && (
          <Text style={styles.line}>Tyre cliff detected around lap {plan.cliff_lap}.</Text>
        )}
        {plan.notes.map((l, i) => (
          <Text key={i} style={styles.line}>
            · {l}
          </Text>
        ))}
      </View>
      {options.map((o, i) => (
        <View key={i} style={styles.block}>
          <Text style={styles.blockTitle}>
            Option: stretch stints — {o.total_laps} laps · {o.stops} stop{o.stops === 1 ? "" : "s"}
          </Text>
          {o.notes.map((l, j) => (
            <Text key={j} style={styles.line}>
              · {l}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  block: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginHorizontal: 14,
    marginTop: 10,
  },
  blockTitle: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 6 },
  line: { color: colors.text, fontSize: 13, lineHeight: 19 },
  reportHeader: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginHorizontal: 14,
    marginTop: 16,
  },
  strategyBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
    marginHorizontal: 14,
    marginTop: 12,
  },
  strategyBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  hint: { color: colors.sub, fontSize: 12, marginTop: 8, marginBottom: 4 },
  error: { color: colors.warn, fontSize: 13, marginHorizontal: 14, marginTop: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14, marginHorizontal: 14 },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  stintRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginVertical: 8 },
  stint: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  stintLaps: { color: colors.accent, fontSize: 16, fontWeight: "900" },
  stintLabel: { color: colors.sub, fontSize: 9 },
  pitMark: { fontSize: 16 },
});
