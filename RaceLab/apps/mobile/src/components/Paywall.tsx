/**
 * Paywall — the external-web upsell sheet. No IAP, no in-app purchase: the
 * primary action opens the web checkout (buildSubscribeUrl) in the system
 * browser; the secondary refreshes server validation for "I already paid".
 *
 * Mounted ONCE in AppInner as a dimmed Overlay; opened from any gate site via
 * usePaywall().open(reason). The advisor / first car / app launch are NEVER
 * routed here (D18) — only the explicitly gated premium actions are.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Overlay } from "./Overlay";
import { colors, radius, spacing } from "../theme";
import { useT } from "../i18n";
import type { Phrase } from "../i18n";
import { useEntitlement } from "../entitlements";
import type { DenialReason } from "../entitlements";

/** The premium feature list shown in the sheet (advisor is FREE — not listed). */
const PREMIUM_LINES: Phrase[] = [
  { en: "Unlimited cars in your garage", fr: "Voitures illimitées dans ton garage" },
  { en: "Race planner & pit strategy", fr: "Préparateur de course & stratégie d'arrêts" },
  { en: "Auto-weather from the track GPS", fr: "Météo auto depuis le GPS de la piste" },
  { en: "Speedhive run import", fr: "Import des sessions Speedhive" },
  { en: "Full setup version history", fr: "Historique complet des versions de réglages" },
  { en: "PDF / poster export of reports", fr: "Export PDF / poster des rapports" },
];

interface PaywallCtx {
  open: (reason?: DenialReason) => void;
}
const Ctx = createContext<PaywallCtx>({ open: () => {} });

/** Open the paywall from any gate site. */
export function usePaywall(): PaywallCtx {
  return useContext(Ctx);
}

/**
 * Mounts the paywall sheet and provides usePaywall().open. Place inside
 * AppInner so it darkens the app body; the tab bar stays usable (Overlay
 * renders inside the body, like every other sheet).
 */
export function PaywallProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<{ visible: boolean; reason?: DenialReason }>({ visible: false });
  const open = useCallback((reason?: DenialReason) => setState({ visible: true, reason }), []);
  const close = useCallback(() => setState({ visible: false }), []);
  const ctx = useMemo<PaywallCtx>(() => ({ open }), [open]);

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <Overlay visible={state.visible} dim>
        <PaywallSheet reason={state.reason} onClose={close} />
      </Overlay>
    </Ctx.Provider>
  );
}

function headlineFor(reason: DenialReason | undefined): Phrase {
  switch (reason) {
    case "trial_expired":
      return { en: "Your free trial is over", fr: "Ton essai gratuit est terminé" };
    case "subscription_expired":
      return { en: "Your subscription expired", fr: "Ton abonnement a expiré" };
    default:
      return { en: "Unlock RaceLab Pro", fr: "Débloque RaceLab Pro" };
  }
}

function subFor(reason: DenialReason | undefined): Phrase {
  switch (reason) {
    case "trial_expired":
      return {
        en: "Subscribe on the web to keep planning, importing and exporting. The setup engineer stays free forever.",
        fr: "Abonne-toi sur le web pour continuer à planifier, importer et exporter. L'ingénieur de réglages reste gratuit pour toujours.",
      };
    case "subscription_expired":
      return {
        en: "Renew on the web to restore Pro features. The setup engineer stays free forever.",
        fr: "Renouvelle sur le web pour retrouver les fonctions Pro. L'ingénieur de réglages reste gratuit pour toujours.",
      };
    default:
      return {
        en: "This is a Pro feature. The setup engineer is always free — this unlocks the rest.",
        fr: "C'est une fonction Pro. L'ingénieur de réglages est toujours gratuit — ceci débloque le reste.",
      };
  }
}

/** The sheet itself. Drives subscribe/refresh from a top-level entitlement. */
function PaywallSheet({ reason, onClose }: { reason?: DenialReason; onClose: () => void }) {
  const t = useT();
  // any non-free feature exposes the same openSubscribe/validateNow; multi_car
  // is a stable representative (never advisor — that would short-circuit).
  const ent = useEntitlement("multi_car");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await ent.validateNow();
    } finally {
      setRefreshing(false);
    }
    onClose();
  };

  return (
    <View style={styles.card}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
        <Text style={styles.kicker}>{t({ en: "RACELAB PRO", fr: "RACELAB PRO" })}</Text>
        <Text style={styles.headline}>{t(headlineFor(reason))}</Text>
        <Text style={styles.sub}>{t(subFor(reason))}</Text>

        <View style={styles.list}>
          {PREMIUM_LINES.map((line, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.check}>✓</Text>
              <Text style={styles.listText}>{t(line)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.webNote}>
          {t({
            en: "Web billing skips app-store fees — the same plan costs less there.",
            fr: "La facturation web évite les frais des stores — le même forfait y coûte moins cher.",
          })}
        </Text>

        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={ent.openSubscribe}>
          <Text style={styles.btnPrimaryText}>{t({ en: "Subscribe on the web ↗", fr: "S'abonner sur le web ↗" })}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => void onRefresh()} disabled={refreshing}>
          <Text style={styles.btnGhostText}>
            {refreshing
              ? t({ en: "Checking…", fr: "Vérification…" })
              : t({ en: "I already paid — refresh", fr: "J'ai déjà payé — actualiser" })}
          </Text>
        </Pressable>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
          <Text style={styles.closeText}>{t({ en: "Not now", fr: "Plus tard" })}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    maxHeight: "92%",
    overflow: "hidden",
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: spacing.sm,
  },
  headline: { color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: spacing.sm },
  sub: { color: colors.sub, fontSize: 14, lineHeight: 20, marginBottom: spacing.lg },
  list: { gap: spacing.sm, marginBottom: spacing.lg },
  listRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  check: { color: colors.good, fontSize: 14, fontWeight: "900", marginTop: 1 },
  listText: { color: colors.text, fontSize: 14, lineHeight: 19, flex: 1 },
  webNote: { color: colors.sub, fontSize: 12, fontStyle: "italic", lineHeight: 17, marginBottom: spacing.lg },
  btn: { borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginBottom: spacing.md },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.onAccent, fontWeight: "800", fontSize: 15 },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  closeBtn: { alignItems: "center", paddingVertical: spacing.sm },
  closeText: { color: colors.sub, fontSize: 13 },
});
