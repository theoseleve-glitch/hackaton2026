import React, { useState } from "react";
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { GarageScreen } from "./src/screens/GarageScreen";
import { SheetEditorScreen } from "./src/screens/SheetEditorScreen";
import { EngineerScreen } from "./src/screens/EngineerScreen";
import { MP11, kitSetup } from "./src/kb";
import { colors } from "./src/theme";

type Tab = "garage" | "sheet" | "engineer";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "garage", label: "Garage", icon: "🏠" },
  { id: "sheet", label: "Sheet", icon: "📋" },
  { id: "engineer", label: "Engineer", icon: "🔧" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("garage");
  const [setup, setSetup] = useState<Record<string, string | number>>(() => kitSetup(MP11));

  const onChange = (id: string, value: string | number) =>
    setSetup((prev) => ({ ...prev, [id]: value }));

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
            setupCount={Object.keys(setup).length}
            onOpenSheet={() => setTab("sheet")}
            onAskEngineer={() => setTab("engineer")}
          />
        )}
        {tab === "sheet" && <SheetEditorScreen setup={setup} onChange={onChange} />}
        {tab === "engineer" && <EngineerScreen setup={setup} />}
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
