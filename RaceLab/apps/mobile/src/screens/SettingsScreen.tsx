import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { driverStats } from "../../../../packages/logbook/src";
import type { DriverStats, LogbookState } from "../../../../packages/logbook/src";
import { LANGS, LEVELS, PRICING, trialDaysLeft, UNITS } from "../accountstore";
import type { Account, ExperienceLevel, Lang, Units } from "../accountstore";
import { setLang, useLang, useT } from "../i18n";
import { ChipRow, KeyboardAwareForm, LabeledInput, Section } from "../components/forms";
import { ProgressCard } from "../components/ProgressCard";
import { resetTour } from "../components/Tour";
import { colors, radius } from "../theme";
import { buildSubscribeUrl, SUBSCRIBE_WEB_BASE } from "@racelab/account";
import { useTokenProvider } from "../auth";

/**
 * Settings (Théo's test pass): driver profile with the bragging numbers
 * (year + career, straight from the log), account & billing (web-first —
 * the subscription lives on racelabrc.app, never in-app), preferences, and
 * the on-device data promise.
 */

interface Props {
  account: Account;
  setAccount: (patch: Partial<Account>) => void;
  logbook: LogbookState;
  onClose: () => void;
  /** Clear the one-time tour flag and restart the coach-mark tour (closes Settings). */
  onReplayTour: () => void;
}

const LANG_LABELS: Record<Lang, string> = { en: "English", fr: "Français" };

export function SettingsScreen({ account, setAccount, logbook, onClose, onReplayTour }: Props) {
  const t = useT();
  const lang = useLang();
  const tokens = useTokenProvider();
  const LEVEL_LABELS_L: Record<ExperienceLevel, string> = {
    beginner: t({ en: "beginner", fr: "débutant" }),
    club: t({ en: "club racer", fr: "pilote club" }),
    regional: t({ en: "regional", fr: "régional" }),
    pro: t({ en: "pro", fr: "pro" }),
  };
  const UNIT_LABELS_L: Record<Units, string> = {
    metric: t({ en: "metric (°C · m)", fr: "métrique (°C · m)" }),
    imperial: t({ en: "imperial (°F · ft)", fr: "impérial (°F · ft)" }),
  };
  const nowIso = new Date().toISOString();
  const year = nowIso.slice(0, 4);
  const yearStats = driverStats(logbook, year);
  const careerStats = driverStats(logbook);
  const daysLeft = trialDaysLeft(account, nowIso);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>{t({ en: "‹ Close", fr: "‹ Fermer" })}</Text>
        </Pressable>
        <Text style={styles.h1}>{t({ en: "Settings", fr: "Paramètres" })}</Text>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAwareForm contentStyle={{ padding: 14, paddingBottom: 40 }}>
        <Section title={t({ en: "Driver profile", fr: "Profil pilote" })}>
          <View style={styles.card}>
            <Text style={styles.driverName}>{account.handle ? `@${account.handle}` : account.email?.split("@")[0] ?? t({ en: "Driver", fr: "Pilote" })}</Text>
            <Text style={styles.driverMeta}>
              {[account.country, account.age !== undefined ? `${account.age} ${t({ en: "yo", fr: "ans" })}` : undefined, account.level ? LEVEL_LABELS_L[account.level] : undefined]
                .filter(Boolean)
                .join(" · ") || t({ en: "complete your profile below", fr: "complète ton profil ci-dessous" })}
            </Text>

            <StatsRow title={t({ en: `This year · ${year}`, fr: `Cette année · ${year}` })} stats={yearStats} />
            <StatsRow title={t({ en: "Career", fr: "Carrière" })} stats={careerStats} />
            {careerStats.best_lap_s !== undefined && (
              <Text style={styles.bestLap}>
                {t({ en: `⏱ fastest ever ${careerStats.best_lap_s.toFixed(2)}s`, fr: `⏱ meilleur tour absolu ${careerStats.best_lap_s.toFixed(2)}s` })}
                {careerStats.best_lap_track ? ` @ ${careerStats.best_lap_track}` : ""}
              </Text>
            )}
          </View>

          <ProgressCard logbook={logbook} />

          <Text style={styles.fieldLabel}>{t({ en: "Experience level", fr: "Niveau d’expérience" })}</Text>
          <ChipRow
            options={LEVELS}
            value={account.level}
            onSelect={(v) => setAccount({ level: v })}
            labelFor={(v) => LEVEL_LABELS_L[v]}
          />
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label={t({ en: "Country", fr: "Pays" })}
                value={account.country ?? ""}
                onChangeText={(t) => setAccount({ country: t || undefined })}
                placeholder={t({ en: "e.g. CH", fr: "ex. CH" })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label={t({ en: "Age", fr: "Âge" })}
                value={account.age !== undefined ? String(account.age) : ""}
                onChangeText={(t) => {
                  const n = Number(t);
                  setAccount({ age: t !== "" && Number.isFinite(n) ? n : undefined });
                }}
                keyboardType="numeric"
                placeholder="—"
              />
            </View>
          </View>
        </Section>

        <Section title={t({ en: "Account & billing", fr: "Compte & facturation" })}>
          <LabeledInput
            label={t({ en: "Email", fr: "E-mail" })}
            value={account.email ?? ""}
            onChangeText={(t) => setAccount({ email: t || undefined })}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={[styles.card, daysLeft <= 3 && styles.cardWarn]}>
            <Text style={styles.billingLine}>
              {account.trial_started_at === undefined
                ? t({ en: `Your ${PRICING.trial_days}-day free trial hasn't started.`, fr: `Ton essai gratuit de ${PRICING.trial_days} jours n’a pas commencé.` })
                : daysLeft > 0
                  ? t({ en: `Trial — ${daysLeft} day${daysLeft > 1 ? "s" : ""} left.`, fr: `Essai — ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}.` })
                  : t({ en: "Trial over — subscribe to keep the engineer working.", fr: "Essai terminé — abonne-toi pour garder l’ingénieur au travail." })}
            </Text>
            <Text style={styles.billingMeta}>
              {t({
                en: `${PRICING.monthly_eur}€/month or ${PRICING.annual_eur}€/year. Subscriptions live on the website — web billing skips app-store fees, so the same plan costs less there.`,
                fr: `${PRICING.monthly_eur}€/mois ou ${PRICING.annual_eur}€/an. Les abonnements se gèrent sur le site — la facturation web évite les frais des stores, donc le même forfait y coûte moins cher.`,
              })}
            </Text>
            <Pressable
              style={styles.webBtn}
              onPress={() => {
                // External web checkout, tagged with the user id when signed in
                // (anonymous → no query param; the user signs in on the web page).
                Linking.openURL(buildSubscribeUrl(SUBSCRIBE_WEB_BASE, tokens.userId() ?? undefined)).catch(() => {});
              }}
            >
              <Text style={styles.webBtnText}>{t({ en: "Manage subscription on racelabrc.app ↗", fr: "Gérer l’abonnement sur racelabrc.app ↗" })}</Text>
            </Pressable>
          </View>
        </Section>

        <Section title={t({ en: "Preferences", fr: "Préférences" })}>
          <Text style={styles.fieldLabel}>{t({ en: "Language", fr: "Langue" })}</Text>
          <ChipRow
            options={LANGS}
            value={lang}
            onSelect={(v) => {
              setLang(v);
              setAccount({ prefs: { ...account.prefs, lang: v } });
            }}
            labelFor={(v) => LANG_LABELS[v]}
          />
          <Text style={styles.fieldLabel}>{t({ en: "Units", fr: "Unités" })}</Text>
          <ChipRow
            options={UNITS}
            value={account.prefs?.units ?? "metric"}
            onSelect={(v) => setAccount({ prefs: { ...account.prefs, units: v } })}
            labelFor={(v) => UNIT_LABELS_L[v]}
          />
          <Text style={styles.hint}>
            {t({
              en: "Stored with your profile — translations and unit conversion roll out screen by screen.",
              fr: "Enregistré avec ton profil — les traductions et la conversion d’unités se déploient écran par écran.",
            })}
          </Text>
        </Section>

        <Section title={t({ en: "Data & privacy", fr: "Données & confidentialité" })}>
          <Text style={styles.bodyText}>
            {t({
              en: "Everything — runs, setups, tracks, reports — lives on this device. The race engineer is 100% deterministic and on-device: no API call, no model, no account needed at the track.",
              fr: "Tout — sessions, réglages, pistes, rapports — reste sur cet appareil. L’ingénieur de course est 100% déterministe et embarqué : aucun appel API, aucun modèle, aucun compte requis à la piste.",
            })}
          </Text>
          <Text style={styles.hint}>{t({ en: "Cloud backup and the public track library ship with accounts.", fr: "La sauvegarde cloud et la bibliothèque de pistes publique arrivent avec les comptes." })}</Text>
        </Section>

        <Section title={t({ en: "Help", fr: "Aide" })}>
          <Pressable
            style={styles.rowBtn}
            onPress={() => {
              void resetTour();
              onReplayTour();
            }}
            accessibilityRole="button"
            accessibilityLabel={t({ en: "Replay tour", fr: "Revoir le tutoriel" })}
          >
            <Text style={styles.rowBtnText}>{t({ en: "Replay tour", fr: "Revoir le tutoriel" })}</Text>
            <Text style={styles.rowBtnChevron}>{t({ en: "Take the 60-second tour again ›", fr: "Refaire le tour de 60 secondes ›" })}</Text>
          </Pressable>
        </Section>

        <Section title={t({ en: "About", fr: "À propos" })}>
          <Text style={styles.bodyText}>{t({ en: "RaceLab 0.1.0 · made for the pit lane 🏁", fr: "RaceLab 0.1.0 · fait pour la voie des stands 🏁" })}</Text>
          <Text style={styles.hint}>{t({ en: "Every recommendation cites its source — grounded or silent.", fr: "Chaque recommandation cite sa source — fondée ou silencieuse." })}</Text>
        </Section>
      </KeyboardAwareForm>
    </View>
  );
}

function StatsRow({ title, stats }: { title: string; stats: DriverStats }) {
  const t = useT();
  return (
    <View style={styles.statsBlock}>
      <Text style={styles.statsTitle}>{title}</Text>
      <View style={styles.statsRow}>
        <StatCell value={stats.runs} label={t({ en: "runs", fr: "sessions" })} />
        <StatCell value={stats.tracks} label={t({ en: "tracks", fr: "pistes" })} />
        <StatCell value={stats.races} label={t({ en: "races", fr: "courses" })} />
        <StatCell value={stats.podiums} label={t({ en: "podiums", fr: "podiums" })} highlight={stats.podiums > 0} />
        <StatCell value={stats.wins} label={t({ en: "wins", fr: "victoires" })} highlight={stats.wins > 0} />
      </View>
    </View>
  );
}

function StatCell({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, highlight && { color: colors.gold }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  h1: { color: colors.text, fontSize: 16, fontWeight: "800" },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  cardWarn: { borderColor: colors.warn },
  driverName: { color: colors.text, fontSize: 20, fontWeight: "800" },
  driverMeta: { color: colors.sub, fontSize: 12, marginTop: 2, marginBottom: 4 },
  statsBlock: { marginTop: 10 },
  statsTitle: {
    color: colors.sub,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  statsRow: { flexDirection: "row" },
  statCell: { flex: 1, alignItems: "center" },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "900" },
  statLabel: { color: colors.sub, fontSize: 10, marginTop: 1 },
  bestLap: { color: colors.good, fontSize: 12, fontWeight: "700", marginTop: 10 },
  fieldLabel: { color: colors.sub, fontSize: 12, marginTop: 10, marginBottom: 4 },
  twoCol: { flexDirection: "row", gap: 8, marginTop: 6 },
  billingLine: { color: colors.text, fontSize: 14, fontWeight: "700" },
  billingMeta: { color: colors.sub, fontSize: 12, lineHeight: 17, marginTop: 6 },
  webBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 10,
  },
  webBtnText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  hint: { color: colors.sub, fontSize: 11, fontStyle: "italic", marginTop: 8, lineHeight: 16 },
  bodyText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  rowBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowBtnText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowBtnChevron: { color: colors.sub, fontSize: 12, marginTop: 2 },
});
