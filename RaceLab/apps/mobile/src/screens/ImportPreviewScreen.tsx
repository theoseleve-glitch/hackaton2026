import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addCar } from "../../../../packages/garage/src";
import type { CarEntity, GarageState } from "../../../../packages/garage/src";
import {
  deserialize,
  diffValues,
  initSheets,
  kitVersionId,
  loadVersion,
  renameDraft,
  saveVersion,
  serialize,
  setValue,
} from "../../../../packages/sheets/src";
import type { ChangedField, SheetsState } from "../../../../packages/sheets/src";
import type { SharedPayload } from "../../../../packages/social/src";
import { forkProvenanceLine } from "../../../../packages/social/src";
import { label, sheetTemplate } from "../kb";
import { sheetsKeyForCar } from "../garagestore";
import { loadCarSheets } from "../store";
import { colors, radius } from "../theme";

/**
 * Import = fork (spec §1.2). A received SharedPayload becomes a new setup version
 * on a same-template car (picked) or on a car created from the snapshot typology.
 * Cross-template forks are never offered (no mismap) — only matching cars appear.
 * Shows the diff vs the chosen car's current draft before forking; provenance kept.
 */
export function ImportPreviewScreen({
  payload,
  garage,
  updateGarage,
  onClose,
  onDone,
}: {
  payload: SharedPayload;
  garage: GarageState;
  updateGarage: (fn: (prev: GarageState) => GarageState) => void;
  onClose: () => void;
  onDone: (carId: string) => void;
}) {
  const matches = garage.cars.filter((c) => c.template_id === payload.setup.template_id);
  const [targetId, setTargetId] = useState<string | undefined>(matches[0]?.id);
  const [diff, setDiff] = useState<ChangedField[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // diff the payload against the chosen car's current draft (or kit if none yet)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = targetId ? (await loadCarSheets(targetId))?.draft ?? {} : {};
      if (cancelled) return;
      setDiff(diffValues(base, payload.setup.values));
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId, payload]);

  const fork = async () => {
    setBusy(true);
    setError(null);
    try {
      let carId = targetId;
      if (!carId) {
        // create a car from the snapshot typology, then fork onto it
        const created = await new Promise<CarEntity>((resolve) => {
          updateGarage((prev) => {
            const { state, car } = addCar(
              prev,
              {
                name: `${payload.car.brand} ${payload.car.model}`.trim(),
                template_id: payload.setup.template_id,
                brand: payload.car.brand,
                model: payload.car.model,
                category: payload.car.category,
                scale: payload.car.scale,
                power: payload.car.power,
                created_at: new Date().toISOString(),
              } as Omit<CarEntity, "id">,
              new Date().toISOString(),
            );
            resolve(car);
            return state;
          });
        });
        carId = created.id;
      }

      // build the forked version: kit baseline + the payload's values, named + provenance
      const key = sheetsKeyForCar(carId);
      const raw = await AsyncStorage.getItem(key);
      const template = sheetTemplate(payload.setup.template_id);
      let state: SheetsState;
      if (raw) {
        const parsed = deserialize(raw, JSON.parse(raw).state.template_id);
        state = parsed.ok ? parsed.state : initSheets(template, new Date().toISOString());
      } else {
        state = initSheets(template, new Date().toISOString());
      }
      state = loadVersion(state, kitVersionId(state.template_id)); // reset draft to kit
      for (const [field, value] of Object.entries(payload.setup.values)) {
        state = setValue(state, field, value);
      }
      state = renameDraft(state, payload.setup.name || "Imported setup");
      const result = saveVersion(state, new Date().toISOString());
      if (!result.ok) return; // bad clock — unreachable with a real Date; never persist a NaN-id version
      const note = forkProvenanceLine(payload);
      const withNote = result.saved
        ? { ...result.state, versions: result.state.versions.map((v) => (v.id === result.saved!.id ? { ...v, note } : v)) }
        : result.state;
      await AsyncStorage.setItem(key, serialize(withNote));
      setDone(true);
      setTimeout(() => onDone(carId!), 700);
    } catch {
      setError("Couldn't save the fork — storage may be full. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>‹ Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Import setup</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
        <View style={styles.card}>
          <Text style={styles.kicker}>{payload.car.brand.toUpperCase()}</Text>
          <Text style={styles.name}>{payload.setup.name}</Text>
          <Text style={styles.meta}>
            {[payload.car.model, payload.car.scale, payload.car.power, payload.car.category.replace(/_/g, " ")]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {payload.context?.track_name ? (
            <Text style={styles.ctx}>
              🗺 {payload.context.track_name}
              {payload.context.surface ? ` · ${payload.context.surface}` : ""}
              {payload.context.grip ? ` · ${payload.context.grip} grip` : ""}
            </Text>
          ) : null}
          {payload.context?.result?.position !== undefined ? (
            <Text style={styles.result}>
              🏁 P{payload.context.result.position}
              {payload.context.result.entrants ? ` / ${payload.context.result.entrants}` : ""}
            </Text>
          ) : null}
          {payload.comment ? <Text style={styles.comment}>“{payload.comment}”</Text> : null}
          {payload.author?.handle ? <Text style={styles.author}>shared by @{payload.author.handle}</Text> : null}
        </View>

        <Text style={styles.section}>Fork onto</Text>
        {matches.length > 0 ? (
          <View style={styles.chips}>
            {matches.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chip, targetId === c.id && styles.chipOn]}
                onPress={() => setTargetId(c.id)}
              >
                <Text style={[styles.chipText, targetId === c.id && styles.chipTextOn]}>{c.name}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.chip, !targetId && styles.chipOn]} onPress={() => setTargetId(undefined)}>
              <Text style={[styles.chipText, !targetId && styles.chipTextOn]}>+ new car</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.hint}>
            You don't own a {payload.car.brand} {payload.car.model} — importing will add it to your garage.
          </Text>
        )}

        <Text style={styles.section}>
          {targetId ? `Changes vs that car's draft · ${diff.length}` : `Setup values · ${Object.keys(payload.setup.values).length}`}
        </Text>
        <View style={styles.card}>
          {(targetId ? diff : Object.entries(payload.setup.values).map(([field, to]) => ({ field, from: undefined, to }))).map(
            (d) => (
              <View key={d.field} style={styles.diffRow}>
                <Text style={styles.diffLabel}>{label(d.field)}</Text>
                <Text style={styles.diffVal}>
                  {d.from !== undefined ? <Text style={styles.diffFrom}>{String(d.from)} → </Text> : null}
                  {d.to !== undefined ? String(d.to) : "—"}
                </Text>
              </View>
            ),
          )}
          {targetId && diff.length === 0 ? <Text style={styles.hint}>Identical to your current draft.</Text> : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable
          style={[styles.btn, styles.primary, (busy || done) && { opacity: 0.6 }]}
          onPress={() => void fork()}
          disabled={busy || done}
          accessibilityRole="button"
          accessibilityLabel={targetId ? "Fork onto this car" : "Add car and fork"}
        >
          <Text style={styles.primaryText}>
            {done ? "✓ Forked to your garage" : busy ? "Forking…" : targetId ? "Fork onto this car" : "Add car & fork"}
          </Text>
        </Pressable>
      </View>
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
  title: { color: colors.text, fontSize: 16, fontWeight: "800" },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  name: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 4 },
  meta: { color: colors.sub, fontSize: 13, marginTop: 4 },
  ctx: { color: colors.text, fontSize: 13, marginTop: 10 },
  result: { color: colors.gold, fontSize: 15, fontWeight: "800", marginTop: 6 },
  comment: { color: colors.sub, fontSize: 13, fontStyle: "italic", marginTop: 8 },
  author: { color: colors.sub, fontSize: 11, marginTop: 8 },
  section: { color: colors.sub, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginTop: 8, marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.sub, fontSize: 13 },
  chipTextOn: { color: colors.accent, fontWeight: "700" },
  hint: { color: colors.sub, fontSize: 12, lineHeight: 18, fontStyle: "italic" },
  diffRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  diffLabel: { color: colors.sub, fontSize: 13, flex: 1 },
  diffVal: { color: colors.text, fontSize: 13, fontWeight: "700" },
  diffFrom: { color: colors.sub, fontWeight: "400" },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border },
  errorText: { color: colors.warn, fontSize: 12, marginBottom: 8, textAlign: "center" },
  btn: { borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: colors.onAccent, fontWeight: "800", fontSize: 15 },
});
