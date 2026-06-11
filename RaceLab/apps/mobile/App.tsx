import React, { useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { GarageScreen } from "./src/screens/GarageScreen";
import { SheetScreen } from "./src/screens/SheetScreen";
import { TracksScreen } from "./src/screens/TracksScreen";
import { RunsScreen } from "./src/screens/RunsScreen";
import { EngineerHubScreen } from "./src/screens/EngineerHubScreen";
import { CompareScreen } from "./src/screens/CompareScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { TrialBanner } from "./src/components/TrialBanner";
import { useGarage } from "./src/garagestore";
import { useLogbook } from "./src/logstore";
import { useTracks } from "./src/trackstore";
import { useReports } from "./src/reportstore";
import { trialDaysLeft, useAccount } from "./src/accountstore";
import { colors } from "./src/theme";

type Tab = "garage" | "sheet" | "tracks" | "runs" | "engineer";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "garage", label: "Garage", icon: "🏠" },
  { id: "sheet", label: "Sheet", icon: "📋" },
  { id: "tracks", label: "Tracks", icon: "🗺️" },
  { id: "runs", label: "Runs", icon: "🏁" },
  { id: "engineer", label: "Engineer", icon: "🔧" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("garage");
  // cross-tab intents: garage → sheet (focus a car), runs → engineer (report
  // for a run), runs → compare (overlay, not a tab — D28 made Compare a verb)
  const [sheetFocusCarId, setSheetFocusCarId] = useState<string | undefined>();
  const [runsStartInForm, setRunsStartInForm] = useState(false);
  const [comparePair, setComparePair] = useState<{ a: string; b: string } | null>(null);
  const [engineerRunId, setEngineerRunId] = useState<string | undefined>();

  const { garage, updateGarage } = useGarage();
  const { logbook, updateLogbook } = useLogbook();
  const { tracks, updateTracks } = useTracks();
  const { reports, addReport } = useReports();
  const { account, completeOnboarding } = useAccount();

  if (!garage || !logbook || !tracks || !reports || !account) {
    return (
      <SafeAreaView style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!account.onboarded) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <OnboardingScreen onDone={(profile) => completeOnboarding(profile, new Date().toISOString())} />
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
        <Text style={styles.headerSub}>pit-side · offline · no API</Text>
      </View>
      <TrialBanner daysLeft={trialDaysLeft(account, new Date().toISOString())} />

      <View style={styles.body}>
        {comparePair ? (
          <CompareScreen
            key={`${comparePair.a}:${comparePair.b}`}
            logbook={logbook}
            aId={comparePair.a}
            bId={comparePair.b}
            onClose={() => setComparePair(null)}
          />
        ) : (
          <>
            {tab === "garage" && (
              <GarageScreen
                garage={garage}
                updateGarage={updateGarage}
                logbook={logbook}
                onOpenSheet={(carId) => {
                  setSheetFocusCarId(carId);
                  setTab("sheet");
                }}
                onLogRun={() => {
                  setRunsStartInForm(true);
                  setTab("runs");
                }}
                onAskEngineer={() => setTab("engineer")}
              />
            )}
            {tab === "sheet" && (
              <SheetScreen
                garage={garage}
                focusCarId={sheetFocusCarId}
                onClearFocus={() => setSheetFocusCarId(undefined)}
              />
            )}
            {tab === "tracks" && <TracksScreen tracks={tracks} updateTracks={updateTracks} />}
            {tab === "runs" && (
              <RunsScreen
                key={`runs-${runsStartInForm}`}
                logbook={logbook}
                updateLogbook={updateLogbook}
                garage={garage}
                updateGarage={updateGarage}
                tracks={tracks}
                updateTracks={updateTracks}
                startInForm={runsStartInForm}
                onEngineer={(runId) => {
                  setEngineerRunId(runId);
                  setTab("engineer");
                }}
                onCompare={(a, b) => setComparePair({ a, b })}
              />
            )}
            {tab === "engineer" && (
              <EngineerHubScreen
                logbook={logbook}
                garage={garage}
                tracks={tracks}
                reports={reports.reports}
                addReport={addReport}
                requestRunId={engineerRunId}
              />
            )}
          </>
        )}
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={styles.tab}
            onPress={() => {
              // direct tab entry resets cross-tab intents: runs lands on the
              // list, engineer doesn't re-trigger a report, compare closes
              setRunsStartInForm(false);
              setEngineerRunId(undefined);
              setComparePair(null);
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
