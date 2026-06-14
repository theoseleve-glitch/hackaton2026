import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
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

type Tab = "garage" | "sheet" | "tracks" | "runs" | "engineer" | "social";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "garage", label: "Garage", icon: "🏠" },
  { id: "sheet", label: "Sheet", icon: "📋" },
  { id: "tracks", label: "Tracks", icon: "🗺️" },
  { id: "runs", label: "Runs", icon: "🏁" },
  { id: "engineer", label: "Engineer", icon: "🔧" },
  { id: "social", label: "Social", icon: "👥" },
];

export default function App() {
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
  const withAuthor = (p: SharedPayload): SharedPayload =>
    account?.handle ? { ...p, author: { handle: account.handle } } : p;

  // deep-link import: griplab://import?d=… (cold start + warm) opens the fork preview
  const url = Linking.useURL();
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
        <View style={styles.headerRight}>
          <Pressable onPress={() => setTab("social")} hitSlop={8} style={styles.avatarDisc}>
            <Text style={styles.avatarInitial}>{(account.handle ?? account.email ?? "?").charAt(0).toUpperCase()}</Text>
          </Pressable>
          <Pressable onPress={() => setShowSettings(true)} hitSlop={10}>
            <Text style={styles.gear}>⚙️</Text>
          </Pressable>
        </View>
      </View>
      <TrialBanner daysLeft={trialDaysLeft(account, new Date().toISOString())} />
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
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={styles.tab}
            onPress={() => {
              // direct tab entry resets cross-tab intents: runs lands on the
              // list, engineer doesn't re-trigger a report, compare and
              // settings close, a pending Speedhive prefill is dropped
              setRunsStartInForm(false);
              setEngineerRunId(undefined);
              setComparePair(null);
              setShowSettings(false);
              setShPrefill(undefined);
              setShareTarget(null);
              setImportPayload(null);
              setShowScanner(false);
              setShowOfficial(false);
              setTab(t.id);
            }}
          >
            <Text style={[styles.tabIcon, tab === t.id && styles.tabActive]}>{t.icon}</Text>
            <Text style={[styles.tabLabel, tab === t.id && styles.tabActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <ShareSheet payload={shareTarget} onClose={() => setShareTarget(null)} />
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
  tabIcon: { fontSize: 18, opacity: 0.6 },
  tabLabel: { color: colors.sub, fontSize: 11, marginTop: 2 },
  tabActive: { color: colors.accent, opacity: 1 },
});
