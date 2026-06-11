import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { sheetProfile } from "../../../../packages/garage/src";
import type { CarEntity, GarageState } from "../../../../packages/garage/src";
import { kitVersionId, loadVersion, renameDraft } from "../../../../packages/sheets/src";
import { KB } from "../kb";
import { loadCarSheets, useCarSheets } from "../store";
import { colors, radius } from "../theme";
import { SheetEditorScreen } from "./SheetEditorScreen";

/**
 * Sheet section (D26): entered from the tab bar → list of cars (name +
 * setup count) → a car's setups. Entered from the garage's "Setup sheet"
 * button → straight into that car's sheets (focusCarId).
 */

interface Props {
  garage: GarageState;
  /** when set (garage navigation), open this car directly */
  focusCarId?: string;
  onClearFocus?: () => void;
}

export function SheetScreen({ garage, focusCarId, onClearFocus }: Props) {
  const [carId, setCarId] = useState<string | undefined>(focusCarId);
  useEffect(() => setCarId(focusCarId), [focusCarId]);

  const car = garage.cars.find((c) => c.id === carId);

  if (!car) {
    return <CarPicker garage={garage} onPick={setCarId} />;
  }
  return (
    <CarSheets
      car={car}
      onBack={() => {
        setCarId(undefined);
        onClearFocus?.();
      }}
    />
  );
}

/** Tab-bar entry point: every car, name + how many setups it holds. */
function CarPicker({ garage, onPick }: { garage: GarageState; onPick: (id: string) => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, number> = {};
      for (const car of garage.cars) {
        const sheets = await loadCarSheets(car.id);
        next[car.id] = sheets ? sheets.versions.length : 0;
      }
      if (!cancelled) setCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [garage]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.h1}>Setup sheets</Text>
      {garage.cars.length === 0 && (
        <Text style={styles.empty}>Add a car in the Garage first — its kit sheet comes preloaded.</Text>
      )}
      {garage.cars.map((car) => (
        <Pressable key={car.id} style={styles.carRow} onPress={() => onPick(car.id)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.carName}>{car.name}</Text>
            <Text style={styles.carMeta}>
              {counts[car.id] !== undefined
                ? `${counts[car.id]} setup${counts[car.id] === 1 ? "" : "s"}`
                : "…"}
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** One car's sheet area: badges from typology, "+ New setup" pill, editor. */
function CarSheets({ car, onBack }: { car: CarEntity; onBack: () => void }) {
  const { state, update } = useCarSheets(car.id, car.template_id);
  const profile = sheetProfile(car);
  const template = KB.templates[car.template_id] ?? KB.templates["generic-offroad"];

  const newSetup = () => {
    // a fresh setup = draft branched from the locked kit baseline (D21)
    update((prev) => renameDraft(loadVersion(prev, kitVersionId(prev.template_id)), "New setup"));
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ {car.name}</Text>
        </Pressable>
        <View style={styles.badges}>
          {profile.badges.map((b) => (
            <Text key={b} style={styles.badge}>
              {b}
            </Text>
          ))}
        </View>
        <Pressable style={styles.newBtn} onPress={newSetup}>
          <Text style={styles.newBtnText}>＋ New setup</Text>
        </Pressable>
      </View>
      {state ? (
        <SheetEditorScreen state={state} update={update} template={template} profile={profile} />
      ) : (
        <View style={{ padding: 20 }}>
          <Text style={styles.empty}>Loading sheets…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 28, fontWeight: "800", marginBottom: 16 },
  empty: { color: colors.sub, fontSize: 13, lineHeight: 19 },
  carRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 8,
  },
  carName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  carMeta: { color: colors.sub, fontSize: 12, marginTop: 2 },
  chev: { color: colors.sub, fontSize: 22 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  badges: { flexDirection: "row", gap: 4, flex: 1, flexWrap: "wrap" },
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
  newBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  newBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
