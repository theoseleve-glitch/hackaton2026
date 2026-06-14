import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius } from "../theme";
import { MP11, label } from "../kb";
import type { ChassisTemplate } from "../../../../packages/engine/src";
import type { SheetProfile } from "../../../../packages/garage/src";
import {
  diffVersions,
  diffVsKit,
  draftDiff,
  loadVersion,
  renameDraft,
  saveVersion,
  setValue,
  toggleStar,
} from "../../../../packages/sheets/src";
import type { ChangedField, SheetsState } from "../../../../packages/sheets/src";

/**
 * Schema-driven sheet editor over the D21 model: the form is rendered from
 * the chassis template JSON; the draft diffs live against its base version
 * (changed fields highlighted), starred settings pin to the top, the locked
 * kit baseline is one tap away. Typology customization (D26): the optional
 * SheetProfile hides whole sections and overrides labels per car type.
 */

type Setup = Record<string, string | number>;
type Mode = "editor" | "versions" | "kit" | { compare: { a: string; b: string } };

interface Props {
  state: SheetsState;
  update: (fn: (prev: SheetsState) => SheetsState) => void;
  /** chassis template to render (defaults to MP11 for back-compat) */
  template?: ChassisTemplate;
  /** car-typology customization (hidden sections, label overrides, badges) */
  profile?: SheetProfile;
  /** garage CarEntity options text — display-only "Options installed" line (wired by the app integrator) */
  options?: string;
}

const SECTIONS: { title: string; match: (id: string) => boolean }[] = [
  { title: "Differentials", match: (id) => id.includes("diff") },
  {
    // pilot vocabulary: pistons and drop ("droop"/downstop) are shock settings
    title: "Shocks & springs",
    match: (id) =>
      id.includes("shock") ||
      id.includes("spring") ||
      id.includes("piston") ||
      id.includes("droop") ||
      id.includes("downstop"),
  },
  {
    title: "Geometry",
    match: (id) =>
      /camber|toe|caster|ride_height|kickup|anti_squat|wheelbase|track_width|ackermann|roll_center/.test(id),
  },
  { title: "Tires", match: (id) => id.includes("tire") },
  { title: "Bars & wing", match: (id) => id.includes("sway") || id.includes("wing") },
  { title: "Drivetrain", match: (id) => /gearing|clutch|spur/.test(id) },
];

interface FieldDef {
  type: string;
  unit?: string;
  /** KB-provided display label (e.g. droop_* fields read "Drop … (mm)") */
  label?: string;
  options?: (string | number)[];
  range?: [number, number];
  step?: number;
}

export function SheetEditorScreen({ state, update, template, profile, options }: Props) {
  const tpl = template ?? MP11;
  // precedence: typology override > KB field label (e.g. "Drop front (mm)") > title-cased id
  const labelFor = (id: string): string =>
    profile?.label_overrides[id] ??
    (tpl.fields[id] as FieldDef | undefined)?.label ??
    label(id);
  const [mode, setMode] = useState<Mode>("editor");
  const changes = useMemo(() => draftDiff(state), [state]);
  const changedMap = useMemo(
    () => new Map(changes.map((c) => [c.field, c.from])),
    [changes],
  );

  // field pipeline — depends on the template + typology + which fields are
  // starred, NOT on the draft values being typed, so memoise it: a keystroke
  // no longer rebuilds the whole grouped section list (perf, hot edit surface)
  const fields = useMemo(
    () => {
      const hidden = profile?.hidden_sections ?? [];
      return (Object.entries(tpl.fields) as [string, FieldDef][]).filter(
        ([id, f]) => f.type !== "alias" && f.type !== "derived" && !hidden.some((h) => id.includes(h)),
      );
    },
    [tpl, profile],
  );
  const starredFields = useMemo(
    () => fields.filter(([id]) => state.starred.includes(id)),
    [fields, state.starred],
  );
  const grouped = useMemo(() => {
    const used = new Set<string>(state.starred);
    const g = SECTIONS.map((s) => ({
      title: s.title,
      fields: fields.filter(([id]) => {
        if (used.has(id) || !s.match(id)) return false;
        used.add(id);
        return true;
      }),
    }));
    g.push({ title: "Other", fields: fields.filter(([id]) => !used.has(id)) });
    return g;
  }, [fields, state.starred]);

  const onChange = useCallback((id: string, value: string | number) => update((prev) => setValue(prev, id, value)), [update]);
  const onStar = useCallback((id: string) => update((prev) => toggleStar(prev, id)), [update]);

  if (mode === "versions") {
    return (
      <VersionsView
        state={state}
        onBack={() => setMode("editor")}
        onLoad={(id) => {
          update((prev) => loadVersion(prev, id));
          setMode("editor");
        }}
        onCompare={(a, b) => setMode({ compare: { a, b } })}
      />
    );
  }
  if (mode === "kit") {
    return (
      <DiffView
        title="Draft vs kit setup"
        changes={diffVsKit(state)}
        fromLabel="kit"
        toLabel={state.draft_name}
        labelFor={labelFor}
        onBack={() => setMode("editor")}
      />
    );
  }
  if (typeof mode === "object") {
    const a = state.versions.find((v) => v.id === mode.compare.a);
    const b = state.versions.find((v) => v.id === mode.compare.b);
    return (
      <DiffView
        title="Compare versions"
        changes={diffVersions(state, mode.compare.a, mode.compare.b)}
        fromLabel={a?.name ?? "?"}
        toLabel={b?.name ?? "?"}
        labelFor={labelFor}
        onBack={() => setMode("versions")}
      />
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <TextInput
        style={styles.nameInput}
        value={state.draft_name}
        onChangeText={(t) => update((prev) => renameDraft(prev, t))}
        placeholder="Setup name"
        placeholderTextColor={colors.sub}
      />
      <Text style={styles.baseInfo}>
        based on “{state.versions.find((v) => v.id === state.draft_base_id)?.name ?? "?"}”
        {changes.length > 0 ? (
          <Text style={{ color: colors.accent }}>  ·  {changes.length} change{changes.length > 1 ? "s" : ""}</Text>
        ) : (
          "  ·  no changes"
        )}
      </Text>

      {options !== undefined && options.trim().length > 0 && (
        <View style={styles.optionsBlock}>
          <Text style={styles.optionsTitle}>Options installed</Text>
          <Text style={styles.optionsText}>{options}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.action, changes.length === 0 && styles.actionDisabled]}
          disabled={changes.length === 0}
          onPress={() => update((prev) => saveVersion(prev, new Date().toISOString()).state)}
        >
          <Text style={styles.actionText}>💾 Save version</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => setMode("versions")}>
          <Text style={styles.actionText}>🗂 Versions ({state.versions.length})</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => setMode("kit")}>
          <Text style={styles.actionText}>vs kit</Text>
        </Pressable>
      </View>

      {starredFields.length > 0 && (
        <View>
          <Text style={styles.section}>★ Starred</Text>
          {starredFields.map(([id, field]) => (
            <Field
              key={id}
              id={id}
              field={field}
              displayLabel={labelFor(id)}
              value={state.draft[id]}
              was={changedMap.has(id) ? changedMap.get(id) : undefined}
              changed={changedMap.has(id)}
              starred
              onChange={onChange}
              onStar={onStar}
            />
          ))}
        </View>
      )}

      {grouped.map(
        (section) =>
          section.fields.length > 0 && (
            <View key={section.title}>
              <Text style={styles.section}>{section.title}</Text>
              {section.fields.map(([id, field]) => (
                <Field
                  key={id}
                  id={id}
                  field={field}
                  displayLabel={labelFor(id)}
                  value={state.draft[id]}
                  was={changedMap.has(id) ? changedMap.get(id) : undefined}
                  changed={changedMap.has(id)}
                  starred={false}
                  onChange={onChange}
                  onStar={onStar}
                />
              ))}
            </View>
          ),
      )}
    </ScrollView>
  );
}

function VersionsView({
  state,
  onBack,
  onLoad,
  onCompare,
}: {
  state: SheetsState;
  onBack: () => void;
  onLoad: (id: string) => void;
  onCompare: (a: string, b: string) => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const ordered = [...state.versions].reverse();
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <BackBar title="Versions" onBack={onBack} />
      <Text style={styles.hint}>
        {pick ? "Now tap the version to compare it against." : "Tap “vs” on a version, then tap another, to compare. Load branches your draft from that version."}
      </Text>
      {ordered.map((v) => {
        const parent = state.versions.find((p) => p.id === v.parent_id);
        const nChanges = v.parent_id ? diffVersions(state, v.parent_id, v.id).length : 0;
        const isBase = v.id === state.draft_base_id;
        return (
          <Pressable
            key={v.id}
            style={[styles.versionCard, pick === v.id && styles.versionPicked]}
            onPress={() => {
              if (pick && pick !== v.id) {
                onCompare(pick, v.id);
                setPick(null);
              }
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.versionName}>
                {v.locked ? "🔒 " : ""}
                {v.name}
                {isBase ? <Text style={{ color: colors.accent }}>  · draft base</Text> : null}
              </Text>
              <Text style={styles.versionMeta}>
                {new Date(v.created_at).toLocaleString()}
                {parent ? `  ·  +${nChanges} vs “${parent.name}”` : "  ·  baseline"}
              </Text>
            </View>
            <Pressable style={styles.smallBtn} onPress={() => onLoad(v.id)}>
              <Text style={styles.smallBtnText}>load</Text>
            </Pressable>
            <Pressable
              style={[styles.smallBtn, pick === v.id && styles.smallBtnActive]}
              onPress={() => setPick(pick === v.id ? null : v.id)}
            >
              <Text style={[styles.smallBtnText, pick === v.id && { color: colors.onAccent }]}>vs</Text>
            </Pressable>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function DiffView({
  title,
  changes,
  fromLabel,
  toLabel,
  labelFor = label,
  onBack,
}: {
  title: string;
  changes: ChangedField[];
  fromLabel: string;
  toLabel: string;
  labelFor?: (id: string) => string;
  onBack: () => void;
}) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <BackBar title={title} onBack={onBack} />
      <Text style={styles.hint}>
        “{fromLabel}” → “{toLabel}” · {changes.length} difference{changes.length === 1 ? "" : "s"}
      </Text>
      {changes.length === 0 && <Text style={styles.versionMeta}>Identical setups.</Text>}
      {changes.map((c) => (
        <View key={c.field} style={styles.diffRow}>
          <Text style={styles.diffField}>{labelFor(c.field)}</Text>
          <Text style={styles.diffValues}>
            <Text style={{ color: colors.sub }}>{fmt(c.from)}</Text>
            <Text style={{ color: colors.accent }}>  →  {fmt(c.to)}</Text>
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.backBar}>
      <Pressable onPress={onBack} hitSlop={10}>
        <Text style={styles.backText}>‹ back</Text>
      </Pressable>
      <Text style={styles.backTitle}>{title}</Text>
    </View>
  );
}

function fmt(v: string | number | undefined): string {
  return v === undefined ? "—" : String(v);
}

const Field = React.memo(function Field({
  id,
  field,
  displayLabel,
  value,
  was,
  changed,
  starred,
  onChange,
  onStar,
}: {
  id: string;
  field: FieldDef;
  displayLabel: string;
  value: string | number | undefined;
  was: string | number | undefined;
  changed: boolean;
  starred: boolean;
  onChange: (id: string, value: string | number) => void;
  onStar: (id: string) => void;
}) {
  // don't repeat the unit when the label already carries it, e.g. "Drop front (mm)"
  const showUnit =
    field.unit !== undefined &&
    !displayLabel.toLowerCase().includes(`(${field.unit.toLowerCase()})`);
  return (
    <View style={[styles.field, changed && styles.fieldChanged]}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {displayLabel}
          {showUnit ? <Text style={styles.unit}>  {field.unit}</Text> : null}
          {changed ? <Text style={styles.was}>   was {fmt(was)}</Text> : null}
        </Text>
        <Pressable
          onPress={() => onStar(id)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`${starred ? "Unstar" : "Star"} ${displayLabel}`}
        >
          <Text style={[styles.star, starred && styles.starOn]}>{starred ? "★" : "☆"}</Text>
        </Pressable>
      </View>
      {field.options ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            {field.options.map((opt) => {
              const active = value === opt;
              return (
                <Pressable
                  key={String(opt)}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => onChange(id, opt)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {String(opt)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : field.range ? (
        <Stepper id={id} field={field} value={value} onChange={onChange} />
      ) : (
        <TextInput
          style={styles.input}
          value={value === undefined ? "" : String(value)}
          placeholder="—"
          placeholderTextColor={colors.sub}
          onChangeText={(t) => onChange(id, t)}
          keyboardType={field.type === "number" || field.type === "int" || field.unit !== undefined ? "decimal-pad" : "default"}
          accessibilityLabel={displayLabel}
        />
      )}
    </View>
  );
});

function Stepper({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: FieldDef;
  value: string | number | undefined;
  onChange: (id: string, value: number) => void;
}) {
  const [min, max] = field.range!;
  const step = field.step ?? 1;
  const current = typeof value === "number" ? value : Number(value ?? min) || min;
  const set = (v: number) => onChange(id, Math.round(Math.min(max, Math.max(min, v)) * 100) / 100);
  return (
    <View style={styles.stepper}>
      <Pressable
        style={styles.stepBtn}
        onPress={() => set(current - step)}
        accessibilityRole="button"
        accessibilityLabel={`decrease ${id.replace(/_/g, " ")}`}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>
        {current}
        {field.unit ? <Text style={styles.unit}> {field.unit}</Text> : null}
      </Text>
      <Pressable
        style={styles.stepBtn}
        onPress={() => set(current + step)}
        accessibilityRole="button"
        accessibilityLabel={`increase ${id.replace(/_/g, " ")}`}
      >
        <Text style={styles.stepBtnText}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  nameInput: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    paddingVertical: 2,
  },
  baseInfo: { color: colors.sub, fontSize: 12, marginTop: 2, marginBottom: 10 },
  optionsBlock: { marginTop: -4, marginBottom: 10 },
  optionsTitle: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  optionsText: { color: colors.sub, fontSize: 12, fontStyle: "italic", marginTop: 2 },
  actions: { flexDirection: "row", gap: 8, marginBottom: 6 },
  action: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  section: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 22,
    marginBottom: 8,
  },
  field: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  fieldChanged: { borderColor: colors.accent },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 },
  was: { color: colors.accent, fontSize: 11, fontWeight: "400" },
  unit: { color: colors.sub, fontSize: 12, fontWeight: "400" },
  star: { color: colors.sub, fontSize: 18, paddingLeft: 8 },
  starOn: { color: colors.warn },
  chips: { flexDirection: "row", gap: 6 },
  chip: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.sub, fontSize: 13 },
  chipTextActive: { color: colors.accent, fontWeight: "700" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepBtn: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: { color: colors.accent, fontSize: 18, fontWeight: "700" },
  stepValue: { color: colors.text, fontSize: 16, fontWeight: "700", minWidth: 70, textAlign: "center" },
  input: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backBar: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  backText: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  backTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  hint: { color: colors.sub, fontSize: 12, marginBottom: 12 },
  versionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
  },
  versionPicked: { borderColor: colors.accent },
  versionName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  versionMeta: { color: colors.sub, fontSize: 11, marginTop: 2 },
  smallBtn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  smallBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  smallBtnText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  diffRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 6,
  },
  diffField: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 },
  diffValues: { fontSize: 13, fontWeight: "700" },
});
