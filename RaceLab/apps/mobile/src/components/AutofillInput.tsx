import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { suggest } from "../rcdata";
import { colors, radius } from "../theme";

/**
 * Text input with offline autofill (Théo's pass 3): from the first letters,
 * the 3-4 most probable candidates from the bundled RC dataset render as
 * tappable rows under the field. Free text always wins — suggestions help,
 * never constrain.
 */
export function AutofillInput({
  label,
  value,
  onChangeText,
  pool,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  /** candidate pool, or a provider so callers can scope it (models for brand…) */
  pool: string[] | (() => string[]);
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
}) {
  const [focused, setFocused] = useState(false);
  const candidates = useMemo(
    () => (focused ? suggest(value, typeof pool === "function" ? pool() : pool) : []),
    [focused, value, pool],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.sub}
        keyboardType={keyboardType ?? "default"}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {candidates.length > 0 && (
        <View style={styles.drop}>
          {candidates.map((c) => (
            <Pressable
              key={c}
              style={styles.row}
              onPress={() => {
                onChangeText(c);
                setFocused(false);
              }}
            >
              <Text style={styles.rowText}>{c}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: { color: colors.sub, fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  drop: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    marginTop: 4,
    overflow: "hidden",
  },
  row: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowText: { color: colors.text, fontSize: 14 },
});
