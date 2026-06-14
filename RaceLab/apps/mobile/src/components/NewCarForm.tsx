import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CarEntity, PowerType } from "../../../../packages/garage/src";
import { KB } from "../kb";
import { CAR_BRANDS, ELECTRIC, ENGINES, modelsForBrand } from "../rcdata";
import { colors, radius } from "../theme";
import { AutofillInput } from "./AutofillInput";
import { ChipRow, LabeledInput, Section, num } from "./forms";

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
}

export function NewCarForm({ initial, onSave, onCancel }: Props) {
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
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
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

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
          <Text style={styles.btnGhostText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={save}>
          <Text style={styles.btnPrimaryText}>{initial ? "Save" : "Add to garage"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 14 },
  hint: { color: colors.sub, fontSize: 12, marginTop: 8, marginBottom: 4 },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: "600", fontSize: 15 },
});
