import React, { useEffect, useRef, useState } from "react";
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
import type { ContextBundle, OutcomeEvent } from "../../../../packages/engine/src";
import type { TrackInfo } from "../../../../packages/sessions/src";
import { KB, MP11_ID } from "../kb";
import { colors, radius } from "../theme";

interface Message {
  role: "you" | "engineer";
  text: string;
}

type Grip = ContextBundle["track"]["grip"];
const GRIPS: Grip[] = ["green", "medium", "high", "blue_groove"];

interface Props {
  setup: Record<string, string | number>;
  /** Base version the draft is branched from — stamped onto recommendations
   *  at trial time for outcome attribution. */
  setupVersionId: string;
  /** Live session track: when set, the chat advises on it (grip chips hide). */
  sessionTrack?: TrackInfo | null;
  /** Whether a session is live — outcomes are only persisted when it is. */
  sessionLive?: boolean;
  /** Fired when the driver rates an advised change (better/same/worse). */
  onOutcome?: (e: OutcomeEvent) => void;
}

export function EngineerScreen({
  setup,
  setupVersionId,
  sessionTrack = null,
  sessionLive = false,
  onOutcome,
}: Props) {
  const [grip, setGrip] = useState<Grip>("medium");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  // The chat instance lives for the whole mount: the dialogue (pending
  // recommendation, mode, option queue) must survive tab switches, sheet
  // edits and condition changes. Context updates go IN PLACE via
  // chat.updateTrack / chat.updateSetup — never by rebuilding the chat.
  const chatRef = useRef<RaceEngineerChat | null>(null);
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;

  const track: ContextBundle["track"] = sessionTrack
    ? {
        name: sessionTrack.name,
        surface: sessionTrack.surface,
        grip: sessionTrack.grip,
        conditions: [...sessionTrack.conditions],
      }
    : { name: "My track", surface: "clay", grip, conditions: gripConditions(grip) };

  if (chatRef.current === null) {
    const bundle: ContextBundle = {
      chassis_template_id: MP11_ID,
      setup: { ...setup },
      setup_version_id: setupVersionId,
      track,
      feedback: { tags: [] },
      mode: "practice",
    };
    chatRef.current = new RaceEngineerChat(bundle, KB, {
      onOutcome: (e) => onOutcomeRef.current?.(e),
    });
  }
  const chat = chatRef.current;

  // greeting once, after mount (never set state during render)
  const greeted = useRef(false);
  useEffect(() => {
    if (!greeted.current) {
      greeted.current = true;
      setMessages(chat.greeting().map((text) => ({ role: "engineer", text })));
    }
  }, [chat]);

  // conditions changed (session started/updated, or grip chip tapped):
  // update the chat in place and show the acknowledgement — the pending
  // recommendation survives.
  const trackKey = JSON.stringify(track);
  const lastTrackKey = useRef(trackKey);
  useEffect(() => {
    if (lastTrackKey.current === trackKey) return;
    lastTrackKey.current = trackKey;
    const ack = chat.updateTrack(JSON.parse(trackKey) as ContextBundle["track"]);
    setMessages((prev) => [...prev, ...ack.map((text): Message => ({ role: "engineer", text }))]);
  }, [trackKey, chat]);

  // sheet edits / saves / loads refresh the setup silently; the CURRENT
  // recommendation keeps its trial-time version attribution (engine-side).
  useEffect(() => {
    chat.updateSetup({ ...setup }, setupVersionId);
  }, [setup, setupVersionId, chat]);

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
      {sessionTrack ? (
        <View style={styles.gripRow}>
          <Text style={styles.sessionBanner} numberOfLines={1}>
            Session: <Text style={styles.sessionBannerStrong}>{sessionTrack.name}</Text>
            {" · "}
            {sessionTrack.grip.replace("_", " ")} grip
          </Text>
        </View>
      ) : (
        <View style={styles.gripRow}>
          <Text style={styles.gripLabel}>Track grip</Text>
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
      )}

      <ScrollView ref={scrollRef} style={styles.feed} contentContainerStyle={{ padding: 14 }}>
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === "you" ? styles.you : styles.engineer]}>
            <Text style={[styles.bubbleText, m.role === "you" && styles.youText]}>{m.text}</Text>
          </View>
        ))}
      </ScrollView>

      {!sessionLive && (
        <Text style={styles.noSessionHint}>
          ⚠ No session live — outcomes won't be saved. Start one in the Sessions tab 🏁
        </Text>
      )}

      <View style={styles.quickRow}>
        {["better", "same", "worse"].map((q) => (
          <Pressable key={q} style={styles.quick} onPress={() => send(q)}>
            <Text style={styles.quickText}>{q}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.quick} onPress={() => send("race day")}>
          <Text style={styles.quickText}>race day</Text>
        </Pressable>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder='e.g. "it pushes mid-corner"'
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
  sessionBanner: { color: colors.sub, fontSize: 12, flex: 1 },
  sessionBannerStrong: { color: colors.accent, fontWeight: "700" },
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
  noSessionHint: {
    color: colors.warn,
    fontSize: 11,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
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
