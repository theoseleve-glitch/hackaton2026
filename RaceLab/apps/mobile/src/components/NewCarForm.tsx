import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CarEntity, PowerType } from "../../../../packages/garage/src";
import { KB } from "../kb";
import { CAR_BRANDS, ELECTRIC, ENGINES, modelsForBrand } from "../rcdata";
import { colors } from "../theme";
import { useT } from "../i18n";
import { AutofillInput } from "./AutofillInput";
import { ChipRow, FormActions, KeyboardAwareForm, LabeledInput, Section, num } from "./forms";

/**
 * Car identity sheet (D26). The typology answers here drive the custom sheet
 * labels (nitro vs EP sections, brand badges) — precision matters more than
 * speed for this one, it's filled once per car.
 */

const CATEGORIES = ["buggy", "truggy", "stadium_truck", "sc", "onroad"] as const;
const SCALES = ["1/8", "1/10", "1/12", "1/5"] as const;
const DRIVETRAINS = ["4wd", "2wd"] as const;
const POWERS: PowerType[] = ["nitro", "electric"];

interface Props {
  initial?: CarEntity;
  onSave: (car: Omit<CarEntity, "id" | "created_at">) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function NewCarForm({ initial, onSave, onCancel, onDelete }: Props) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [category, setCategory] = useState<string>(initial?.category ?? "buggy");
  const [scale, setScale] = useState<string>(initial?.scale ?? "1/8");
  const [drivetrain, setDrivetrain] = useState<"4wd" | "2wd" | undefined>(initial?.drivetrain);
  const [power, setPower] = useState<PowerType>(initial?.power ?? "nitro");
  const [engine, setEngine] = useState(initial?.engine ?? "");
  const [motor, setMotor] = useState(initial?.motor ?? "");
  const [esc, setEsc] = useState(initial?.esc ?? "");
  const [battery, setBattery] = useState(initial?.battery ?? "");
  const [tank, setTank] = useState(initial?.fuel_tank_cl !== undefined ? String(initial.fuel_tank_cl) : "");
  const [transponder, setTransponder] = useState(initial?.transponder ?? "");

  // template: exact chassis template when we have one for this brand+model,
  // generic-offroad otherwise (real templates land with KB releases)
  const templateFor = (): string => {
    const m = `${brand} ${model}`.toLowerCase();
    if (m.includes("mp11") || m.includes("inferno")) return "kyosho-inferno-mp11";
    return KB.templates["generic-offroad"] ? "generic-offroad" : "kyosho-inferno-mp11";
  };

  const save = () => {
    if (!brand.trim() && !model.trim() && !name.trim()) return;
    onSave({
      name: name.trim() || `${brand.trim()} ${model.trim()}`.trim() || t({ en: "My car", fr: "Ma voiture" }),
      template_id: initial?.template_id ?? templateFor(),
      brand: brand.trim() || "—",
      model: model.trim() || "—",
      category,
      scale,
      drivetrain,
      power,
      engine: power === "nitro" ? engine.trim() || undefined : undefined,
      motor: power === "electric" ? motor.trim() || undefined : undefined,
      esc: power === "electric" ? esc.trim() || undefined : undefined,
      battery: power === "electric" ? battery.trim() || undefined : undefined,
      fuel_tank_cl: power === "nitro" ? num(tank) : undefined,
      transponder: transponder.trim() || undefined,
      options: initial?.options, // edited from the setup sheet now
      photo_uri: initial?.photo_uri,
      notes: initial?.notes,
    });
  };

  return (
    <View style={styles.root}>
      <KeyboardAwareForm contentStyle={{ padding: 14, paddingBottom: 30 }}>
      <Text style={styles.title}>{initial ? t({ en: "Edit car", fr: "Modifier la voiture" }) : t({ en: "New car", fr: "Nouvelle voiture" })}</Text>

      <Section title={t({ en: "Identity", fr: "Identité" })}>
        <LabeledInput label={t({ en: "Car name", fr: "Nom de la voiture" })} value={name} onChangeText={setName} placeholder={t({ en: 'e.g. "race MP11"', fr: 'ex. « MP11 course »' })} />
        <AutofillInput label={t({ en: "Brand", fr: "Marque" })} value={brand} onChangeText={setBrand} pool={CAR_BRANDS} placeholder="Kyosho, Tekno, Associated…" />
        <AutofillInput label={t({ en: "Model", fr: "Modèle" })} value={model} onChangeText={setModel} pool={() => modelsForBrand(brand)} placeholder="Inferno MP11, NB48 2.2…" />
      </Section>

      <Section title={t({ en: "Typology — drives the sheet labels", fr: "Typologie — définit les libellés de la fiche" })}>
        <Text style={styles.hint}>{t({ en: "Category", fr: "Catégorie" })}</Text>
        <ChipRow options={CATEGORIES} value={category as (typeof CATEGORIES)[number]} onSelect={setCategory} />
        <Text style={styles.hint}>{t({ en: "Scale", fr: "Échelle" })}</Text>
        <ChipRow options={SCALES} value={scale as (typeof SCALES)[number]} onSelect={setScale} />
        <Text style={styles.hint}>{t({ en: "Drivetrain", fr: "Transmission" })}</Text>
        <ChipRow options={DRIVETRAINS} value={drivetrain} onSelect={(d) => setDrivetrain(drivetrain === d ? undefined : d)} />
        <Text style={styles.hint}>{t({ en: "Power", fr: "Motorisation" })}</Text>
        <ChipRow options={POWERS} value={power} onSelect={setPower} />
      </Section>

      {power === "nitro" ? (
        <Section title={t({ en: "Engine", fr: "Moteur" })}>
          <AutofillInput label={t({ en: "Engine", fr: "Moteur" })} value={engine} onChangeText={setEngine} pool={ENGINES} placeholder={t({ en: "e.g. OS Speed B21", fr: "ex. OS Speed B21" })} />
          <LabeledInput label={t({ en: "Fuel tank (cL) — feeds race strategy", fr: "Réservoir (cL) — alimente la stratégie de course" })} value={tank} onChangeText={setTank} keyboardType="decimal-pad" placeholder={t({ en: "e.g. 12.5", fr: "ex. 12.5" })} />
        </Section>
      ) : (
        <Section title={t({ en: "Electronics", fr: "Électronique" })}>
          <AutofillInput label={t({ en: "Motor", fr: "Moteur" })} value={motor} onChangeText={setMotor} pool={ELECTRIC} placeholder={t({ en: "e.g. Hobbywing 2050kV", fr: "ex. Hobbywing 2050kV" })} />
          <AutofillInput label={t({ en: "ESC", fr: "ESC" })} value={esc} onChangeText={setEsc} pool={ELECTRIC} placeholder="" />
          <LabeledInput label={t({ en: "Battery", fr: "Batterie" })} value={battery} onChangeText={setBattery} placeholder={t({ en: "e.g. 4S 6500", fr: "ex. 4S 6500" })} />
        </Section>
      )}

      <Section title={t({ en: "Timing", fr: "Chronométrage" })}>
        <LabeledInput label={t({ en: "Transponder # (Speedhive)", fr: "N° de transpondeur (Speedhive)" })} value={transponder} onChangeText={setTransponder} keyboardType="numeric" placeholder={t({ en: "link once — laps import on app open", fr: "à lier une fois — les tours s'importent à l'ouverture de l'app" })} />
      </Section>

      <FormActions onCancel={onCancel} onSave={save} saveLabel={initial ? t({ en: "Save", fr: "Enregistrer" }) : t({ en: "Add to garage", fr: "Ajouter au garage" })} />

      {initial && onDelete && (
        <Pressable
          style={styles.deleteBtn}
          onPress={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          accessibilityRole="button"
          accessibilityLabel={confirmDelete ? t({ en: "Confirm delete car", fr: "Confirmer la suppression de la voiture" }) : t({ en: "Delete car", fr: "Supprimer la voiture" })}
        >
          <Text style={styles.deleteText}>
            {confirmDelete ? t({ en: "Tap again to delete this car", fr: "Touche à nouveau pour supprimer cette voiture" }) : t({ en: "Delete car", fr: "Supprimer la voiture" })}
          </Text>
        </Pressable>
      )}
      </KeyboardAwareForm>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 14 },
  hint: { color: colors.sub, fontSize: 12, marginTop: 8, marginBottom: 4 },
  deleteBtn: { marginTop: 18, alignItems: "center", paddingVertical: 12 },
  deleteText: { color: colors.warn, fontSize: 14, fontWeight: "700" },
});
