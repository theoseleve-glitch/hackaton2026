import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { GarageScreen } from "./src/screens/GarageScreen";
import { SheetEditorScreen } from "./src/screens/SheetEditorScreen";
import { SessionsScreen } from "./src/screens/SessionsScreen";
import { EngineerScreen } from "./src/screens/EngineerScreen";
import { useSessions, useSheets } from "./src/store";
import { colors } from "./src/theme";
import {
  addRun,
  endSession,
  getActiveSession,
  recordOutcome,
  startSession,
  updateTrack,
} from "../../packages/sessions/src";
import type { RunType, TrackInfo } from "../../packages/sessions/src";
import type { OutcomeEvent } from "../../packages/engine/src";
import type { SheetsState } from "../../packages/sheets/src";

type Tab = "garage" | "sheet" | "sessions" | "engineer";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "garage", label: "Garage", icon: "🏠" },
  { id: "sheet", label: "Sheet", icon: "📋" },
  { id: "sessions", label: "Sessions", icon: "🏁" },
  { id: "engineer", label: "Engineer", icon: "🔧" },
];

function versionName(sheets: SheetsState | null, id: string): string {
  return sheets?.versions.find((v) => v.id === id)?.name ?? id.slice(0, 8);
}

export default function App() {
  const [tab, setTab] = useState<Tab>("garage");
  const { state, update, persistError: sheetsPersistError } = useSheets();
  const { state: sessions, update: updateSessions, persistError: sessionsPersistError } = useSessions();

  // Latest-sheets ref: callbacks that update sessions must read the CURRENT
  // sheets state (draft_base_id moves on every save). The ref is synced both
  // on render AND inside the update wrapper, so even a same-tick
  // save-then-log sequence reads the fresh base version.
  const sheetsRef = useRef(state);
  sheetsRef.current = state;
  const updateSheets = useCallback(
    (fn: (prev: SheetsState) => SheetsState) =>
      update((prev) => {
        const next = fn(prev);
        sheetsRef.current = next;
        return next;
      }),
    [update],
  );

  const onStartSession = useCallback(
    (track: TrackInfo) =>
      updateSessions((prev) => startSession(prev, track, new Date().toISOString())),
    [updateSessions],
  );

  const onEndSession = useCallback(
    () => updateSessions((prev) => endSession(prev, new Date().toISOString())),
    [updateSessions],
  );

  const onUpdateTrack = useCallback(
    (patch: Partial<TrackInfo>) => updateSessions((prev) => updateTrack(prev, patch)),
    [updateSessions],
  );

  const onAddRun = useCallback(
    (run: { type: RunType; best_lap_s?: number; lap_count?: number; feedback_text?: string }) =>
      updateSessions((prev) => {
        const sheets = sheetsRef.current;
        if (!sheets) return prev;
        return addRun(
          prev,
          {
            ...run,
            setup_version_id: sheets.draft_base_id,
            setup_name: versionName(sheets, sheets.draft_base_id),
          },
          new Date().toISOString(),
        ).state;
      }),
    [updateSessions],
  );

  const onOutcome = useCallback(
    (e: OutcomeEvent) =>
      updateSessions((prev) => {
        if (prev.active_session_id === null) return prev; // Engineer shows the not-saved hint
        const sheets = sheetsRef.current;
        // trial-time attribution from the engine; rating-time base only as fallback
        const versionId = e.setup_version_id ?? sheets?.draft_base_id ?? "";
        if (versionId === "") return prev;
        return recordOutcome(
          prev,
          {
            setting: e.option?.setting ?? "unknown",
            change: e.option?.change ?? "",
            citations: e.option?.citations ?? [],
            outcome: e.outcome,
            setup_version_id: versionId,
            setup_name: versionName(sheets, versionId),
          },
          new Date().toISOString(),
        ).state;
      }),
    [updateSessions],
  );

  if (!state || !sessions) {
    return (
      <SafeAreaView style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const activeSession = getActiveSession(sessions);
  const persistError = sheetsPersistError || sessionsPersistError;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.header}>
        <Text style={styles.logo}>
          Race<Text style={{ color: colors.accent }}>Lab</Text>
        </Text>
        <Text style={styles.headerSub}>MP11 MVP · offline · no API</Text>
      </View>

      {persistError && (
        <View style={styles.warnBar}>
          <Text style={styles.warnText}>⚠ Storage write failing — changes may not survive a restart. Free up device storage.</Text>
        </View>
      )}

      {/* All tabs stay MOUNTED (visibility-toggled): the engineer's dialogue,
          a pending recommendation and half-typed inputs must survive the
          apply-change → log-run → rate loop across tabs. */}
      <View style={styles.body}>
        <View style={[styles.page, tab !== "garage" && styles.hidden]}>
          <GarageScreen
            versionCount={state.versions.length}
            activeName={state.draft_name}
            sessionCount={sessions.sessions.length}
            sessionLive={activeSession !== null}
            onOpenSheet={() => setTab("sheet")}
            onAskEngineer={() => setTab("engineer")}
          />
        </View>
        <View style={[styles.page, tab !== "sheet" && styles.hidden]}>
          <SheetEditorScreen state={state} update={updateSheets} />
        </View>
        <View style={[styles.page, tab !== "sessions" && styles.hidden]}>
          <SessionsScreen
            sessions={sessions}
            sheets={state}
            onStart={onStartSession}
            onEnd={onEndSession}
            onAddRun={onAddRun}
            onUpdateTrack={onUpdateTrack}
          />
        </View>
        <View style={[styles.page, tab !== "engineer" && styles.hidden]}>
          <EngineerScreen
            setup={state.draft}
            setupVersionId={state.draft_base_id}
            sessionTrack={activeSession ? activeSession.track : null}
            sessionLive={activeSession !== null}
            onOutcome={onOutcome}
          />
        </View>
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => (
          <Pressable key={t.id} style={styles.tab} onPress={() => setTab(t.id)}>
            <Text style={[styles.tabIcon, tab === t.id && styles.tabActive]}>{t.icon}</Text>
            <Text style={[styles.tabLabel, tab === t.id && styles.tabActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logo: { color: colors.text, fontSize: 20, fontWeight: "900", letterSpacing: 0.5 },
  headerSub: { color: colors.sub, fontSize: 11 },
  warnBar: { backgroundColor: "#4A1F12", paddingHorizontal: 16, paddingVertical: 6 },
  warnText: { color: colors.warn, fontSize: 12 },
  body: { flex: 1 },
  page: { flex: 1 },
  hidden: { display: "none" },
  tabbar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabIcon: { fontSize: 18, opacity: 0.6 },
  tabLabel: { color: colors.sub, fontSize: 11, marginTop: 2 },
  tabActive: { color: colors.accent, opacity: 1 },
});
