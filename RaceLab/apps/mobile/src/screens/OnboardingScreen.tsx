import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PRICING } from "../accountstore";
import type { ExperienceLevel } from "../accountstore";
import { ChipRow, KeyboardAwareForm, LabeledInput, Section, num } from "../components/forms";
import { colors, radius } from "../theme";

/**
 * First-launch flow, two steps. Step 1 makes the pitch and (optionally)
 * captures an email; step 2 is a quick profile and starts the trial.
 * Everything stays on-device — onDone hands the profile to the account store.
 */

const LEVELS = ["beginner", "club", "regional", "pro"] as const;
const LEVEL_LABELS: Record<ExperienceLevel, string> = {
  beginner: "beginner",
  club: "club racer",
  regional: "regional",
  pro: "pro",
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
            <Text style={styles.kicker}>RaceLab</Text>
            <Text style={styles.title}>Welcome to RaceLab</Text>
            <Text style={styles.pitch}>
              Your setups, your runs, your race engineer — works offline at the track. Log every
              run in seconds, compare what actually changed, and get setup advice between heats.
            </Text>

            <View style={styles.spacer} />
            <LabeledInput
              label="Email (optional)"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.webCard}>
              <Text style={styles.webCardTitle}>Cheaper on the web</Text>
              <Text style={styles.webCardText}>
                Create your account on the website — griplab.app. Web subscriptions skip store
                fees, so the same plan costs less there.
              </Text>
            </View>

            <View style={styles.spacer} />
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => setStep(2)}>
              <Text style={styles.btnPrimaryText}>Continue</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => {
                setEmail("");
                setStep(2);
              }}
            >
              <Text style={styles.btnGhostText}>I'll connect later</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.kicker}>Step 2 of 2</Text>
            <Text style={styles.title}>Quick profile</Text>
            <Text style={styles.pitch}>
              A few details so your race engineer talks to you at the right level.
            </Text>

            <View style={styles.spacer} />
            <LabeledInput
              label="Driver handle (optional)"
              value={handle}
              onChangeText={setHandle}
              placeholder="@yourname — shown on shared setups"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <LabeledInput
              label="Age"
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
              placeholder="optional"
            />
            <LabeledInput
              label="Country"
              value={country}
              onChangeText={setCountry}
              placeholder="optional"
            />

            <Section title="Experience">
              <ChipRow
                options={LEVELS}
                value={level}
                onSelect={(l) => setLevel(level === l ? undefined : l)}
                labelFor={(l) => LEVEL_LABELS[l]}
              />
            </Section>

            <View style={styles.spacer} />
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={start}>
              <Text style={styles.btnPrimaryText}>Start my {PRICING.trial_days}-day trial</Text>
            </Pressable>
            <Text style={styles.pricingLine}>
              then {PRICING.monthly_eur}€/mo or {PRICING.annual_eur}€/yr — cancel anytime
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
