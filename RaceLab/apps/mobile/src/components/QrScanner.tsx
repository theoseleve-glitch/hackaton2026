import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { SharedPayload } from "../../../../packages/social/src";
import { linkToPayload } from "../../../../packages/social/src";
import { colors, radius } from "../theme";

/**
 * Trackside QR import (Expo Go camera). Scans a griplab://import?d=… code, parses
 * it with packages/social linkToPayload, and hands a SharedPayload up. Works with
 * zero signal — two phones in the pits.
 */
export function QrScanner({ onScanned, onClose }: { onScanned: (p: SharedPayload) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const onBarcode = ({ data }: { data: string }) => {
    if (handled.current) return;
    const res = linkToPayload(data);
    if (res.ok) {
      handled.current = true;
      onScanned(res.payload);
    } else {
      setError("That QR isn't a RaceLab setup.");
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>‹ Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Scan a setup</Text>
        <View style={{ width: 60 }} />
      </View>

      {!permission ? (
        <View style={styles.center}>
          <Text style={styles.msg}>Checking camera…</Text>
        </View>
      ) : !permission.granted ? (
        <View style={styles.center}>
          <Text style={styles.msg}>RaceLab needs the camera to scan a setup QR.</Text>
          <Pressable style={styles.btn} onPress={() => void requestPermission()}>
            <Text style={styles.btnText}>Allow camera</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onBarcode}
          />
          <View style={styles.reticle} pointerEvents="none" />
          <Text style={styles.hint}>{error ?? "Point at the other racer's RaceLab QR"}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  title: { color: colors.text, fontSize: 16, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 16 },
  msg: { color: colors.sub, fontSize: 14, textAlign: "center", lineHeight: 20 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 22 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  reticle: {
    position: "absolute",
    top: "30%",
    left: "20%",
    width: "60%",
    height: 260,
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: radius.lg,
  },
  hint: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    color: colors.text,
    fontSize: 13,
    backgroundColor: "rgba(14,15,18,0.8)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    overflow: "hidden",
  },
});
