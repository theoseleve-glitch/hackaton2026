import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius } from "../theme";

/** Slim trial-status banner. Hidden while the trial is comfortably long
 *  (>10 days), urgent styling for the last 3 days. */
export function TrialBanner({ daysLeft, onPress }: { daysLeft: number; onPress?: () => void }) {
  if (daysLeft > 10) return null;
  const urgent = daysLeft <= 3;
  return (
    <Pressable
      style={[styles.banner, urgent && styles.bannerUrgent]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={[styles.text, urgent && styles.textUrgent]}>
        Trial · {daysLeft} {daysLeft === 1 ? "day" : "days"} left · subscribe on racelab.app
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  bannerUrgent: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  text: { color: colors.sub, fontSize: 12, fontWeight: "600" },
  textUrgent: { color: colors.warn, fontWeight: "700" },
});
