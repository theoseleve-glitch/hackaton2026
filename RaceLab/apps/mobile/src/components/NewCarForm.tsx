import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CarEntity, PowerType } from "../../../../packages/garage/src";
import { templateIdForCar } from "../../../../packages/garage/src";
import { CAR_BRANDS, ELECTRIC, ENGINES, modelsForBrand } from "../rcdata";
import { colors } from "../theme";
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

  // template: a per-model template when we have one, else the engine-resolvable
  // CATEGORY template for this typology (templateIdForCar) — so an on-road car
  // is never routed to the off-road generic and fed off-road rules.
  const templateFor = (): string =>
    templateIdForCar({ brand, model, category, scale, power, drivetrain });

  const save = () => {
    if (!brand.trim() && !model.trim() && !name.trim()) return;
    onSave({
      name: name.trim() || `${brand.trim()} ${model.trim()}`.trim() || "My car",
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
      <Text style={styles.title}>{initial ? "Edit car" : "New car"}</Text>

      <Section title="Identity">
        <LabeledInput label="Car name" value={name} onChangeText={setName} placeholder='e.g. "race MP11"' />
        <AutofillInput label="Brand" value={brand} onChangeText={setBrand} pool={CAR_BRANDS} placeholder="Kyosho, Tekno, Associated…" />
        <AutofillInput label="Model" value={model} onChangeText={setModel} pool={() => modelsForBrand(brand)} placeholder="Inferno MP11, NB48 2.2…" />
      </Section>

      <Section title="Typology — drives the sheet labels">
        <Text style={styles.hint}>Category</Text>
        <ChipRow options={CATEGORIES} value={category as (typeof CATEGORIES)[number]} onSelect={setCategory} />
        <Text style={styles.hint}>Scale</Text>
        <ChipRow options={SCALES} value={scale as (typeof SCALES)[number]} onSelect={setScale} />
        <Text style={styles.hint}>Drivetrain</Text>
        <ChipRow options={DRIVETRAINS} value={drivetrain} onSelect={(d) => setDrivetrain(drivetrain === d ? undefined : d)} />
        <Text style={styles.hint}>Power</Text>
        <ChipRow options={POWERS} value={power} onSelect={setPower} />
      </Section>

      {power === "nitro" ? (
        <Section title="Engine">
          <AutofillInput label="Engine" value={engine} onChangeText={setEngine} pool={ENGINES} placeholder="e.g. OS Speed B21" />
          <LabeledInput label="Fuel tank (cL) — feeds race strategy" value={tank} onChangeText={setTank} keyboardType="decimal-pad" placeholder="e.g. 12.5" />
        </Section>
      ) : (
        <Section title="Electronics">
          <AutofillInput label="Motor" value={motor} onChangeText={setMotor} pool={ELECTRIC} placeholder="e.g. Hobbywing 2050kV" />
          <AutofillInput label="ESC" value={esc} onChangeText={setEsc} pool={ELECTRIC} placeholder="" />
          <LabeledInput label="Battery" value={battery} onChangeText={setBattery} placeholder="e.g. 4S 6500" />
        </Section>
      )}

      <Section title="Timing">
        <LabeledInput label="Transponder # (Speedhive)" value={transponder} onChangeText={setTransponder} keyboardType="numeric" placeholder="link once — laps import on app open" />
      </Section>

      <FormActions onCancel={onCancel} onSave={save} saveLabel={initial ? "Save" : "Add to garage"} />

      {initial && onDelete && (
        <Pressable
          style={styles.deleteBtn}
          onPress={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          accessibilityRole="button"
          accessibilityLabel={confirmDelete ? "Confirm delete car" : "Delete car"}
        >
          <Text style={styles.deleteText}>
            {confirmDelete ? "Tap again to delete this car" : "Delete car"}
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
