import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radius, spacing } from "../theme";

/** Small shared form primitives for trackside data entry: big tap targets,
 *  chips over keyboards wherever possible (dirty hands, 10 min to the heat). */

/** Wraps a form's body so the keyboard never covers the lower inputs or the
 *  Save button, and so taps on suggestions/chips register while the keyboard
 *  is up (keyboardShouldPersistTaps). Use in place of a bare ScrollView. */
export function KeyboardAwareForm({
  children,
  contentStyle,
}: {
  children: React.ReactNode;
  contentStyle?: object;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ChipRow<T extends string>({
  options,
  value,
  onSelect,
  labelFor,
}: {
  options: readonly T[];
  value: T | undefined;
  onSelect: (v: T) => void;
  labelFor?: (v: T) => string;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const label = labelFor ? labelFor(o) : o.replace(/_/g, " ");
        return (
          <Pressable
            key={o}
            style={[styles.chip, value === o && styles.chipActive]}
            onPress={() => onSelect(o)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === o }}
            accessibilityLabel={label}
          >
            <Text style={[styles.chipText, value === o && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MultiChipRow<T extends string>({
  options,
  values,
  onToggle,
  labelFor,
}: {
  options: readonly T[];
  values: readonly T[];
  onToggle: (v: T) => void;
  labelFor?: (v: T) => string;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = values.includes(o);
        const label = labelFor ? labelFor(o) : o.replace(/_/g, " ");
        return (
          <Pressable
            key={o}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onToggle(o)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const LabeledInput = React.forwardRef<TextInput, {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad" | "email-address" | "numbers-and-punctuation";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  autoFocus?: boolean;
  multiline?: boolean;
  returnKeyType?: "next" | "done" | "go";
  onSubmitEditing?: () => void;
  error?: string;
}>(function LabeledInput(
  {
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
    autoCapitalize,
    autoCorrect,
    autoFocus,
    multiline,
    returnKeyType,
    onSubmitEditing,
    error,
  },
  ref,
) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        ref={ref}
        style={[styles.input, multiline && styles.inputMultiline, !!error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.sub}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        autoFocus={autoFocus}
        multiline={multiline}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={returnKeyType !== "next"}
        accessibilityLabel={label}
      />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
});

/** The Cancel / Save footer shared by every form (was copy-pasted 4×). */
export function FormActions({
  onCancel,
  onSave,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  saveDisabled,
  hint,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  hint?: string;
}) {
  return (
    <View>
      {!!hint && <Text style={styles.actionsHint}>{hint}</Text>}
      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel} accessibilityRole="button" accessibilityLabel={cancelLabel}>
          <Text style={styles.btnGhostText}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnPrimary, saveDisabled && styles.btnDisabled]}
          onPress={onSave}
          disabled={saveDisabled}
          accessibilityRole="button"
          accessibilityLabel={saveLabel}
          accessibilityState={{ disabled: !!saveDisabled }}
        >
          <Text style={styles.btnPrimaryText}>{saveLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Parse a numeric field that may legitimately be empty. */
export function num(text: string): number | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    color: colors.sub,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2 },
  chip: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.md,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { color: colors.sub, fontSize: 12 },
  chipTextActive: { color: colors.accent, fontWeight: "700" },
  inputWrap: { marginBottom: spacing.sm },
  inputLabel: { color: colors.sub, fontSize: 12, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: "top" },
  inputError: { borderColor: colors.warn },
  errorText: { color: colors.warn, fontSize: 11, marginTop: spacing.xs },
  actionsHint: { color: colors.warn, fontSize: 12, marginBottom: spacing.sm, textAlign: "center" },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
  btnDisabled: { opacity: 0.4 },
});
