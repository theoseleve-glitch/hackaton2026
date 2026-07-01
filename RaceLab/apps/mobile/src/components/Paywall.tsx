/**
 * Paywall — the in-app purchase (Google Play Billing via RevenueCat) upsell
 * sheet. The primary actions present the NATIVE purchase sheet for the monthly
 * / annual plan (ent.purchase); the secondary restores prior purchases
 * (ent.restore). Fully ANONYMOUS — no sign-in, no pay-without-unlock: a
 * completed purchase unlocks immediately because the entitlement comes straight
 * from RevenueCat's customerInfo (see src/iap.ts + src/entitlements.tsx).
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
        en: "Subscribe to keep planning, importing and exporting. The setup engineer stays free forever.",
        fr: "Abonne-toi pour continuer à planifier, importer et exporter. L'ingénieur de réglages reste gratuit pour toujours.",
      };
    case "subscription_expired":
      return {
        en: "Renew to restore Pro features. The setup engineer stays free forever.",
        fr: "Renouvelle pour retrouver les fonctions Pro. L'ingénieur de réglages reste gratuit pour toujours.",
      };
    default:
      return {
        en: "This is a Pro feature. The setup engineer is always free — this unlocks the rest.",
        fr: "C'est une fonction Pro. L'ingénieur de réglages est toujours gratuit — ceci débloque le reste.",
      };
  }
}

/** The sheet itself. Drives native purchase + restore from a top-level
 *  entitlement (Google Play Billing via RevenueCat). */
function PaywallSheet({ reason, onClose }: { reason?: DenialReason; onClose: () => void }) {
  const t = useT();
  // any non-free feature exposes the same purchase/restore; multi_car is a
  // stable representative (never advisor — that would short-circuit).
  const ent = useEntitlement("multi_car");
  const [busy, setBusy] = useState<null | "monthly" | "annual" | "restore">(null);
  const [error, setError] = useState<Phrase | null>(null);

  const onBuy = (plan: "monthly" | "annual") => async () => {
    if (busy !== null) return;
    setBusy(plan);
    setError(null);
    try {
      const ok = await ent.purchase(plan);
      if (ok) onClose();
      // not ok → user cancelled (do nothing) or it failed; surface a hint only
      // if it actually errored (cancel leaves no entitlement and no message).
    } catch {
      setError({
        en: "Couldn't complete the purchase. Please try again.",
        fr: "Impossible de finaliser l'achat. Réessaie.",
      });
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async () => {
    if (busy !== null) return;
    setBusy("restore");
    setError(null);
    try {
      const ok = await ent.restore();
      if (ok) onClose();
      else
        setError({
          en: "No previous purchase found on this Google account.",
          fr: "Aucun achat précédent trouvé sur ce compte Google.",
        });
    } catch {
      setError({
        en: "Couldn't restore purchases. Please try again.",
        fr: "Impossible de restaurer les achats. Réessaie.",
      });
    } finally {
      setBusy(null);
    }
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

        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => void onBuy("monthly")()}
          disabled={busy !== null}
        >
          <Text style={styles.btnPrimaryText}>
            {busy === "monthly"
              ? t({ en: "Opening Google Play…", fr: "Ouverture de Google Play…" })
              : t({ en: "Subscribe — €4.99/month", fr: "S'abonner — 4,99 €/mois" })}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => void onBuy("annual")()}
          disabled={busy !== null}
        >
          <Text style={styles.btnPrimaryText}>
            {busy === "annual"
              ? t({ en: "Opening Google Play…", fr: "Ouverture de Google Play…" })
              : t({ en: "Subscribe — €39.99/year (4 months free)", fr: "S'abonner — 39,99 €/an (4 mois offerts)" })}
          </Text>
        </Pressable>

        <Text style={styles.webNote}>
          {t({ en: "Billing managed by Google Play.", fr: "Paiement géré par Google Play." })}
        </Text>

        {error !== null && <Text style={styles.errorText}>{t(error)}</Text>}

        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => void onRestore()}
          disabled={busy !== null}
        >
          <Text style={styles.btnGhostText}>
            {busy === "restore"
              ? t({ en: "Restoring…", fr: "Restauration…" })
              : t({ en: "Restore purchases", fr: "Restaurer mes achats" })}
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
  webNote: { color: colors.sub, fontSize: 12, fontStyle: "italic", lineHeight: 17, textAlign: "center", marginBottom: spacing.md },
  errorText: { color: colors.warn, fontSize: 13, lineHeight: 18, marginBottom: spacing.md, textAlign: "center" },
  btn: { borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginBottom: spacing.md },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.onAccent, fontWeight: "800", fontSize: 15 },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  closeBtn: { alignItems: "center", paddingVertical: spacing.sm },
  closeText: { color: colors.sub, fontSize: 13 },
});
