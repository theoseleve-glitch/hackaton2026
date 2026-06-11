import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { carStatus, lastRun, seasonStats } from "../../../../packages/logbook/src";
import type { CarStatus, LogbookState } from "../../../../packages/logbook/src";
import { diffVsKit, getVersion } from "../../../../packages/sheets/src";
import type { SheetsState } from "../../../../packages/sheets/src";
import type { CarProfile } from "../carstore";
import { KB, MP11 } from "../kb";
import { colors, radius } from "../theme";

/**
 * The garage is a pit wall, not a list (D22: the log animates everything).
 * Car mood, what's on the car right now, the season odometer — all derived
 * from sheets + logbook state already on the device.
 */

interface Props {
  sheets: SheetsState;
  logbook: LogbookState;
  profile: CarProfile;
  setProfile: (patch: Partial<CarProfile>) => void;
  onOpenSheet: () => void;
  onAskEngineer: () => void;
  onLogRun: () => void;
}

const UPCOMING_CHASSIS = ["Associated RC8B4", "TLR 8IGHT-X", "Tekno NB48 2.1"];

export function GarageScreen({
  sheets,
  logbook,
  profile,
  setProfile,
  onOpenSheet,
  onAskEngineer,
  onLogRun,
}: Props) {
  const status = carStatus(logbook);
  const stats = seasonStats(logbook);
  const last = lastRun(logbook);
  const kitDrift = diffVsKit(sheets).length;
  const active = getVersion(sheets, sheets.draft_base_id);
  const activeName = active?.locked ? sheets.draft_name : (active?.name ?? sheets.draft_name);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setProfile({ photo_uri: result.assets[0].uri });
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
      <Text style={styles.h1}>Garage</Text>

      {/* ——— the car ——— */}
      <View style={styles.card}>
        <Pressable onPress={pickPhoto}>
          {profile.photo_uri ? (
            <Image source={{ uri: profile.photo_uri }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <Text style={styles.photoEmptyText}>📷 add a photo of your car</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.brand}>{MP11.brand.toUpperCase()}</Text>
        <CarName
          name={profile.name ?? MP11.model}
          onRename={(name) => setProfile({ name })}
        />
        <Text style={styles.meta}>1/8 nitro buggy · {MP11.model}</Text>

        <MoodLine status={status} />

        <View style={styles.row}>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onLogRun}>
            <Text style={styles.btnPrimaryText}>🏁 Log run</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={onOpenSheet}>
            <Text style={styles.btnGhostText}>Setup sheet</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={onAskEngineer}>
            <Text style={styles.btnGhostText}>Engineer</Text>
          </Pressable>
        </View>
      </View>

      {/* ——— on the car right now ——— */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>On the car right now</Text>
        <View style={styles.fact}>
          <Text style={styles.factLabel}>Setup</Text>
          <Text style={styles.factValue}>“{activeName}”</Text>
        </View>
        <View style={styles.fact}>
          <Text style={styles.factLabel}>vs kit</Text>
          <Text style={styles.factValue}>
            {kitDrift === 0 ? "factory kit settings" : `${kitDrift} setting${kitDrift > 1 ? "s" : ""} off kit`}
          </Text>
        </View>
        {last?.tyres && (
          <View style={styles.fact}>
            <Text style={styles.factLabel}>Tyres</Text>
            <Text style={styles.factValue}>
              {[last.tyres.compound, last.tyres.wear, last.tyres.run_count !== undefined ? `${last.tyres.run_count} runs` : undefined]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Text>
          </View>
        )}
        <View style={styles.fact}>
          <Text style={styles.factLabel}>Versions</Text>
          <Text style={styles.factValue}>{sheets.versions.length} saved</Text>
        </View>
      </View>

      {/* ——— the odometer ——— */}
      {stats.runs > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Season</Text>
          <View style={styles.odometer}>
            <Stat value={String(stats.runs)} label={`run${stats.runs > 1 ? "s" : ""}`} />
            <Stat value={String(stats.tracks)} label={`track${stats.tracks > 1 ? "s" : ""}`} />
            <Stat
              value={stats.best_lap_s !== undefined ? `${stats.best_lap_s.toFixed(2)}s` : "—"}
              label="best lap"
            />
            <Stat
              value={stats.better_streak > 0 ? `${stats.better_streak}🔥` : "0"}
              label="better streak"
            />
          </View>
          {stats.best_lap_setup && (
            <Text style={styles.odometerNote}>
              Best lap set on “{stats.best_lap_setup}” @ {stats.best_lap_track}
            </Text>
          )}
        </View>
      )}

      {/* ——— next cars ——— */}
      <View style={[styles.card, styles.cardDim]}>
        <Text style={styles.addTitle}>＋ Add a car</Text>
        <Text style={styles.meta}>In the extraction queue: {UPCOMING_CHASSIS.join(" · ")}</Text>
        <Text style={[styles.meta, { marginTop: 2 }]}>Each lands with a KB release — sheet, kit setup and tuning rules included.</Text>
      </View>

      <Text style={styles.footer}>
        Knowledge base: {KB.rules.length} sourced tuning rules · fully offline · no API (D18)
      </Text>
    </ScrollView>
  );
}

/** Tap the name to rename the car — ownership is the hook. */
function CarName({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (!editing) {
    return (
      <Pressable onPress={() => { setDraft(name); setEditing(true); }}>
        <Text style={styles.model}>
          {name} <Text style={styles.editHint}>✎</Text>
        </Text>
      </Pressable>
    );
  }
  const done = () => {
    const trimmed = draft.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  };
  return (
    <TextInput
      style={[styles.model, styles.nameInput]}
      value={draft}
      onChangeText={setDraft}
      onSubmitEditing={done}
      onBlur={done}
      autoFocus
      returnKeyType="done"
    />
  );
}

/** The car's mood — deterministic words from carStatus facts. */
function MoodLine({ status }: { status: CarStatus }) {
  const txt = (() => {
    switch (status.kind) {
      case "fresh":
        return { icon: "🔧", text: "Fresh build — log your first run and I'll start learning this car.", tone: colors.sub };
      case "dialed":
        return { icon: "✅", text: `Dialed — last change rated better @ ${status.track}.`, tone: colors.good };
      case "regressed":
        return { icon: "↩️", text: `Last change rated worse @ ${status.track} — revert candidate on the sheet.`, tone: colors.warn };
      case "fighting":
        return {
          icon: "⚠️",
          text: `Fighting ${status.symptom.replace(/_/g, " ")} since ${status.date.slice(5, 10)} @ ${status.track} — ask the engineer.`,
          tone: colors.warn,
        };
      case "ran":
        return { icon: "🏁", text: `Last ran ${status.date.slice(5, 10)} @ ${status.track}. No complaints logged.`, tone: colors.sub };
    }
  })();
  return (
    <View style={styles.mood}>
      <Text style={{ fontSize: 14 }}>{txt.icon}</Text>
      <Text style={[styles.moodText, { color: txt.tone }]}>{txt.text}</Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 28, fontWeight: "800", marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 14,
  },
  cardDim: { opacity: 0.6 },
  cardTitle: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  photo: { width: "100%", height: 150, borderRadius: radius.md, marginBottom: 12 },
  photoEmpty: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  photoEmptyText: { color: colors.sub, fontSize: 13 },
  brand: { color: colors.accent, fontSize: 13, fontWeight: "700", letterSpacing: 2 },
  model: { color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 2 },
  editHint: { color: colors.sub, fontSize: 14, fontWeight: "400" },
  nameInput: { borderBottomWidth: 1, borderBottomColor: colors.accent, paddingVertical: 0 },
  meta: { color: colors.sub, fontSize: 13, marginTop: 4 },
  mood: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    padding: 10,
    marginTop: 12,
  },
  moodText: { fontSize: 13, lineHeight: 18, flex: 1 },
  row: { flexDirection: "row", gap: 8, marginTop: 14 },
  btn: { borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 14 },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  btnGhost: { borderWidth: 1, borderColor: colors.accent },
  btnGhostText: { color: colors.accent, fontWeight: "700" },
  fact: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  factLabel: { color: colors.sub, fontSize: 13 },
  factValue: { color: colors.text, fontSize: 13, fontWeight: "600" },
  odometer: { flexDirection: "row", justifyContent: "space-between" },
  stat: { alignItems: "center", flex: 1 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  statLabel: { color: colors.sub, fontSize: 11, marginTop: 2 },
  odometerNote: { color: colors.sub, fontSize: 12, marginTop: 10, fontStyle: "italic" },
  addTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  footer: { color: colors.sub, fontSize: 12, textAlign: "center", marginTop: 6 },
});
