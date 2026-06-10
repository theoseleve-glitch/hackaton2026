import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";
import { KB, MP11 } from "../kb";

interface Props {
  versionCount: number;
  activeName: string;
  sessionCount: number;
  sessionLive: boolean;
  onOpenSheet: () => void;
  onAskEngineer: () => void;
}

export function GarageScreen({
  versionCount,
  activeName,
  sessionCount,
  sessionLive,
  onOpenSheet,
  onAskEngineer,
}: Props) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>Garage</Text>

      <View style={styles.card}>
        <Text style={styles.brand}>{MP11.brand.toUpperCase()}</Text>
        <Text style={styles.model}>{MP11.model}</Text>
        <Text style={styles.meta}>
          1/8 nitro buggy · {versionCount} saved version{versionCount > 1 ? "s" : ""} · active: “{activeName}”
        </Text>
        <Text style={styles.meta}>
          {sessionCount} session{sessionCount === 1 ? "" : "s"} logged
          {sessionLive ? <Text style={styles.live}> · session live</Text> : null}
        </Text>

        <View style={styles.row}>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onOpenSheet}>
            <Text style={styles.btnPrimaryText}>Setup sheet</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={onAskEngineer}>
            <Text style={styles.btnGhostText}>Ask the engineer</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.card, styles.cardDim]}>
        <Text style={styles.addTitle}>＋ Add a car</Text>
        <Text style={styles.meta}>More chassis templates land with each KB release.</Text>
      </View>

      <Text style={styles.footer}>
        Knowledge base: {KB.rules.length} sourced tuning rules · fully offline · no API (D18)
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 28, fontWeight: "800", marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 14,
  },
  cardDim: { opacity: 0.55, alignItems: "center", paddingVertical: 26 },
  brand: { color: colors.accent, fontSize: 13, fontWeight: "700", letterSpacing: 2 },
  model: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 2 },
  meta: { color: colors.sub, fontSize: 13, marginTop: 6 },
  live: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: { borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  btnGhost: { borderWidth: 1, borderColor: colors.accent },
  btnGhostText: { color: colors.accent, fontWeight: "700" },
  addTitle: { color: colors.sub, fontSize: 16, fontWeight: "700" },
  footer: { color: colors.sub, fontSize: 12, textAlign: "center", marginTop: 10 },
});
