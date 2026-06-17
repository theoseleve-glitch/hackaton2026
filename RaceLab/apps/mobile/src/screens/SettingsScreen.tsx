import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { driverStats } from "../../../../packages/logbook/src";
import type { DriverStats, LogbookState } from "../../../../packages/logbook/src";
import { LANGS, LEVELS, PRICING, trialDaysLeft, UNITS } from "../accountstore";
import type { Account, ExperienceLevel, Lang, Units } from "../accountstore";
import { ChipRow, KeyboardAwareForm, LabeledInput, Section } from "../components/forms";
import { ProgressCard } from "../components/ProgressCard";
import { colors, radius } from "../theme";

/**
 * Settings (Théo's test pass): driver profile with the bragging numbers
 * (year + career, straight from the log), account & billing (web-first —
 * the subscription lives on racelab.app, never in-app), preferences, and
 * the on-device data promise.
 */

interface Props {
  account: Account;
  setAccount: (patch: Partial<Account>) => void;
  logbook: LogbookState;
  onClose: () => void;
}

const LEVEL_LABELS: Record<ExperienceLevel, string> = {
  beginner: "beginner",
  club: "club racer",
  regional: "regional",
  pro: "pro",
};
const LANG_LABELS: Record<Lang, string> = { en: "English", fr: "Français" };
const UNIT_LABELS: Record<Units, string> = { metric: "metric (°C · m)", imperial: "imperial (°F · ft)" };

export function SettingsScreen({ account, setAccount, logbook, onClose }: Props) {
  const nowIso = new Date().toISOString();
  const year = nowIso.slice(0, 4);
  const yearStats = driverStats(logbook, year);
  const careerStats = driverStats(logbook);
  const daysLeft = trialDaysLeft(account, nowIso);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>‹ Close</Text>
        </Pressable>
        <Text style={styles.h1}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAwareForm contentStyle={{ padding: 14, paddingBottom: 40 }}>
        <Section title="Driver profile">
          <View style={styles.card}>
            <Text style={styles.driverName}>{account.handle ? `@${account.handle}` : account.email?.split("@")[0] ?? "Driver"}</Text>
            <Text style={styles.driverMeta}>
              {[account.country, account.age !== undefined ? `${account.age} yo` : undefined, account.level ? LEVEL_LABELS[account.level] : undefined]
                .filter(Boolean)
                .join(" · ") || "complete your profile below"}
            </Text>

            <StatsRow title={`This year · ${year}`} stats={yearStats} />
            <StatsRow title="Career" stats={careerStats} />
            {careerStats.best_lap_s !== undefined && (
              <Text style={styles.bestLap}>
                ⏱ fastest ever {careerStats.best_lap_s.toFixed(2)}s
                {careerStats.best_lap_track ? ` @ ${careerStats.best_lap_track}` : ""}
              </Text>
            )}
          </View>

          <ProgressCard logbook={logbook} />

          <Text style={styles.fieldLabel}>Experience level</Text>
          <ChipRow
            options={LEVELS}
            value={account.level}
            onSelect={(v) => setAccount({ level: v })}
            labelFor={(v) => LEVEL_LABELS[v]}
          />
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label="Country"
                value={account.country ?? ""}
                onChangeText={(t) => setAccount({ country: t || undefined })}
                placeholder="e.g. CH"
              />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label="Age"
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

        <Section title="Account & billing">
          <LabeledInput
            label="Email"
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
                ? `Your ${PRICING.trial_days}-day free trial hasn't started.`
                : daysLeft > 0
                  ? `Trial — ${daysLeft} day${daysLeft > 1 ? "s" : ""} left.`
                  : "Trial over — subscribe to keep the engineer working."}
            </Text>
            <Text style={styles.billingMeta}>
              {PRICING.monthly_eur}€/month or {PRICING.annual_eur}€/year. Subscriptions live on the
              website — web billing skips app-store fees, so the same plan costs less there.
            </Text>
            <Pressable
              style={styles.webBtn}
              onPress={() => {
                Linking.openURL("https://racelab.app").catch(() => {});
              }}
            >
              <Text style={styles.webBtnText}>Manage subscription on racelab.app ↗</Text>
            </Pressable>
          </View>
        </Section>

        <Section title="Preferences">
          <Text style={styles.fieldLabel}>Language</Text>
          <ChipRow
            options={LANGS}
            value={account.prefs?.lang ?? "en"}
            onSelect={(v) => setAccount({ prefs: { ...account.prefs, lang: v } })}
            labelFor={(v) => LANG_LABELS[v]}
          />
          <Text style={styles.fieldLabel}>Units</Text>
          <ChipRow
            options={UNITS}
            value={account.prefs?.units ?? "metric"}
            onSelect={(v) => setAccount({ prefs: { ...account.prefs, units: v } })}
            labelFor={(v) => UNIT_LABELS[v]}
          />
          <Text style={styles.hint}>
            Stored with your profile — translations and unit conversion roll out screen by screen.
          </Text>
        </Section>

        <Section title="Data & privacy">
          <Text style={styles.bodyText}>
            Everything — runs, setups, tracks, reports — lives on this device. The race engineer is
            100% deterministic and on-device: no API call, no model, no account needed at the track.
          </Text>
          <Text style={styles.hint}>Cloud backup and the public track library ship with accounts.</Text>
        </Section>

        <Section title="About">
          <Text style={styles.bodyText}>RaceLab 0.1.0 · made for the pit lane 🏁</Text>
          <Text style={styles.hint}>Every recommendation cites its source — grounded or silent.</Text>
        </Section>
      </KeyboardAwareForm>
    </View>
  );
}

function StatsRow({ title, stats }: { title: string; stats: DriverStats }) {
  return (
    <View style={styles.statsBlock}>
      <Text style={styles.statsTitle}>{title}</Text>
      <View style={styles.statsRow}>
        <StatCell value={stats.runs} label="runs" />
        <StatCell value={stats.tracks} label="tracks" />
        <StatCell value={stats.races} label="races" />
        <StatCell value={stats.podiums} label="podiums" highlight={stats.podiums > 0} />
        <StatCell value={stats.wins} label="wins" highlight={stats.wins > 0} />
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
});
