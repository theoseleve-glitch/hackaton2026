import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { GarageScreen } from "./src/screens/GarageScreen";
import { SheetScreen } from "./src/screens/SheetScreen";
import { TracksScreen } from "./src/screens/TracksScreen";
import { RunsScreen } from "./src/screens/RunsScreen";
import { EngineerHubScreen } from "./src/screens/EngineerHubScreen";
import { CompareScreen } from "./src/screens/CompareScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ImportPreviewScreen } from "./src/screens/ImportPreviewScreen";
import { OfficialTracksScreen } from "./src/screens/OfficialTracksScreen";
import { Overlay } from "./src/components/Overlay";
import { ShareSheet } from "./src/components/ShareSheet";
import { QrScanner } from "./src/components/QrScanner";
import { TrialBanner } from "./src/components/TrialBanner";
import { BrandLockup } from "./src/components/BrandMark";
import { initLang, useT } from "./src/i18n";
import type { Phrase } from "./src/i18n";
import { fetchRecentSessions } from "./src/speedhive";
import type { SpeedhiveSession } from "./src/speedhive";
import { useGarage } from "./src/garagestore";
import { useLogbook } from "./src/logstore";
import { useTracks } from "./src/trackstore";
import { useReports } from "./src/reportstore";
import { useCandidacy } from "./src/candidacystore";
import { useFollows } from "./src/followstore";
import { SocialScreen } from "./src/screens/SocialScreen";
import { trialDaysLeft, useAccount } from "./src/accountstore";
import { linkToPayload } from "../../packages/social/src";
import type { SharedPayload } from "../../packages/social/src";
import { colors } from "./src/theme";
import { RepoProvider } from "./src/storage/RepoProvider";

type Tab = "garage" | "sheet" | "tracks" | "runs" | "engineer" | "social";

const TABS: { id: Tab; label: Phrase; icon: string }[] = [
  { id: "garage", label: { en: "Garage", fr: "Garage" }, icon: "🏠" },
  { id: "sheet", label: { en: "Sheet", fr: "Réglages" }, icon: "📋" },
  { id: "tracks", label: { en: "Tracks", fr: "Pistes" }, icon: "🗺️" },
  { id: "runs", label: { en: "Runs", fr: "Sessions" }, icon: "🏁" },
  { id: "engineer", label: { en: "Engineer", fr: "Ingénieur" }, icon: "🔧" },
  { id: "social", label: { en: "Social", fr: "Social" }, icon: "👥" },
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
  // social slice: share a payload, import/fork one, scan a QR, browse official tracks
  const [shareTarget, setShareTarget] = useState<SharedPayload | null>(null);
  const [importPayload, setImportPayload] = useState<SharedPayload | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showOfficial, setShowOfficial] = useState(false);

  const { garage, updateGarage } = useGarage();
  const { logbook, updateLogbook } = useLogbook();
  const { tracks, updateTracks } = useTracks();
  const { reports, addReport } = useReports();
  const { candidacy, submit: submitCandidacy } = useCandidacy();
  const { follows, follow, unfollow } = useFollows();
  const { account, setAccount, completeOnboarding } = useAccount();

  // every shared payload is attributed to your @handle (provenance, D32+)
  const withAuthor = useCallback(
    (p: SharedPayload): SharedPayload =>
      account?.handle ? { ...p, author: { handle: account.handle } } : p,
    [account?.handle],
  );

  // direct tab entry resets every cross-tab intent (compare/settings/scanner
  // close, no stale Speedhive prefill, engineer doesn't re-fire a report)
  const selectTab = useCallback((id: Tab) => {
    setRunsStartInForm(false);
    setEngineerRunId(undefined);
    setComparePair(null);
    setShowSettings(false);
    setShPrefill(undefined);
    setShareTarget(null);
    setImportPayload(null);
    setShowScanner(false);
    setShowOfficial(false);
    setTab(id);
  }, []);

  // deep-link import: griplab://import?d=… (cold start + warm) opens the fork preview
  const url = Linking.useURL();
  const txt = useT();
  useEffect(() => {
    initLang();
  }, []);
  useEffect(() => {
    if (!url) return;
    const res = linkToPayload(url);
    if (res.ok) setImportPayload(res.payload);
  }, [url]);

  useEffect(() => {
    if (!garage || !logbook || shChecked) return;
    setShChecked(true);
    const transponder = garage.cars.map((c) => c.transponder).find(Boolean);
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

  if (!garage || !logbook || !tracks || !reports || !account || !candidacy || !follows) {
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
      <View style={styles.header}>
        <BrandLockup size={30} fontSize={20} />
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setTab("social")}
            hitSlop={10}
            style={styles.avatarDisc}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
          >
            <Text style={styles.avatarInitial}>{(account.handle ?? account.email ?? "?").charAt(0).toUpperCase()}</Text>
          </Pressable>
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
                onShareSetup={(p) => setShareTarget(withAuthor(p))}
                onScanImport={() => setShowScanner(true)}
              />
            )}
            {tab === "tracks" && (
              <TracksScreen
                tracks={tracks}
                updateTracks={updateTracks}
                candidacy={candidacy}
                onSubmitOfficial={(trackId) => submitCandidacy(trackId)}
                onOpenOfficial={() => setShowOfficial(true)}
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
                onShareRun={(p) => setShareTarget(withAuthor(p))}
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
            {tab === "social" && (
              <SocialScreen
                account={account}
                setAccount={setAccount}
                garage={garage}
                logbook={logbook}
                follows={follows}
                onFollow={follow}
                onUnfollow={unfollow}
                onFork={(p) => setImportPayload(p)}
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
          />
        </Overlay>
        <Overlay visible={importPayload !== null}>
          {importPayload && (
            <ImportPreviewScreen
              payload={importPayload}
              garage={garage}
              updateGarage={updateGarage}
              onClose={() => setImportPayload(null)}
              onDone={(carId) => {
                setImportPayload(null);
                setSheetFocusCarId(carId);
                setTab("sheet");
              }}
            />
          )}
        </Overlay>
        <Overlay visible={showScanner}>
          <QrScanner
            onScanned={(p) => {
              setShowScanner(false);
              setImportPayload(p);
            }}
            onClose={() => setShowScanner(false)}
          />
        </Overlay>
        <Overlay visible={showOfficial}>
          <OfficialTracksScreen tracks={tracks} candidacy={candidacy} onClose={() => setShowOfficial(false)} />
        </Overlay>
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              style={styles.tab}
              onPress={() => selectTab(t.id)}
              accessibilityRole="tab"
              accessibilityLabel={txt(t.label)}
              accessibilityState={{ selected: active }}
            >
              {active && <View style={styles.tabIndicator} />}
              <Text style={[styles.tabIcon, active && styles.tabActive]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{txt(t.label)}</Text>
            </Pressable>
          );
        })}
      </View>

      <ShareSheet payload={shareTarget} onClose={() => setShareTarget(null)} />
    </SafeAreaView>
  );
}

// Phase 2A (ADDITIVE): mount RepoProvider so the one-time, non-destructive
// legacy migration runs at boot and the repos context is available for the
// Phase 2B hook rewrite. The render is intentionally NOT gated on
// useReposReady() — AppInner keeps owning the UI through the legacy stores, so
// the app renders and behaves exactly as before.
export default function App() {
  return (
    <RepoProvider>
      <AppInner />
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
