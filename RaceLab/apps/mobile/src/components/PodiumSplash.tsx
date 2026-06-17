import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { useT, type Phrase } from "../i18n";

/**
 * Celebration splash (driver feedback pass): a competitive run saved with
 * P1–P3 — or a new personal-best lap — earns ~2 seconds of glory: the icon
 * pops in, confetti falls, then the splash dismisses itself. Pure Animated
 * API, no dependency. Pass `position` for a podium, or `record` for any other
 * milestone (PB lap, first win, …).
 */

export interface Celebration {
  icon: string;
  line: string;
  tone: string;
  sub?: string;
}

// Podium medals: `line` is a Phrase translated at render time (this map lives
// at module scope, so it can't call the reactive translator hook itself).
type Medal = { icon: string; line: Phrase; tone: string };
const MEDAL: Record<number, Medal> = {
  1: { icon: "🏆", line: { en: "WINNER — P1", fr: "VAINQUEUR — P1" }, tone: colors.gold },
  2: { icon: "🥈", line: { en: "PODIUM — P2", fr: "PODIUM — P2" }, tone: "#C7CCD1" },
  3: { icon: "🥉", line: { en: "PODIUM — P3", fr: "PODIUM — P3" }, tone: "#D08A4E" },
};

const CONFETTI_COLORS = [colors.accent, colors.gold, colors.good, "#9D6BFF", "#4DA6FF"];
const CONFETTI_COUNT = 14;

function ConfettiDot({ index, progress }: { index: number; progress: Animated.Value }) {
  // deterministic per-index spread — no Math.random so re-renders are stable
  const leftPct = (index * 37 + 11) % 100;
  const drift = ((index * 53) % 40) - 20;
  const delay = (index % 5) / 5;
  const fall = progress.interpolate({
    inputRange: [delay * 0.4, 1],
    outputRange: [-30, 420 + ((index * 29) % 80)],
    extrapolate: "clamp",
  });
  const sway = progress.interpolate({ inputRange: [0, 1], outputRange: [0, drift] });
  const spin = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${(index % 2 ? 1 : -1) * (180 + index * 40)}deg`],
  });
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          left: `${leftPct}%`,
          backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
          transform: [{ translateY: fall }, { translateX: sway }, { rotate: spin }],
        },
      ]}
    />
  );
}

export function PodiumSplash({
  position,
  record,
  onDone,
}: {
  position?: number;
  record?: Celebration;
  onDone: () => void;
}) {
  const t = useT();
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const confetti = useRef(new Animated.Value(0)).current;
  const podium = MEDAL[position ?? 3] ?? MEDAL[3];
  // A custom `record` (already-translated strings from the caller) wins over the
  // default podium medal, whose line is a Phrase we translate here.
  const icon = record?.icon ?? podium.icon;
  const line = record?.line ?? t(podium.line);
  const tone = record?.tone ?? podium.tone;
  const sub = record?.sub ?? t({ en: "logged to your record", fr: "ajouté à ton palmarès" });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.timing(confetti, {
        toValue: 1,
        duration: 1900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
    const dismiss = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => onDone());
    }, 2200);
    return () => clearTimeout(dismiss);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.overlay, { opacity: fade }]} pointerEvents="none">
      {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
        <ConfettiDot key={i} index={i} progress={confetti} />
      ))}
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={[styles.line, { color: tone }]}>{line}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  card: { alignItems: "center" },
  icon: { fontSize: 64 },
  line: { fontSize: 22, fontWeight: "900", letterSpacing: 1.5, marginTop: 10 },
  sub: { color: colors.sub, fontSize: 12, marginTop: 6 },
  dot: { position: "absolute", top: 0, width: 8, height: 12, borderRadius: 2 },
});
