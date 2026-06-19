import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius } from "../theme";
import { useT } from "../i18n";
import type { Phrase } from "../i18n";
import type { SubscriptionStatus } from "@racelab/account";

/**
 * Slim billing-status banner, driven by the REAL effective subscription status
 * (from @racelab/account via useEntitlement) — NOT the cosmetic
 * accountstore.trial_started_at. Hidden when there is nothing to nudge:
 *   - "active"  → no banner (paid, all good)
 *   - "none"    → no banner (pre-trial; the trial only starts at first premium
 *                 touch, so there is no countdown to show yet)
 *   - "trial"   → "N days left" (urgent in the last 3)
 *   - "expired" → "trial over — subscribe"
 *   - "grace"   → "subscription expired — renew"
 */
export function TrialBanner({
  status,
  trialDaysLeft,
  onPress,
}: {
  status: SubscriptionStatus;
  trialDaysLeft: number | null;
  onPress?: () => void;
}) {
  const t = useT();

  let message: Phrase | null = null;
  let urgent = false;

  if (status === "trial" && trialDaysLeft !== null) {
    // keep it out of the way until the last stretch of the trial
    if (trialDaysLeft > 10) return null;
    urgent = trialDaysLeft <= 3;
    const d = trialDaysLeft;
    message = {
      en: `Trial · ${d} ${d === 1 ? "day" : "days"} left · subscribe on racelabrc.app`,
      fr: `Essai · ${d} ${d === 1 ? "jour" : "jours"} restant${d === 1 ? "" : "s"} · abonne-toi sur racelabrc.app`,
    };
  } else if (status === "expired") {
    urgent = true;
    message = {
      en: "Trial over — subscribe to unlock Pro",
      fr: "Essai terminé — abonne-toi pour débloquer Pro",
    };
  } else if (status === "grace") {
    urgent = true;
    message = {
      en: "Subscription expired — renew to keep Pro",
      fr: "Abonnement expiré — renouvelle pour garder Pro",
    };
  }

  if (message === null) return null; // active / pre-trial none

  return (
    <Pressable
      style={[styles.banner, urgent && styles.bannerUrgent]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={[styles.text, urgent && styles.textUrgent]}>{t(message)}</Text>
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
