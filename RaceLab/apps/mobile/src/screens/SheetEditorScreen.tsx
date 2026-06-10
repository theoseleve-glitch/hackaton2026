import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius } from "../theme";
import { MP11, label } from "../kb";

/**
 * Schema-driven sheet editor: the form below is 100% rendered from the
 * chassis template JSON (D5) — adding a chassis is data, not code.
 */

type Setup = Record<string, string | number>;

interface Props {
  setup: Setup;
  onChange: (id: string, value: string | number) => void;
}

const SECTIONS: { title: string; match: (id: string) => boolean }[] = [
  { title: "Differentials", match: (id) => id.includes("diff") },
  { title: "Shocks & springs", match: (id) => id.includes("shock") || id.includes("spring") },
  {
    title: "Geometry",
    match: (id) =>
      /camber|toe|caster|ride_height|downstop|kickup|anti_squat|wheelbase|track_width|ackermann|roll_center/.test(id),
  },
  { title: "Bars & wing", match: (id) => id.includes("sway") || id.includes("wing") },
  { title: "Drivetrain", match: (id) => /gearing|clutch|spur/.test(id) },
];

interface FieldDef {
  type: string;
  unit?: string;
  options?: (string | number)[];
  range?: [number, number];
  step?: number;
}

export function SheetEditorScreen({ setup, onChange }: Props) {
  const fields = Object.entries(MP11.fields).filter(
    ([, f]) => (f as FieldDef).type !== "alias" && (f as FieldDef).type !== "derived",
  ) as [string, FieldDef][];

  const used = new Set<string>();
  const grouped = SECTIONS.map((s) => ({
    title: s.title,
    fields: fields.filter(([id]) => {
      if (used.has(id) || !s.match(id)) return false;
      used.add(id);
      return true;
    }),
  }));
  grouped.push({ title: "Other", fields: fields.filter(([id]) => !used.has(id)) });

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.h1}>
        {MP11.model} <Text style={styles.h1Sub}>setup sheet</Text>
      </Text>
      {grouped.map(
        (section) =>
          section.fields.length > 0 && (
            <View key={section.title}>
              <Text style={styles.section}>{section.title}</Text>
              {section.fields.map(([id, field]) => (
                <Field key={id} id={id} field={field} value={setup[id]} onChange={onChange} />
              ))}
            </View>
          ),
      )}
    </ScrollView>
  );
}

function Field({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: FieldDef;
  value: string | number | undefined;
  onChange: (id: string, value: string | number) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label(id)}
        {field.unit ? <Text style={styles.unit}>  {field.unit}</Text> : null}
      </Text>
      {field.options ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            {field.options.map((opt) => {
              const active = value === opt;
              return (
                <Pressable
                  key={String(opt)}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => onChange(id, opt)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {String(opt)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : field.range ? (
        <Stepper id={id} field={field} value={value} onChange={onChange} />
      ) : (
        <TextInput
          style={styles.input}
          value={value === undefined ? "" : String(value)}
          placeholder="—"
          placeholderTextColor={colors.sub}
          onChangeText={(t) => onChange(id, t)}
        />
      )}
    </View>
  );
}

function Stepper({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: FieldDef;
  value: string | number | undefined;
  onChange: (id: string, value: number) => void;
}) {
  const [min, max] = field.range!;
  const step = field.step ?? 1;
  const current = typeof value === "number" ? value : Number(value ?? min) || min;
  const set = (v: number) => onChange(id, Math.round(Math.min(max, Math.max(min, v)) * 100) / 100);
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepBtn} onPress={() => set(current - step)}>
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>
        {current}
        {field.unit ? <Text style={styles.unit}> {field.unit}</Text> : null}
      </Text>
      <Pressable style={styles.stepBtn} onPress={() => set(current + step)}>
        <Text style={styles.stepBtnText}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 4 },
  h1Sub: { color: colors.sub, fontWeight: "500" },
  section: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 22,
    marginBottom: 8,
  },
  field: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  label: { color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 8 },
  unit: { color: colors.sub, fontSize: 12, fontWeight: "400" },
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
  stepper: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepBtn: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    width: 40,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: { color: colors.accent, fontSize: 18, fontWeight: "700" },
  stepValue: { color: colors.text, fontSize: 16, fontWeight: "700", minWidth: 70, textAlign: "center" },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
});
