import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

/**
 * In-body replacement for full-screen <Modal> (Théo's pass: the tab bar must
 * stay tappable whatever form is open). Renders as an absolute overlay INSIDE
 * the screen's body — the App-level tab bar lives outside it, so switching
 * sections always works; the overlay simply unmounts with its screen.
 */
export function Overlay({ visible, children, dim }: { visible: boolean; children: React.ReactNode; dim?: boolean }) {
  if (!visible) return null;
  return <View style={[styles.fill, dim ? styles.dim : styles.solid]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 },
  solid: { backgroundColor: colors.bg },
  dim: { backgroundColor: "rgba(14, 15, 18, 0.88)", justifyContent: "center", padding: 20 },
});
