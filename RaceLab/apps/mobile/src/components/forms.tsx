import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius } from "../theme";

/** Small shared form primitives for trackside data entry: big tap targets,
 *  chips over keyboards wherever possible (dirty hands, 10 min to the heat). */

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ChipRow<T extends string>({
  options,
  value,
  onSelect,
  labelFor,
}: {
  options: readonly T[];
  value: T | undefined;
  onSelect: (v: T) => void;
  labelFor?: (v: T) => string;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => (
        <Pressable
          key={o}
          style={[styles.chip, value === o && styles.chipActive]}
          onPress={() => onSelect(o)}
        >
          <Text style={[styles.chipText, value === o && styles.chipTextActive]}>
            {labelFor ? labelFor(o) : o.replace(/_/g, " ")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MultiChipRow<T extends string>({
  options,
  values,
  onToggle,
  labelFor,
}: {
  options: readonly T[];
  values: readonly T[];
  onToggle: (v: T) => void;
  labelFor?: (v: T) => string;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = values.includes(o);
        return (
          <Pressable
            key={o}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onToggle(o)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {labelFor ? labelFor(o) : o.replace(/_/g, " ")}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
}) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.sub}
        keyboardType={keyboardType ?? "default"}
      />
    </View>
  );
}

/** Parse a numeric field that may legitimately be empty. */
export function num(text: string): number | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

const styles = StyleSheet.create({
  section: { marginBottom: 14 },
  sectionTitle: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    backgroundColor: colors.cardAlt,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.sub, fontSize: 12 },
  chipTextActive: { color: colors.accent, fontWeight: "700" },
  inputWrap: { marginBottom: 8 },
  inputLabel: { color: colors.sub, fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
});
