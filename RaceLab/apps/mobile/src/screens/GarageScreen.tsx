import React, { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { carSubtitle, sheetProfile, updateCar } from "../../../../packages/garage/src";
import type { CarEntity, GarageState } from "../../../../packages/garage/src";
import { addCar } from "../../../../packages/garage/src";
import { carStatus, seasonStats } from "../../../../packages/logbook/src";
import type { CarStatus, LogbookState } from "../../../../packages/logbook/src";
import { NewCarForm } from "../components/NewCarForm";
import { colors, radius } from "../theme";

/**
 * The garage is a pit wall (D22) — now multi-car (D26). Every car card
 * carries its identity (typology badges drive the sheet labels) and its mood
 * derived from ITS runs. The season odometer stays global.
 */

interface Props {
  garage: GarageState;
  updateGarage: (fn: (prev: GarageState) => GarageState) => void;
  logbook: LogbookState;
  onOpenSheet: (carId: string) => void;
  onLogRun: (carId: string) => void;
}

export function GarageScreen({ garage, updateGarage, logbook, onOpenSheet, onLogRun }: Props) {
  const [modal, setModal] = useState<null | "new" | { edit: CarEntity }>(null);
  const stats = seasonStats(logbook);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Garage</Text>
        <Pressable style={styles.addBtn} onPress={() => setModal("new")}>
          <Text style={styles.addBtnText}>＋ Add car</Text>
        </Pressable>
      </View>

      {garage.cars.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No car yet</Text>
          <Text style={styles.meta}>
            Add your first car — its typology (nitro/EP, scale, brand) customizes the setup sheet
            labels, and its kit baseline comes preloaded when we have the chassis template.
          </Text>
        </View>
      )}

      {garage.cars.map((car) => (
        <CarCard
          key={car.id}
          car={car}
          logbook={logbook}
          onEdit={() => setModal({ edit: car })}
          onOpenSheet={() => onOpenSheet(car.id)}
          onLogRun={() => onLogRun(car.id)}
        />
      ))}

      {stats.runs > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Season</Text>
          <View style={styles.odometer}>
            <Stat value={String(stats.runs)} label={`run${stats.runs > 1 ? "s" : ""}`} />
            <Stat value={String(stats.tracks)} label={`track${stats.tracks > 1 ? "s" : ""}`} />
            <Stat value={stats.better_streak > 0 ? `${stats.better_streak}🔥` : "0"} label="better streak" />
          </View>
        </View>
      )}

      <Modal visible={modal !== null} animationType="slide" onRequestClose={() => setModal(null)}>
        <NewCarForm
          initial={modal !== null && modal !== "new" ? modal.edit : undefined}
          onCancel={() => setModal(null)}
          onSave={(car) => {
            if (modal !== null && modal !== "new") {
              updateGarage((prev) => updateCar(prev, modal.edit.id, car));
            } else {
              updateGarage((prev) => addCar(prev, { ...car, created_at: new Date().toISOString() } as Omit<CarEntity, "id">, new Date().toISOString()).state);
            }
            setModal(null);
          }}
        />
      </Modal>
    </ScrollView>
  );
}

function CarCard({
  car,
  logbook,
  onEdit,
  onOpenSheet,
  onLogRun,
}: {
  car: CarEntity;
  logbook: LogbookState;
  onEdit: () => void;
  onOpenSheet: () => void;
  onLogRun: () => void;
}) {
  // this car's runs only (legacy runs without car_id belong to the legacy car)
  const carRuns = {
    runs: logbook.runs.filter((r) => r.car_id === car.id || (!r.car_id && car.id === "car-legacy-mp11")),
  };
  const status = carStatus(carRuns);
  const profile = sheetProfile(car);

  return (
    <View style={styles.card}>
      {car.photo_uri && <Image source={{ uri: car.photo_uri }} style={styles.photo} />}
      <View style={styles.carHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>{car.brand.toUpperCase()}</Text>
          <Text style={styles.model}>{car.name}</Text>
          <Text style={styles.meta}>{carSubtitle(car)}</Text>
        </View>
        <Pressable onPress={onEdit} hitSlop={10}>
          <Text style={styles.edit}>✎</Text>
        </Pressable>
      </View>
      <View style={styles.badges}>
        {profile.badges.map((b) => (
          <Text key={b} style={styles.badge}>
            {b}
          </Text>
        ))}
      </View>

      <MoodLine status={status} />

      <View style={styles.row}>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onLogRun}>
          <Text style={styles.btnPrimaryText}>🏁 Log run</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onOpenSheet}>
          <Text style={styles.btnGhostText}>Setup sheet</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MoodLine({ status }: { status: CarStatus }) {
  const txt = (() => {
    switch (status.kind) {
      case "fresh":
        return { icon: "🔧", text: "Fresh build — log a run and I'll start learning this car.", tone: colors.sub };
      case "dialed":
        return { icon: "✅", text: `Dialed — last change rated better @ ${status.track}.`, tone: colors.good };
      case "regressed":
        return { icon: "↩️", text: `Last change rated worse @ ${status.track} — revert candidate on the sheet.`, tone: colors.warn };
      case "fighting":
        return {
          icon: "⚠️",
          text: `Fighting ${status.symptom.replace(/_/g, " ")} since ${status.date.slice(5, 10)} @ ${status.track}.`,
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  h1: { color: colors.text, fontSize: 28, fontWeight: "800" },
  addBtn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  addBtnText: { color: colors.sub, fontSize: 13, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  photo: { width: "100%", height: 140, borderRadius: radius.md, marginBottom: 12 },
  carHead: { flexDirection: "row", alignItems: "flex-start" },
  brand: { color: colors.accent, fontSize: 13, fontWeight: "700", letterSpacing: 2 },
  model: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 2 },
  meta: { color: colors.sub, fontSize: 13, marginTop: 4, lineHeight: 18 },
  edit: { color: colors.sub, fontSize: 16, padding: 4 },
  badges: { flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 8 },
  badge: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: "hidden",
  },
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
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginBottom: 6 },
  odometer: { flexDirection: "row", justifyContent: "space-between" },
  stat: { alignItems: "center", flex: 1 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  statLabel: { color: colors.sub, fontSize: 11, marginTop: 2 },
});
