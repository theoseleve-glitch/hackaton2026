import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GarageScreen } from "./src/screens/GarageScreen";
import { SheetScreen } from "./src/screens/SheetScreen";
import { TracksScreen } from "./src/screens/TracksScreen";
import { RunsScreen } from "./src/screens/RunsScreen";
import { EngineerHubScreen } from "./src/screens/EngineerHubScreen";
import { CompareScreen } from "./src/screens/CompareScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { Overlay } from "./src/components/Overlay";
import { TrialBanner } from "./src/components/TrialBanner";
import { BrandLockup } from "./src/components/BrandMark";
import {
  TourProvider,
  useTourTarget,
  TOUR_STEPS,
  TOUR_STEP_COUNT,
  hasSeenTour,
  markTourDone,
} from "./src/components/Tour";
import { initLang, useT } from "./src/i18n";
import type { Phrase } from "./src/i18n";
import { fetchRecentSessions } from "./src/speedhive";
import type { SpeedhiveSession } from "./src/speedhive";
import { useGarage } from "./src/garagestore";
import { useLogbook } from "./src/logstore";
import { useTracks } from "./src/trackstore";
import { useReports } from "./src/reportstore";
import { trialDaysLeft, useAccount } from "./src/accountstore";
import { colors } from "./src/theme";
import { RepoProvider, useReposReady } from "./src/storage/RepoProvider";

// SOCIAL HIDDEN FOR LAUNCH: every social entry point (the Social tab, share
// sheet, QR scan, deep-link import/fork, official-tracks browser) is unwired
// from the running UI below. The source files (SocialScreen, ShareSheet,
// QrScanner, ImportPreviewScreen, OfficialTracksScreen, packages/social,
// candidacystore/followstore) all remain on disk, unreferenced, to be
// re-wired post-launch.

type Tab = "garage" | "sheet" | "tracks" | "runs" | "engineer";

const TABS: { id: Tab; label: Phrase; icon: string }[] = [
  { id: "garage", label: { en: "Garage", fr: "Garage" }, icon: "🏠" },
  { id: "sheet", label: { en: "Sheet", fr: "Réglages" }, icon: "📋" },
  { id: "tracks", label: { en: "Tracks", fr: "Pistes" }, icon: "🗺️" },
  { id: "runs", label: { en: "Runs", fr: "Sessions" }, icon: "🏁" },
  { id: "engineer", label: { en: "Engineer", fr: "Ingénieur" }, icon: "🔧" },
];

function AppInner() {
  const [tab, setTab] = useState<Tab>("garage");
  // cross-tab intents: garage → sheet (focus a car), runs → engineer (report
  // for a run), runs → compare (overlay, not a tab — D28 made Compare a verb)
  const [sheetFocusCarId, setSheetFocusCarId] = useState<string | undefined>();
  const [runsStartInForm, setRunsStartInForm] = useState(false);
  const [comparePair, setComparePair] = useState<{ a: string; b: string } | null>(null);
  const [engineerRunId, setEngineerRunId] = useState<string | undefined>();
  const [showSettings, setShowSettings] = useState(false);
  // Speedhive: checked once per launch; a fresh unlogged session raises the banner
  const [pendingRun, setPendingRun] = useState<SpeedhiveSession | null>(null);
  const [shPrefill, setShPrefill] = useState<
    { created_at?: string; best_lap_s?: number; avg_lap_s?: number; laps_list?: number[] } | undefined
  >();
  const [shChecked, setShChecked] = useState(false);
  // First-run coach-mark tour: index into TOUR_STEPS, or null when inactive.
  // `tourChecked` guards the once-per-launch boot decision.
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [tourChecked, setTourChecked] = useState(false);

  const { garage, updateGarage } = useGarage();
  const { logbook, updateLogbook } = useLogbook();
  const { tracks, updateTracks } = useTracks();
  const { reports, addReport } = useReports();
  const { account, setAccount, completeOnboarding } = useAccount();

  // direct tab entry resets every cross-tab intent (compare/settings close,
  // no stale Speedhive prefill, engineer doesn't re-fire a report)
  const selectTab = useCallback((id: Tab) => {
    setRunsStartInForm(false);
    setEngineerRunId(undefined);
    setComparePair(null);
    setShowSettings(false);
    setShPrefill(undefined);
    setTab(id);
  }, []);

  const txt = useT();
  useEffect(() => {
    initLang();
  }, []);

  // --- First-run tour ------------------------------------------------------
  // Start once, only after onboarding, only if the persisted flag is unset.
  useEffect(() => {
    if (tourChecked || !account || !account.onboarded) return;
    setTourChecked(true);
    void (async () => {
      if (!(await hasSeenTour())) setTourStep(0);
    })();
  }, [tourChecked, account]);

  // As a step shows, switch to its tab so the spotlight lands on the right
  // screen. Welcome/Finale carry no tab and leave the current screen as-is.
  useEffect(() => {
    if (tourStep === null) return;
    const target = TOUR_STEPS[tourStep]?.tab;
    if (target) setTab(target);
  }, [tourStep]);

  const endTour = useCallback(() => {
    setTourStep(null);
    setTab("garage"); // ending always lands on Garage (the loop's start)
    void markTourDone();
  }, []);

  const tourNext = useCallback(() => {
    // last step (or any out-of-range) ends the tour; otherwise advance.
    if (tourStep === null || tourStep >= TOUR_STEP_COUNT - 1) {
      endTour();
      return;
    }
    setTourStep(tourStep + 1);
  }, [tourStep, endTour]);

  const replayTour = useCallback(() => {
    setShowSettings(false);
    setTab("garage");
    setTourStep(0);
  }, []);

  useEffect(() => {
    if (!garage || !logbook || shChecked) return;
    setShChecked(true);
    const transponder = garage.cars.map((c) => c.transponder_id).find(Boolean);
    if (!transponder) return;
    void (async () => {
      try {
        const lastCheck =
          (await AsyncStorage.getItem("racelab:speedhive:last_check")) ?? "1970-01-01T00:00:00.000Z";
        const sessions = await fetchRecentSessions(transponder, lastCheck);
        // a session is "new" when no logged run sits within the same minute
        const known = new Set(logbook.runs.map((r) => r.created_at.slice(0, 16)));
        const fresh = sessions.filter((s) => !known.has(s.date_iso.slice(0, 16)));
        if (fresh.length > 0) setPendingRun(fresh[0]);
        await AsyncStorage.setItem("racelab:speedhive:last_check", new Date().toISOString()).catch(() => {});
      } catch {
        // offline at the track is the normal case — never block launch on this
      }
    })();
  }, [garage, logbook, shChecked]);

  if (!garage || !logbook || !tracks || !reports || !account) {
    return (
      <SafeAreaView style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingLabel}>{txt({ en: "Loading your garage…", fr: "Chargement de ton garage…" })}</Text>
      </SafeAreaView>
    );
  }

  const daysLeft = trialDaysLeft(account, new Date().toISOString());

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
      <TourProvider step={tourStep} onNext={tourNext} onSkip={endTour}>
      <View style={styles.header}>
        <BrandLockup size={30} fontSize={20} />
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setShowSettings(true)}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Text style={styles.gear}>⚙️</Text>
          </Pressable>
        </View>
      </View>
      <TrialBanner daysLeft={daysLeft} />
      {pendingRun !== null && (
        <Pressable
          style={styles.shBanner}
          onPress={() => {
            setShPrefill({
              created_at: pendingRun.date_iso,
              best_lap_s: pendingRun.best_lap_s,
              avg_lap_s: pendingRun.avg_lap_s,
              laps_list: pendingRun.laps,
            });
            setPendingRun(null);
            setRunsStartInForm(true);
            setTab("runs");
          }}
        >
          <Text style={styles.shBannerTitle}>🏁 NEW RUN DETECTED</Text>
          <Text style={styles.shBannerSub}>
            Speedhive · {pendingRun.date_iso.slice(0, 16).replace("T", " ")}
            {pendingRun.best_lap_s !== undefined ? ` · best ${pendingRun.best_lap_s.toFixed(2)}s` : ""} — tap to
            log it
          </Text>
        </Pressable>
      )}

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
              />
            )}
            {tab === "sheet" && (
              <SheetScreen
                garage={garage}
                updateGarage={updateGarage}
                focusCarId={sheetFocusCarId}
                onClearFocus={() => setSheetFocusCarId(undefined)}
              />
            )}
            {tab === "tracks" && (
              <TracksScreen
                tracks={tracks}
                updateTracks={updateTracks}
              />
            )}
            {tab === "runs" && (
              <RunsScreen
                key={`runs-${runsStartInForm}-${shPrefill?.created_at ?? ""}`}
                logbook={logbook}
                updateLogbook={updateLogbook}
                garage={garage}
                updateGarage={updateGarage}
                tracks={tracks}
                updateTracks={updateTracks}
                startInForm={runsStartInForm}
                speedhivePrefill={shPrefill}
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
        <Overlay visible={showSettings}>
          <SettingsScreen
            account={account}
            setAccount={setAccount}
            logbook={logbook}
            onClose={() => setShowSettings(false)}
            onReplayTour={replayTour}
          />
        </Overlay>
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            id={t.id}
            label={txt(t.label)}
            icon={t.icon}
            active={tab === t.id}
            onPress={() => selectTab(t.id)}
          />
        ))}
      </View>
      </TourProvider>
    </SafeAreaView>
  );
}

/** One tab-bar button that also registers itself as a tour spotlight target. */
function TabButton({
  id,
  label,
  icon,
  active,
  onPress,
}: {
  id: Tab;
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  const target = useTourTarget(`tab-${id}`);
  return (
    <Pressable
      ref={target.ref}
      onLayout={target.onLayout}
      style={styles.tab}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      {active && <View style={styles.tabIndicator} />}
      <Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

// Phase 2B (CUTOVER): the store hooks read William's repos via useRepos(), which
// throws until the RepoProvider is ready. Gate AppInner on useReposReady() so the
// repos (and the one-time, non-destructive legacy migration) are open before any
// hook mounts — the existing splash shows until then.
function AppGate() {
  const ready = useReposReady();
  if (!ready) {
    return (
      <SafeAreaView style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }
  return <AppInner />;
}

export default function App() {
  return (
    <RepoProvider>
      <AppGate />
    </RepoProvider>
  );
}

const styles = StyleSheet.create({
  // SafeAreaView (from react-native) is a no-op for the top inset on Android,
  // so the header rode under the status bar there — pad by its height on Android
  // (iOS keeps SafeAreaView's own inset; currentHeight is undefined there → 0).
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0 },
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
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerSub: { color: colors.sub, fontSize: 11 },
  gear: { fontSize: 16 },
  avatarDisc: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: colors.accent, fontSize: 13, fontWeight: "900" },
  shBanner: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  shBannerTitle: { color: colors.accent, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  shBannerSub: { color: colors.text, fontSize: 12, marginTop: 3 },
  body: { flex: 1 },
  tabbar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabIndicator: {
    position: "absolute",
    top: 0,
    width: 28,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  tabIcon: { fontSize: 18, opacity: 0.6 },
  tabLabel: { color: colors.sub, fontSize: 11, marginTop: 2 },
  tabLabelActive: { color: colors.accent, fontWeight: "800" },
  tabActive: { color: colors.accent, opacity: 1 },
  loadingLabel: { color: colors.sub, fontSize: 13, marginTop: 12 },
});
