import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

/**
 * Podium celebration (driver feedback pass): a competitive run saved with
 * P1–P3 earns ~2 seconds of glory — trophy pops in, confetti falls, then the
 * splash dismisses itself. Pure Animated API, no dependency.
 */

const MEDAL: Record<number, { icon: string; line: string; tone: string }> = {
  1: { icon: "🏆", line: "WINNER — P1", tone: "#FFD700" },
  2: { icon: "🥈", line: "PODIUM — P2", tone: "#C7CCD1" },
  3: { icon: "🥉", line: "PODIUM — P3", tone: "#D08A4E" },
};

const CONFETTI_COLORS = [colors.accent, "#FFD700", "#3DDC84", "#9D6BFF", "#4DA6FF"];
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

export function PodiumSplash({ position, onDone }: { position: number; onDone: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const confetti = useRef(new Animated.Value(0)).current;
  const medal = MEDAL[position] ?? MEDAL[3];

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
        <Text style={styles.icon}>{medal.icon}</Text>
        <Text style={[styles.line, { color: medal.tone }]}>{medal.line}</Text>
        <Text style={styles.sub}>logged to your record</Text>
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
    backgroundColor: "rgba(14, 15, 18, 0.82)",
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
