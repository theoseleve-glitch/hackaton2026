import React, { useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { GarageScreen } from "./src/screens/GarageScreen";
import { SheetEditorScreen } from "./src/screens/SheetEditorScreen";
import { EngineerScreen } from "./src/screens/EngineerScreen";
import { RunsScreen } from "./src/screens/RunsScreen";
import { CompareScreen } from "./src/screens/CompareScreen";
import { useSheets } from "./src/store";
import { useLogbook } from "./src/logstore";
import { useCarProfile } from "./src/carstore";
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
  const [comparePair, setComparePair] = useState<{ a: string; b: string } | null>(null);
  const [runsStartInForm, setRunsStartInForm] = useState(false);
  const { state, update } = useSheets();
  const { logbook, updateLogbook } = useLogbook();
  const { profile, setProfile } = useCarProfile();

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
            sheets={state}
            logbook={logbook}
            profile={profile}
            setProfile={setProfile}
            onOpenSheet={() => setTab("sheet")}
            onAskEngineer={() => setTab("engineer")}
            onLogRun={() => {
              setRunsStartInForm(true);
              setTab("runs");
            }}
          />
        )}
        {tab === "sheet" && <SheetEditorScreen state={state} update={update} />}
        {tab === "runs" && (
          <RunsScreen
            key={`runs-${runsStartInForm}`}
            sheets={state}
            logbook={logbook}
            updateLogbook={updateLogbook}
            startInForm={runsStartInForm}
            onCompare={(a, b) => {
              setComparePair({ a, b });
              setTab("compare");
            }}
          />
        )}
        {tab === "compare" && (
          <CompareScreen
            key={comparePair ? `${comparePair.a}:${comparePair.b}` : "default"}
            sheets={state}
            logbook={logbook}
            initialA={comparePair?.a}
            initialB={comparePair?.b}
          />
        )}
        {tab === "engineer" && <EngineerScreen setup={state.draft} logbook={logbook} />}
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={styles.tab}
            onPress={() => {
              setRunsStartInForm(false); // direct tab entry always lands on the list
              setTab(t.id);
            }}
          >
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
