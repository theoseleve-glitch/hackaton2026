import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { ChipRow } from "./forms";

/**
 * Driver-feel slider (D27): no keyboard, no dependency — a row of tappable
 * color segments, red ("fighting it") through green ("ok/confident") to
 * violet ("in the zone"). One thumb-tap trackside sets the whole feeling.
 */

const SEGMENTS = 22;

/** red → green → violet; linear RGB lerp between stops 0 / 50 / 100. */
export function feelingColor(value: number): string {
  const v = Math.max(0, Math.min(100, value));
  const lo: [number, number, number] = v <= 50 ? [0xe5, 0x48, 0x4d] : [0x3d, 0xdc, 0x84];
  const hi: [number, number, number] = v <= 50 ? [0x3d, 0xdc, 0x84] : [0x9d, 0x6b, 0xff];
  const t = v <= 50 ? v / 50 : (v - 50) / 50;
  return `#${lo
    .map((a, i) => Math.round(a + (hi[i] - a) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

function feelingLabel(v: number): string {
  if (v < 35) return "fighting it";
  if (v <= 65) return "ok";
  if (v <= 85) return "confident";
  return "in the zone";
}

export function FeelingSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const selected = Math.round((Math.max(0, Math.min(100, value)) / 100) * (SEGMENTS - 1));
  return (
    <View>
      <View style={styles.row}>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const v = Math.round((i / (SEGMENTS - 1)) * 100);
          const isKnob = i === selected;
          return (
            <Pressable
              key={i}
              style={styles.segWrap}
              hitSlop={{ top: 10, bottom: 10 }}
              onPress={() => onChange(v)}
            >
              <View
                style={[styles.seg, { backgroundColor: feelingColor(v) }, isKnob && styles.knob]}
              />
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.label, { color: feelingColor(value) }]}>
        {feelingLabel(value)} · {Math.round(value)}
      </Text>
    </View>
  );
}

/** Driver fatigue, 1 (fresh) … 5 (exhausted) — battery chips, discharging
 *  left to right: a full green cell means fresh, a near-empty red one means
 *  cooked. One glance, no reading. */
const FATIGUE = [
  { level: 1, fill: 1.0, color: "#3DDC84" },
  { level: 2, fill: 0.75, color: "#9CCA59" },
  { level: 3, fill: 0.5, color: colors.warn },
  { level: 4, fill: 0.3, color: "#F47B3A" },
  { level: 5, fill: 0.12, color: "#E5484D" },
] as const;

function Battery({ fill, color }: { fill: number; color: string }) {
  return (
    <View style={styles.batteryRow}>
      <View style={styles.batteryBody}>
        <View style={[styles.batteryFill, { width: `${fill * 100}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.batteryCap} />
    </View>
  );
}

export function FatigueRow({
  value,
  onChange,
}: {
  value?: number;
  onChange: (v: number) => void;
}) {
  return (
    <View>
      <View style={styles.fatigueRow}>
        {FATIGUE.map((f) => (
          <Pressable
            key={f.level}
            style={[styles.fatigueChip, value === f.level && styles.fatigueChipOn]}
            onPress={() => onChange(f.level)}
          >
            <Battery fill={f.fill} color={f.color} />
          </Pressable>
        ))}
      </View>
      <View style={styles.fatigueCaption}>
        <Text style={styles.fatigueCaptionText}>fresh</Text>
        <Text style={styles.fatigueCaptionText}>cooked</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", height: 28, gap: 2 },
  segWrap: { flex: 1, alignItems: "center", justifyContent: "center", height: 28 },
  seg: { width: "100%", height: 10, borderRadius: 3 },
  knob: {
    height: 24,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.text,
  },
  label: { fontSize: 12, fontWeight: "700", marginTop: 6 },
  fatigueRow: { flexDirection: "row", gap: 6 },
  fatigueChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
  },
  fatigueChipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  batteryRow: { flexDirection: "row", alignItems: "center" },
  batteryBody: {
    width: 26,
    height: 13,
    borderWidth: 1.5,
    borderColor: colors.sub,
    borderRadius: 3,
    padding: 1.5,
    justifyContent: "center",
  },
  batteryFill: { height: "100%", borderRadius: 1.5 },
  batteryCap: { width: 2.5, height: 6, backgroundColor: colors.sub, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  fatigueCaption: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingHorizontal: 4 },
  fatigueCaptionText: { color: colors.sub, fontSize: 10 },
});
