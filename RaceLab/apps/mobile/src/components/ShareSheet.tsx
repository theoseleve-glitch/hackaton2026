import React, { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import type Svg from "react-native-svg";
import type { SharedPayload } from "../../../../packages/social/src";
import { payloadToLink } from "../../../../packages/social/src";
import { copyLink, shareFile, shareLink, sharePng } from "../share";
import { colors, radius } from "../theme";
import { useT } from "../i18n";
import { ShareCard } from "./ShareCard";

/**
 * Transport picker for a SharedPayload (Théo's social slice): Link · QR · File ·
 * Card. The card is captured to PNG from an off-screen <ShareCard> via the Svg
 * ref's toDataURL. QR encodes the same import deep link; oversized payloads fall
 * back to link/file (QR tops out ~2-3KB).
 */

const QR_MAX = 2200; // chars — practical QR ceiling at ECC level M

export function ShareSheet({ payload, onClose }: { payload: SharedPayload | null; onClose: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<"menu" | "qr">("menu");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<Svg>(null);

  if (!payload) return null;
  const link = payloadToLink(payload);
  const qrTooBig = link.length > QR_MAX;

  const captureCard = () => {
    const svg = cardRef.current;
    if (!svg) return;
    setBusy(true);
    svg.toDataURL((b64: string) => {
      void sharePng(b64, payload.setup.name).finally(() => setBusy(false));
    });
  };

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {mode === "qr" ? (
          <View style={styles.qrBox}>
            <Text style={styles.title}>{t({ en: "Scan to import", fr: "Scanner pour importer" })}</Text>
            {qrTooBig ? (
              <Text style={styles.warn}>{t({ en: "This setup is too big for a QR — use Link or File instead.", fr: "Ce réglage est trop lourd pour un QR — passe par Lien ou Fichier." })}</Text>
            ) : (
              <View style={styles.qrFrame}>
                <QRCode value={link} size={240} backgroundColor="#ffffff" color="#000000" ecl="M" />
              </View>
            )}
            <Text style={styles.sub}>{t({ en: "Another racer scans it from Tracks → import (no signal needed).", fr: "Un autre pilote le scanne depuis Pistes → importer (aucun réseau nécessaire)." })}</Text>
            <Pressable style={[styles.btn, styles.ghost]} onPress={() => setMode("menu")}>
              <Text style={styles.ghostText}>{t({ en: "‹ Back", fr: "‹ Retour" })}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.title}>{t({ en: "Share setup", fr: "Partager le réglage" })}</Text>
            <Text style={styles.sub}>
              {payload.car.brand} {payload.car.model} · {payload.setup.name}
            </Text>
            <Row icon="🔗" label={t({ en: "Share link", fr: "Partager le lien" })} hint={t({ en: "WhatsApp, Messages…", fr: "WhatsApp, Messages…" })} onPress={() => void shareLink(payload)} />
            <Row
              icon="📋"
              label={copied ? t({ en: "Copied!", fr: "Copié !" }) : t({ en: "Copy link", fr: "Copier le lien" })}
              hint={t({ en: "paste anywhere", fr: "à coller n’importe où" })}
              onPress={() => void copyLink(payload).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            />
            <Row icon="🔲" label={t({ en: "Show QR", fr: "Afficher le QR" })} hint={t({ en: "trackside, zero signal", fr: "au bord de piste, sans réseau" })} onPress={() => setMode("qr")} />
            <Row icon="📄" label={t({ en: "Export file", fr: "Exporter le fichier" })} hint={t({ en: ".griplab — AirDrop, Drive", fr: ".griplab — AirDrop, Drive" })} onPress={() => void shareFile(payload)} />
            <Row
              icon="🖼"
              label={busy ? t({ en: "Rendering…", fr: "Génération…" }) : t({ en: "Share card", fr: "Partager la carte" })}
              hint={t({ en: "post your session", fr: "publie ta session" })}
              onPress={captureCard}
              busy={busy}
            />
            <Pressable style={[styles.btn, styles.ghost]} onPress={onClose}>
              <Text style={styles.ghostText}>{t({ en: "Close", fr: "Fermer" })}</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* off-screen card, mounted so toDataURL can capture it */}
      <View style={styles.offscreen} pointerEvents="none">
        <ShareCard ref={cardRef} payload={payload} />
      </View>
    </View>
  );
}

function Row({ icon, label, hint, onPress, busy }: { icon: string; label: string; hint: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={busy}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.chev}>›</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 30, justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(14,15,18,0.7)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: 18,
    paddingBottom: 28,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  sub: { color: colors.sub, fontSize: 12, marginTop: 2, marginBottom: 12 },
  warn: { color: colors.warn, fontSize: 13, textAlign: "center", marginVertical: 24, paddingHorizontal: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  rowIcon: { fontSize: 22 },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowHint: { color: colors.sub, fontSize: 11, marginTop: 1 },
  chev: { color: colors.sub, fontSize: 22 },
  btn: { borderRadius: radius.md, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  ghost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  qrBox: { alignItems: "center" },
  qrFrame: { backgroundColor: "#fff", padding: 16, borderRadius: radius.md, marginVertical: 16 },
  offscreen: { position: "absolute", left: -10000, top: 0, width: 1080, height: 1350 },
});
