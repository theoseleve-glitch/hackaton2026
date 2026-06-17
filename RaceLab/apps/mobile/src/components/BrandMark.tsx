import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";
import { colors } from "../theme";

/**
 * The RaceLab primary mark — the "R-plate badge" (brand v1, see
 * docs/superpowers/specs/2026-06-17-racelab-brand-identity-design.md). A flat
 * carbon plate, a machined steel outline with a thin inner bevel, a bold R, and
 * a single Race-Red sensor square top-right. Rendered as react-native-svg so it
 * is crisp at every size and capturable inside the share/report/profile cards
 * (same toDataURL contract). NO chrome gradient — premium-motorsport flat.
 *
 * The glyph uses a bold system font (no expo-font dependency); adopting Chakra
 * Petch in-app is a later polish step that only sharpens the letterform.
 */

const CARBON = "#0B0C0E";
const STEEL = colors.steel ?? "#5B626C";
const BEVEL = "#23272E";
const INK = colors.text; // #ECEFF2
const RED = colors.accent; // #E10600

export function BrandMark({ size = 40 }: { size?: number }) {
  // Authored in a 64-unit box, scaled by the SVG viewBox.
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="RaceLab">
      <Rect x={3} y={3} width={58} height={58} rx={15} fill={CARBON} stroke={STEEL} strokeWidth={1.5} />
      <Rect x={5.2} y={5.2} width={53.6} height={53.6} rx={13} fill="none" stroke={BEVEL} strokeWidth={1} />
      <SvgText
        x={31}
        y={46}
        fontSize={40}
        fontWeight="700"
        textAnchor="middle"
        fill={INK}
      >
        R
      </SvgText>
      <Rect x={44} y={11} width={9} height={9} rx={2.4} fill={RED} />
    </Svg>
  );
}

/**
 * Horizontal lockup: the plate badge + the "RaceLab" wordmark (Race in ink, Lab
 * in Race-Red), the canonical in-app brand signature. `wordColor` overrides the
 * "Race" half for use on coloured backgrounds.
 */
export function BrandLockup({
  size = 30,
  fontSize = 20,
  wordColor = INK,
}: {
  size?: number;
  fontSize?: number;
  wordColor?: string;
}) {
  return (
    <View style={styles.lockup}>
      <BrandMark size={size} />
      <Text style={[styles.word, { fontSize, color: wordColor }]}>
        Race<Text style={{ color: RED }}>Lab</Text>
      </Text>
    </View>
  );
}

/**
 * The mark as embeddable SVG primitives (a positioned <G>), for drawing INSIDE
 * an existing react-native-svg canvas — e.g. the share/report/profile PNG card
 * watermarks. Pass the top-left corner (x, y) and a pixel size; the 64-unit
 * artwork is scaled to fit. Use instead of a bare accent dot so exported cards
 * carry the real badge.
 */
export function BrandBadgeGlyph({ x, y, size }: { x: number; y: number; size: number }) {
  const s = size / 64;
  return (
    <G transform={`translate(${x}, ${y}) scale(${s})`}>
      <Rect x={3} y={3} width={58} height={58} rx={15} fill={CARBON} stroke={STEEL} strokeWidth={1.5} />
      <Rect x={5.2} y={5.2} width={53.6} height={53.6} rx={13} fill="none" stroke={BEVEL} strokeWidth={1} />
      <SvgText x={31} y={46} fontSize={40} fontWeight="700" textAnchor="middle" fill={INK}>
        R
      </SvgText>
      <Rect x={44} y={11} width={9} height={9} rx={2.4} fill={RED} />
    </G>
  );
}

const styles = StyleSheet.create({
  lockup: { flexDirection: "row", alignItems: "center", gap: 8 },
  word: { fontWeight: "800", letterSpacing: 0.3 },
});
