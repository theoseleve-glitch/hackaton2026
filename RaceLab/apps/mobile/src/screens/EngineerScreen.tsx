import React, { useMemo, useRef, useState } from "react";
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
import { RaceEngineerChat } from "../../../../packages/engine/src";
import type { ContextBundle } from "../../../../packages/engine/src";
import { bundleFromRun, lastRun } from "../../../../packages/logbook/src";
import type { LogbookState } from "../../../../packages/logbook/src";
import { KB, MP11_ID } from "../kb";
import { colors, radius } from "../theme";
import { useT } from "../i18n";

interface Message {
  role: "you" | "engineer";
  text: string;
}

type Grip = ContextBundle["track"]["grip"];
const GRIPS: Grip[] = ["green", "medium", "high", "blue_groove"];

interface Props {
  setup: Record<string, string | number>;
  logbook?: LogbookState;
}

export function EngineerScreen({ setup, logbook }: Props) {
  const t = useT();
  const last = logbook ? lastRun(logbook) : undefined;
  const [grip, setGrip] = useState<Grip>(last?.conditions.grip ?? "medium");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  // A chat session is pinned to the setup + grip it started with; changing
  // grip starts a fresh session (the engineer must never advise on stale state).
  // When a run is logged at this grip, the session inherits its full context
  // (track, conditions, tyres, history) — the log feeds the chat (D22). The
  // chat always advises on the CURRENT draft setup, not the run's old sheet.
  const fromLastRun = last !== undefined && last.conditions.grip === grip;
  const chat = useMemo(() => {
    const bundle: ContextBundle =
      last && logbook && last.conditions.grip === grip
        ? { ...bundleFromRun(last, setup, logbook, { mode: "practice" }), feedback: { tags: [] } }
        : {
            chassis_template_id: MP11_ID,
            setup: { ...setup },
            track: { name: "My track", surface: "clay", grip, conditions: gripConditions(grip) },
            feedback: { tags: [] },
            mode: "practice",
          };
    const c = new RaceEngineerChat(bundle, KB);
    setMessages(c.greeting().map((text) => ({ role: "engineer", text })));
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grip, setup, logbook]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const replies = chat.handle(trimmed).map((t): Message => ({ role: "engineer", text: t }));
    setMessages((prev) => [...prev, { role: "you", text: trimmed }, ...replies]);
    setInput("");
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.gripRow}>
        <Text style={styles.gripLabel}>{t({ en: "Track grip", fr: "Grip piste" })}</Text>
        {GRIPS.map((g) => (
          <Pressable
            key={g}
            style={[styles.gripChip, grip === g && styles.gripChipActive]}
            onPress={() => setGrip(g)}
          >
            <Text style={[styles.gripText, grip === g && styles.gripTextActive]}>
              {g.replace("_", " ")}
            </Text>
          </Pressable>
        ))}
      </View>
      {fromLastRun && last && (
        <Text style={styles.contextLine}>
          {t({ en: "📒 context from your last run:", fr: "📒 contexte de ta dernière session :" })}{" "}
          {last.track.name} · {last.track.surface}
          {last.tyres?.wear
            ? t({ en: ` · ${last.tyres.wear} tyres`, fr: ` · pneus ${last.tyres.wear}` })
            : ""}
        </Text>
      )}

      <ScrollView ref={scrollRef} style={styles.feed} contentContainerStyle={{ padding: 14 }}>
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === "you" ? styles.you : styles.engineer]}>
            <Text style={[styles.bubbleText, m.role === "you" && styles.youText]}>{m.text}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.quickRow}>
        {["better", "same", "worse"].map((q) => (
          <Pressable key={q} style={styles.quick} onPress={() => send(q)}>
            <Text style={styles.quickText}>
              {q === "better"
                ? t({ en: "better", fr: "mieux" })
                : q === "same"
                  ? t({ en: "same", fr: "pareil" })
                  : t({ en: "worse", fr: "pire" })}
            </Text>
          </Pressable>
        ))}
        <Pressable style={styles.quick} onPress={() => send("race day")}>
          <Text style={styles.quickText}>{t({ en: "race day", fr: "jour de course" })}</Text>
        </Pressable>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={t({ en: 'e.g. "it pushes mid-corner"', fr: 'ex. « ça sous-vire en milieu de virage »' })}
          placeholderTextColor={colors.sub}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <Pressable style={styles.send} onPress={() => send(input)}>
          <Text style={styles.sendText}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function gripConditions(grip: Grip): string[] {
  switch (grip) {
    case "green":
      return ["low_grip", "dusty"];
    case "medium":
      return [];
    case "high":
      return ["high_grip"];
    case "blue_groove":
      return ["high_grip", "blue_groove", "smooth"];
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  gripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gripLabel: { color: colors.sub, fontSize: 12, marginRight: 4 },
  contextLine: {
    color: colors.sub,
    fontSize: 11,
    fontStyle: "italic",
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  gripChip: {
    backgroundColor: colors.cardAlt,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  gripChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  gripText: { color: colors.sub, fontSize: 12 },
  gripTextActive: { color: colors.accent, fontWeight: "700" },
  feed: { flex: 1 },
  bubble: {
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 8,
    maxWidth: "88%",
  },
  engineer: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  you: { backgroundColor: colors.accent, alignSelf: "flex-end" },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  youText: { color: "#fff" },
  quickRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
  quick: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  quickText: { color: colors.text, fontSize: 13 },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
    paddingTop: 4,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  send: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    width: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: "#fff", fontSize: 18 },
});
