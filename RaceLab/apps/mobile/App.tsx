import React, { useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { GarageScreen } from "./src/screens/GarageScreen";
import { SheetEditorScreen } from "./src/screens/SheetEditorScreen";
import { EngineerScreen } from "./src/screens/EngineerScreen";
import { RunsScreen } from "./src/screens/RunsScreen";
import { CompareScreen } from "./src/screens/CompareScreen";
import { useSheets } from "./src/store";
import { useLogbook } from "./src/logstore";
import { colors } from "./src/theme";

type Tab = "garage" | "sheet" | "runs" | "compare" | "engineer";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "garage", label: "Garage", icon: "🏠" },
  { id: "sheet", label: "Sheet", icon: "📋" },
  { id: "runs", label: "Runs", icon: "🏁" },
  { id: "compare", label: "Compare", icon: "⚖️" },
  { id: "engineer", label: "Engineer", icon: "🔧" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("garage");
  const { state, update } = useSheets();
  const { logbook, updateLogbook } = useLogbook();

  if (!state || !logbook) {
    return (
      <SafeAreaView style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.header}>
        <Text style={styles.logo}>
          Race<Text style={{ color: colors.accent }}>Lab</Text>
        </Text>
        <Text style={styles.headerSub}>MP11 MVP · offline · no API</Text>
      </View>

      <View style={styles.body}>
        {tab === "garage" && (
          <GarageScreen
            versionCount={state.versions.length}
            activeName={state.draft_name}
            onOpenSheet={() => setTab("sheet")}
            onAskEngineer={() => setTab("engineer")}
          />
        )}
        {tab === "sheet" && <SheetEditorScreen state={state} update={update} />}
        {tab === "runs" && (
          <RunsScreen sheets={state} logbook={logbook} updateLogbook={updateLogbook} />
        )}
        {tab === "compare" && <CompareScreen sheets={state} logbook={logbook} />}
        {tab === "engineer" && <EngineerScreen setup={state.draft} />}
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
  body: { flex: 1 },
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
