import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { lapStats } from "../../../../packages/logbook/src";
import { colors, radius } from "../theme";
import { num } from "./forms";

/**
 * Individual lap times, one decimal-pad input at a time (D27). Laps render
 * as removable chips; best/avg derive on demand via lapStats — never written
 * back into the manual best/avg fields (the user's typed values always win).
 */

export function LapListInput({
  laps,
  onChange,
}: {
  laps: number[];
  onChange: (laps: number[]) => void;
}) {
  const [text, setText] = useState("");

  const add = () => {
    const v = num(text);
    if (v === undefined || v <= 0) return;
    onChange([...laps, v]);
    setText("");
  };

  const stats = laps.length > 0 ? lapStats(laps) : null;

  return (
    <View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          placeholder="lap time (s)"
          placeholderTextColor={colors.sub}
          onSubmitEditing={add}
          blurOnSubmit={false}
        />
        <Pressable style={styles.addBtn} onPress={add}>
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>
      {laps.length > 0 && (
        <View style={styles.chipRow}>
          {laps.map((lap, i) => (
            <Pressable
              key={`${i}-${lap}`}
              style={styles.lapChip}
              onPress={() => onChange(laps.filter((_, j) => j !== i))}
            >
              <Text style={styles.lapChipText}>{lap.toFixed(2)} ✕</Text>
            </Pressable>
          ))}
        </View>
      )}
      {stats && (
        <Text style={styles.derived}>
          best {stats.best.toFixed(2)} · avg {stats.avg.toFixed(2)} from {laps.length} laps
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    width: 40,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontSize: 20, fontWeight: "800", lineHeight: 22 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  lapChip: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  lapChipText: { color: colors.text, fontSize: 12 },
  derived: { color: colors.sub, fontSize: 12, marginTop: 6 },
});
