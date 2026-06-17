import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { sheetProfile, updateCar } from "../../../../packages/garage/src";
import type { CarEntity, GarageState } from "../../../../packages/garage/src";
import { draftDiff, getVersion, kitVersionId, loadVersion, renameDraft } from "../../../../packages/sheets/src";
import type { SheetsState } from "../../../../packages/sheets/src";
import { buildSetupPayload } from "../../../../packages/social/src";
import type { SharedPayload } from "../../../../packages/social/src";
import { KB } from "../kb";
import { useT } from "../i18n";
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
  updateGarage: (fn: (prev: GarageState) => GarageState) => void;
  /** when set (garage navigation), open this car directly */
  focusCarId?: string;
  onClearFocus?: () => void;
  /** social slice: open the share sheet for a setup, or scan a QR to import */
  onShareSetup: (p: SharedPayload) => void;
  onScanImport: () => void;
}

export function SheetScreen({ garage, updateGarage, focusCarId, onClearFocus, onShareSetup, onScanImport }: Props) {
  const [carId, setCarId] = useState<string | undefined>(focusCarId);
  useEffect(() => setCarId(focusCarId), [focusCarId]);

  const car = garage.cars.find((c) => c.id === carId);

  if (!car) {
    return <CarPicker garage={garage} onPick={setCarId} onScanImport={onScanImport} />;
  }
  return (
    <CarSheets
      car={car}
      updateGarage={updateGarage}
      onShareSetup={onShareSetup}
      onBack={() => {
        setCarId(undefined);
        onClearFocus?.();
      }}
    />
  );
}

/** Tab-bar entry point: every car, name + how many setups it holds. */
function CarPicker({ garage, onPick, onScanImport }: { garage: GarageState; onPick: (id: string) => void; onScanImport: () => void }) {
  const t = useT();
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
      <View style={styles.pickerHead}>
        <Text style={styles.h1}>{t({ en: "Setup sheets", fr: "Fiches de réglages" })}</Text>
        <Pressable style={styles.importBtn} onPress={onScanImport}>
          <Text style={styles.importBtnText}>{t({ en: "⤵ Import (scan)", fr: "⤵ Importer (scanner)" })}</Text>
        </Pressable>
      </View>
      {garage.cars.length === 0 && (
        <Text style={styles.empty}>{t({ en: "Add a car in the Garage first — its kit sheet comes preloaded.", fr: "Ajoute d'abord une voiture dans le garage — sa fiche kit est préchargée." })}</Text>
      )}
      {garage.cars.map((car) => (
        <Pressable key={car.id} style={styles.carRow} onPress={() => onPick(car.id)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.carName}>{car.name}</Text>
            <Text style={styles.carMeta}>
              {counts[car.id] !== undefined
                ? t({ en: `${counts[car.id]} setup${counts[car.id] === 1 ? "" : "s"}`, fr: `${counts[car.id]} réglage${counts[car.id] === 1 ? "" : "s"}` })
                : "…"}
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** One car's sheet area: the setups LIST is the landing surface (Théo's test
 *  pass) — tap a setup to open its detail in the editor; the draft you were
 *  working on keeps its own row on top. */
function CarSheets({
  car,
  updateGarage,
  onShareSetup,
  onBack,
}: {
  car: CarEntity;
  updateGarage: (fn: (prev: GarageState) => GarageState) => void;
  onShareSetup: (p: SharedPayload) => void;
  onBack: () => void;
}) {
  const t = useT();
  const { state, update } = useCarSheets(car.id, car.template_id);
  const profile = sheetProfile(car);
  const template = KB.templates[car.template_id] ?? KB.templates["generic-offroad"];
  const [mode, setMode] = useState<"list" | "detail">("list");

  const newSetup = () => {
    // a fresh setup = draft branched from the locked kit baseline (D21)
    update((prev) => renameDraft(loadVersion(prev, kitVersionId(prev.template_id)), "New setup"));
    setMode("detail");
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => (mode === "detail" ? setMode("list") : onBack())} hitSlop={10}>
          <Text style={styles.back}>{mode === "detail" ? t({ en: "‹ Setups", fr: "‹ Réglages" }) : `‹ ${car.name}`}</Text>
        </Pressable>
        <View style={styles.badges}>
          {profile.badges.map((b) => (
            <Text key={b} style={styles.badge}>
              {b}
            </Text>
          ))}
        </View>
        <Pressable style={styles.newBtn} onPress={newSetup}>
          <Text style={styles.newBtnText}>{t({ en: "＋ New setup", fr: "＋ Nouveau réglage" })}</Text>
        </Pressable>
      </View>
      {!state ? (
        <View style={{ padding: 20 }}>
          <Text style={styles.empty}>{t({ en: "Loading sheets…", fr: "Chargement des fiches…" })}</Text>
        </View>
      ) : mode === "detail" ? (
        <SheetEditorScreen state={state} update={update} template={template} profile={profile} options={car.options} />
      ) : (
        <SetupList
          state={state}
          car={car}
          options={car.options}
          onChangeOptions={(text) => updateGarage((prev) => updateCar(prev, car.id, { options: text || undefined }))}
          onShareSetup={onShareSetup}
          onOpenDraft={() => setMode("detail")}
          onOpenVersion={(id) => {
            update((prev) => loadVersion(prev, id));
            setMode("detail");
          }}
        />
      )}
    </View>
  );
}

/** The landing list: working draft on top, then every saved version. */
function SetupList({
  state,
  car,
  options,
  onChangeOptions,
  onShareSetup,
  onOpenDraft,
  onOpenVersion,
}: {
  state: SheetsState;
  car: CarEntity;
  options?: string;
  onChangeOptions: (text: string) => void;
  onShareSetup: (p: SharedPayload) => void;
  onOpenDraft: () => void;
  onOpenVersion: (id: string) => void;
}) {
  const t = useT();
  const shareVersion = (v: SheetsState["versions"][number]) =>
    onShareSetup(
      buildSetupPayload(
        {
          setup: { name: v.name, template_id: v.template_id, values: v.values },
          car: { brand: car.brand, model: car.model, category: car.category, scale: car.scale, power: car.power },
        },
        new Date().toISOString(),
      ),
    );
  const edits = draftDiff(state).length;
  const base = getVersion(state, state.draft_base_id);
  const versions = [...state.versions].reverse();

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Pressable style={styles.draftRow} onPress={onOpenDraft}>
        <View style={{ flex: 1 }}>
          <Text style={styles.draftLabel}>{t({ en: "WORKING DRAFT", fr: "BROUILLON EN COURS" })}</Text>
          <Text style={styles.verName}>{state.draft_name}</Text>
          <Text style={styles.verMeta}>
            {t({ en: "based on", fr: "basé sur" })} {base?.name ?? t({ en: "kit", fr: "kit" })}
            {edits > 0 ? t({ en: ` · ${edits} unsaved change${edits > 1 ? "s" : ""}`, fr: ` · ${edits} modification${edits > 1 ? "s" : ""} non enregistrée${edits > 1 ? "s" : ""}` }) : t({ en: " · untouched", fr: " · intact" })}
          </Text>
        </View>
        <Text style={styles.chev}>›</Text>
      </Pressable>

      <Text style={styles.listSection}>{t({ en: `Saved setups · ${versions.length}`, fr: `Réglages enregistrés · ${versions.length}` })}</Text>
      {versions.map((v) => (
        <Pressable key={v.id} style={styles.verRow} onPress={() => onOpenVersion(v.id)}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.verName}>{v.name}</Text>
              {v.locked && <Text style={styles.kitBadge}>KIT</Text>}
            </View>
            <Text style={styles.verMeta}>{v.created_at.slice(0, 10)}{v.note ? ` · ${v.note}` : ""}</Text>
          </View>
          <Pressable hitSlop={10} style={styles.shareBtn} onPress={() => shareVersion(v)}>
            <Text style={styles.shareBtnText}>⤴</Text>
          </Pressable>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      ))}
      <Text style={styles.listSection}>{t({ en: "Options installed", fr: "Options installées" })}</Text>
      <TextInput
        style={styles.optionsInput}
        defaultValue={options ?? ""}
        onEndEditing={(e) => onChangeOptions(e.nativeEvent.text.trim())}
        placeholder={t({ en: "e.g. alu servo horn, HD diff cups", fr: "ex. palonnier servo alu, noix de diff HD" })}
        placeholderTextColor={colors.sub}
        multiline
      />

      <Text style={styles.listHint}>
        {t({
          en: "Tap a setup to read or edit it — saving always creates a new version, the original stays untouched. Compare and lineage live inside the detail view.",
          fr: "Touche un réglage pour le lire ou le modifier — enregistrer crée toujours une nouvelle version, l'original reste intact. La comparaison et l'historique se trouvent dans la vue détaillée.",
        })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 28, fontWeight: "800", marginBottom: 16 },
  pickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  importBtn: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 16 },
  importBtnText: { color: colors.sub, fontSize: 13, fontWeight: "700" },
  shareBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  shareBtnText: { color: colors.accent, fontSize: 18, fontWeight: "800" },
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
  draftRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
  },
  draftLabel: { color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 3 },
  listSection: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  verRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  verName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  verMeta: { color: colors.sub, fontSize: 11, marginTop: 2 },
  kitBadge: {
    color: colors.sub,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    overflow: "hidden",
  },
  listHint: { color: colors.sub, fontSize: 11, lineHeight: 16, marginTop: 10, fontStyle: "italic" },
  optionsInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 13,
    minHeight: 44,
    textAlignVertical: "top",
  },
});
