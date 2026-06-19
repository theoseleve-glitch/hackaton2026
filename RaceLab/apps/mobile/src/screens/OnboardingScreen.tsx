import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PRICING } from "../accountstore";
import type { ExperienceLevel } from "../accountstore";
import { ChipRow, KeyboardAwareForm, LabeledInput, Section, num } from "../components/forms";
import { BrandMark } from "../components/BrandMark";
import { useT } from "../i18n";
import type { Phrase } from "../i18n";
import { colors, radius } from "../theme";

/**
 * First-launch flow, two steps. Step 1 makes the pitch and (optionally)
 * captures an email; step 2 is a quick profile and starts the trial.
 * Everything stays on-device — onDone hands the profile to the account store.
 */

const LEVELS = ["beginner", "club", "regional", "pro"] as const;
const LEVEL_LABELS: Record<ExperienceLevel, Phrase> = {
  beginner: { en: "beginner", fr: "débutant" },
  club: { en: "club racer", fr: "pilote de club" },
  regional: { en: "regional", fr: "régional" },
  pro: { en: "pro", fr: "pro" },
};

interface Props {
  onDone: (profile: {
    email?: string;
    age?: number;
    country?: string;
    level?: string;
    handle?: string;
  }) => void;
}

export function OnboardingScreen({ onDone }: Props) {
  const t = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [age, setAge] = useState("");
  const [country, setCountry] = useState("");
  const [level, setLevel] = useState<ExperienceLevel | undefined>();

  const start = () => {
    onDone({
      email: email.trim() || undefined,
      handle: handle.trim() || undefined,
      age: num(age),
      country: country.trim() || undefined,
      level,
    });
  };

  return (
    <View style={styles.root}>
      <KeyboardAwareForm contentStyle={styles.content}>
        {step === 1 ? (
          <>
            <View style={styles.brandRow}>
              <BrandMark size={64} />
            </View>
            <Text style={styles.title}>{t({ en: "Welcome to RaceLab", fr: "Bienvenue sur RaceLab" })}</Text>
            <Text style={styles.pitch}>
              {t({
                en: "Your setups, your runs, your race engineer — works offline at the track. Log every run in seconds, compare what actually changed, and get setup advice between heats.",
                fr: "Tes réglages, tes sessions, ton ingénieur de course — fonctionne hors ligne à la piste. Enregistre chaque session en quelques secondes, compare ce qui a vraiment changé, et reçois des conseils de réglage entre les manches.",
              })}
            </Text>

            <View style={styles.spacer} />
            <LabeledInput
              label={t({ en: "Email (optional)", fr: "E-mail (facultatif)" })}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.webCard}>
              <Text style={styles.webCardTitle}>{t({ en: "Cheaper on the web", fr: "Moins cher sur le web" })}</Text>
              <Text style={styles.webCardText}>
                {t({
                  en: "Create your account on the website — racelabrc.app. Web subscriptions skip store fees, so the same plan costs less there.",
                  fr: "Crée ton compte sur le site web — racelabrc.app. Les abonnements web évitent les frais des stores, donc la même formule coûte moins cher là-bas.",
                })}
              </Text>
            </View>

            <View style={styles.spacer} />
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => setStep(2)}>
              <Text style={styles.btnPrimaryText}>{t({ en: "Continue", fr: "Continuer" })}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => {
                setEmail("");
                setStep(2);
              }}
            >
              <Text style={styles.btnGhostText}>{t({ en: "I'll connect later", fr: "Je me connecterai plus tard" })}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.kicker}>{t({ en: "Step 2 of 2", fr: "Étape 2 sur 2" })}</Text>
            <Text style={styles.title}>{t({ en: "Quick profile", fr: "Profil rapide" })}</Text>
            <Text style={styles.pitch}>
              {t({
                en: "A few details so your race engineer talks to you at the right level.",
                fr: "Quelques détails pour que ton ingénieur de course te parle au bon niveau.",
              })}
            </Text>

            <View style={styles.spacer} />
            <LabeledInput
              label={t({ en: "Driver handle (optional)", fr: "Pseudo de pilote (facultatif)" })}
              value={handle}
              onChangeText={setHandle}
              placeholder={t({ en: "@yourname — shown on shared setups", fr: "@tonpseudo — affiché sur les réglages partagés" })}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <LabeledInput
              label={t({ en: "Age", fr: "Âge" })}
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
              placeholder={t({ en: "optional", fr: "facultatif" })}
            />
            <LabeledInput
              label={t({ en: "Country", fr: "Pays" })}
              value={country}
              onChangeText={setCountry}
              placeholder={t({ en: "optional", fr: "facultatif" })}
            />

            <Section title={t({ en: "Experience", fr: "Expérience" })}>
              <ChipRow
                options={LEVELS}
                value={level}
                onSelect={(l) => setLevel(level === l ? undefined : l)}
                labelFor={(l) => t(LEVEL_LABELS[l])}
              />
            </Section>

            <View style={styles.spacer} />
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={start}>
              <Text style={styles.btnPrimaryText}>
                {t({
                  en: `Start my ${PRICING.trial_days}-day trial`,
                  fr: `Démarrer mon essai de ${PRICING.trial_days} jours`,
                })}
              </Text>
            </Pressable>
            <Text style={styles.pricingLine}>
              {t({
                en: `then ${PRICING.monthly_eur}€/mo or ${PRICING.annual_eur}€/yr — cancel anytime`,
                fr: `puis ${PRICING.monthly_eur}€/mois ou ${PRICING.annual_eur}€/an — annulable à tout moment`,
              })}
            </Text>
          </>
        )}
      </KeyboardAwareForm>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, paddingVertical: 48 },
  brandRow: { marginBottom: 16 },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: "800", marginBottom: 12 },
  pitch: { color: colors.sub, fontSize: 15, lineHeight: 22 },
  spacer: { height: 20 },
  webCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 8,
  },
  webCardTitle: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  webCardText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  btn: { borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.onAccent, fontWeight: "800", fontSize: 16 },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  pricingLine: { color: colors.sub, fontSize: 12, textAlign: "center", marginTop: 2 },
});
