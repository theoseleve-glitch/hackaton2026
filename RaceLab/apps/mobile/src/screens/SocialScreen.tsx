import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type Svg from "react-native-svg";
import type { GarageState } from "../../../../packages/garage/src";
import { driverStats } from "../../../../packages/logbook/src";
import type { DriverStats, LogbookState } from "../../../../packages/logbook/src";
import type { DriverProfile, FeedItem, FollowData, SharedPayload } from "../../../../packages/social/src";
import { isFollowing } from "../../../../packages/social/src";
import { fetchDiscover, fetchFeed } from "../socialnet";
import type { Account } from "../accountstore";
import { sharePng } from "../share";
import { Overlay } from "../components/Overlay";
import { ProfileCard } from "../components/ProfileCard";
import { ProfileEditForm } from "../components/ProfileEditForm";
import { ProgressCard } from "../components/ProgressCard";
import { colors, radius } from "../theme";

/**
 * Social home (D32+): Feed · Discover · You. Feed and Discover are a deterministic
 * offline mock (socialnet.ts, SOCIAL_MOCK) until the backend lands; You is your
 * real driver profile (account + driverStats + garage) with an athlete share card.
 * Forking a feed setup reuses the existing import flow (onFork → ImportPreview).
 */

type Segment = "feed" | "discover" | "you";

interface Props {
  account: Account;
  setAccount: (patch: Partial<Account>) => void;
  garage: GarageState;
  logbook: LogbookState;
  follows: FollowData;
  onFollow: (handle: string) => void;
  onUnfollow: (handle: string) => void;
  onFork: (p: SharedPayload) => void;
}

export function SocialScreen({ account, setAccount, garage, logbook, follows, onFollow, onUnfollow, onFork }: Props) {
  const [seg, setSeg] = useState<Segment>("feed");
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [discover, setDiscover] = useState<DriverProfile[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [busyCard, setBusyCard] = useState(false);
  const cardRef = useRef<Svg>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFeed(follows.handles)
      .then((f) => !cancelled && setFeed(f))
      .catch(() => !cancelled && setFeed([]));
    return () => {
      cancelled = true;
    };
  }, [follows]);

  useEffect(() => {
    let cancelled = false;
    fetchDiscover()
      .then((d) => !cancelled && setDiscover(d))
      .catch(() => !cancelled && setDiscover([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const career = driverStats(logbook);
  const myProfile: DriverProfile = {
    handle: account.handle ?? "you",
    display_name: account.display_name,
    avatar_uri: account.avatar_uri,
    level: account.level,
    country: account.country,
    home_track: account.home_track,
    classes: account.classes,
    career: {
      runs: career.runs,
      races: career.races,
      podiums: career.podiums,
      wins: career.wins,
      best_lap_s: career.best_lap_s,
      best_lap_track: career.best_lap_track,
    },
  };

  const shareMyCard = () => {
    const svg = cardRef.current;
    if (!svg) return;
    setBusyCard(true);
    svg.toDataURL((b64: string) => {
      void sharePng(b64, `${myProfile.handle}-card`).finally(() => setBusyCard(false));
    });
  };

  return (
    <View style={styles.root}>
      <View style={styles.segBar}>
        {(["feed", "discover", "you"] as Segment[]).map((s) => {
          const label = s === "feed" ? "Feed" : s === "discover" ? "Discover" : "You";
          return (
            <Pressable
              key={s}
              style={[styles.seg, seg === s && styles.segOn]}
              onPress={() => setSeg(s)}
              accessibilityRole="tab"
              accessibilityState={{ selected: seg === s }}
              accessibilityLabel={label}
            >
              <Text style={[styles.segText, seg === s && styles.segTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {seg === "feed" && (
        <FeedView feed={feed} follows={follows} onFollow={onFollow} onUnfollow={onUnfollow} onFork={onFork} />
      )}
      {seg === "discover" && (
        <DiscoverView discover={discover} follows={follows} onFollow={onFollow} onUnfollow={onUnfollow} />
      )}
      {seg === "you" && (
        <YouView
          account={account}
          profile={myProfile}
          career={career}
          logbook={logbook}
          garage={garage}
          busyCard={busyCard}
          onShareCard={shareMyCard}
          onEdit={() => setEditing(true)}
        />
      )}

      {/* off-screen athlete card for toDataURL capture */}
      <View style={styles.offscreen} pointerEvents="none">
        <ProfileCard ref={cardRef} profile={myProfile} />
      </View>

      <Overlay visible={editing}>
        <ProfileEditForm account={account} setAccount={setAccount} onClose={() => setEditing(false)} />
      </Overlay>
    </View>
  );
}

function Avatar({ uri, handle, size = 40 }: { uri?: string; handle: string; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.discText, { fontSize: size * 0.42 }]}>{(handle || "?").charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function FollowBtn({ handle, follows, onFollow, onUnfollow }: { handle: string; follows: FollowData; onFollow: (h: string) => void; onUnfollow: (h: string) => void }) {
  const following = isFollowing(follows, handle);
  return (
    <Pressable
      style={[styles.followBtn, following && styles.followingBtn]}
      onPress={() => (following ? onUnfollow(handle) : onFollow(handle))}
    >
      <Text style={[styles.followText, following && styles.followingText]}>{following ? "Following" : "+ Follow"}</Text>
    </Pressable>
  );
}

function FeedView({ feed, follows, onFollow, onUnfollow, onFork }: { feed: FeedItem[] | null; follows: FollowData; onFollow: (h: string) => void; onUnfollow: (h: string) => void; onFork: (p: SharedPayload) => void }) {
  if (!feed) return <Centered><ActivityIndicator color={colors.accent} size="large" /></Centered>;
  if (feed.length === 0)
    return (
      <Centered>
        <Text style={styles.emptyTitle}>Your feed is quiet</Text>
        <Text style={styles.emptyText}>Follow some drivers in Discover — their shared setups and results show up here.</Text>
      </Centered>
    );
  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      {feed.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.cardHead}>
            <Avatar uri={item.author.avatar_uri} handle={item.author.handle} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.handle}>@{item.author.handle}</Text>
              <Text style={styles.when}>{item.created_at.slice(0, 10)}{item.author.level ? ` · ${item.author.level}` : ""}</Text>
            </View>
            <FollowBtn handle={item.author.handle} follows={follows} onFollow={onFollow} onUnfollow={onUnfollow} />
          </View>

          {item.kind === "shared_setup" && item.payload ? (
            <>
              <Text style={styles.feedLine}>🔧 shared a setup — {item.payload.setup.name}</Text>
              <Text style={styles.feedMeta}>
                {item.payload.car.brand} {item.payload.car.model}
                {item.payload.context?.track_name ? ` · ${item.payload.context.track_name}` : ""}
              </Text>
              {item.text ? <Text style={styles.feedText}>“{item.text}”</Text> : null}
              <Pressable style={styles.forkBtn} onPress={() => onFork(item.payload!)}>
                <Text style={styles.forkText}>⑂ Fork into my garage</Text>
              </Pressable>
            </>
          ) : item.result ? (
            <>
              <Text style={styles.feedLine}>
                {item.result.position && item.result.position <= 3 ? "🏆" : "🏁"} {item.result.track_name}
                {item.result.position ? ` — P${item.result.position}${item.result.entrants ? `/${item.result.entrants}` : ""}` : ""}
              </Text>
              <Text style={styles.feedMeta}>
                {item.result.car ?? ""}
                {item.result.best_lap_s !== undefined ? ` · best ${item.result.best_lap_s.toFixed(2)}s` : ""}
              </Text>
              {item.text ? <Text style={styles.feedText}>“{item.text}”</Text> : null}
            </>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function DiscoverView({ discover, follows, onFollow, onUnfollow }: { discover: DriverProfile[] | null; follows: FollowData; onFollow: (h: string) => void; onUnfollow: (h: string) => void }) {
  if (!discover) return <Centered><ActivityIndicator color={colors.accent} size="large" /></Centered>;
  if (discover.length === 0)
    return (
      <Centered>
        <Text style={styles.emptyTitle}>No drivers to show yet</Text>
        <Text style={styles.emptyText}>When the community is live, fast drivers to follow will appear here.</Text>
      </Centered>
    );
  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Text style={styles.discoverHint}>Fast drivers to follow — their setups are what you search for.</Text>
      {discover.map((d) => (
        <View key={d.handle} style={styles.card}>
          <View style={styles.cardHead}>
            <Avatar uri={d.avatar_uri} handle={d.handle} size={48} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.handle}>@{d.handle}</Text>
              <Text style={styles.when}>
                {[d.level, d.country, d.home_track].filter(Boolean).join(" · ") || "racer"}
              </Text>
            </View>
            <FollowBtn handle={d.handle} follows={follows} onFollow={onFollow} onUnfollow={onUnfollow} />
          </View>
          {d.career ? (
            <Text style={styles.feedMeta}>
              🏆 {d.career.wins} wins · {d.career.podiums} podiums · {d.career.races} races
              {d.career.best_lap_s !== undefined ? ` · best ${d.career.best_lap_s.toFixed(2)}s` : ""}
            </Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function YouView({ account, profile, career, logbook, garage, busyCard, onShareCard, onEdit }: { account: Account; profile: DriverProfile; career: DriverStats; logbook: LogbookState; garage: GarageState; busyCard: boolean; onShareCard: () => void; onEdit: () => void }) {
  const noHandle = !account.handle;
  const pct = (v?: number) => (v === undefined ? "—" : `${Math.round(v * 100)}%`);
  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      {noHandle && (
        <View style={[styles.card, { borderColor: colors.accent }]}>
          <Text style={styles.emptyTitle}>Set up your driver profile</Text>
          <Text style={styles.emptyText}>Pick a @handle so your shared setups are attributed to you.</Text>
        </View>
      )}

      <View style={styles.profileHead}>
        <Avatar uri={profile.avatar_uri} handle={profile.handle} size={72} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.profileHandle}>@{profile.handle}</Text>
          {profile.display_name ? <Text style={styles.profileName}>{profile.display_name}</Text> : null}
          <Text style={styles.when}>{[profile.level, profile.country, profile.home_track].filter(Boolean).join(" · ") || "—"}</Text>
        </View>
      </View>

      {profile.classes && profile.classes.length > 0 && (
        <View style={styles.classRow}>
          {profile.classes.map((c) => (
            <Text key={c} style={styles.classChip}>{c}</Text>
          ))}
        </View>
      )}

      <Text style={styles.section}>Palmarès</Text>
      <View style={styles.palmares}>
        <Stat value={profile.career?.wins ?? 0} label="wins" gold />
        <Stat value={profile.career?.podiums ?? 0} label="podiums" gold />
        <Stat value={profile.career?.races ?? 0} label="races" />
        <Stat value={profile.career?.runs ?? 0} label="runs" />
      </View>
      {career.races > 0 && (
        <View style={styles.rateRow}>
          <Text style={styles.rateText}>🏆 {pct(career.podium_rate)} podium rate</Text>
          <Text style={styles.rateText}>🥇 {pct(career.win_rate)} win rate</Text>
          <Text style={styles.rateText}>🗺 {career.tracks} {career.tracks === 1 ? "track" : "tracks"}</Text>
        </View>
      )}
      {profile.career?.best_lap_s !== undefined && (
        <Text style={styles.bestLap}>⏱ best ever {profile.career.best_lap_s.toFixed(2)}s{profile.career.best_lap_track ? ` @ ${profile.career.best_lap_track}` : ""}</Text>
      )}

      <ProgressCard logbook={logbook} />


      <Text style={styles.section}>Garage · {garage.cars.length}</Text>
      <View style={styles.classRow}>
        {garage.cars.map((c) => (
          <Text key={c.id} style={styles.garageChip}>{c.name}</Text>
        ))}
        {garage.cars.length === 0 && <Text style={styles.emptyText}>No cars yet.</Text>}
      </View>

      <Pressable style={styles.cardBtn} onPress={onShareCard} disabled={busyCard}>
        <Text style={styles.cardBtnText}>{busyCard ? "Rendering…" : "⤴ Share my card"}</Text>
      </Pressable>
      <Pressable style={[styles.cardBtn, styles.ghostBtn]} onPress={onEdit}>
        <Text style={styles.ghostBtnText}>Edit profile</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ value, label, gold }: { value: number; label: string; gold?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, gold && value > 0 && { color: colors.gold }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  segBar: { flexDirection: "row", gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  seg: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  segOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  segText: { color: colors.sub, fontSize: 13, fontWeight: "700" },
  segTextOn: { color: colors.accent },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.sub, fontSize: 13, textAlign: "center", lineHeight: 19 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: "row", alignItems: "center" },
  disc: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent, alignItems: "center", justifyContent: "center" },
  discText: { color: colors.accent, fontWeight: "900" },
  handle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  when: { color: colors.sub, fontSize: 11, marginTop: 1 },
  feedLine: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 10 },
  feedMeta: { color: colors.sub, fontSize: 12, marginTop: 3 },
  feedText: { color: colors.sub, fontSize: 13, fontStyle: "italic", marginTop: 6 },
  forkBtn: { marginTop: 10, borderWidth: 1, borderColor: colors.accent, borderRadius: radius.md, paddingVertical: 9, alignItems: "center" },
  forkText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  followBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  followingBtn: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  followText: { color: colors.onAccent, fontWeight: "800", fontSize: 12 },
  followingText: { color: colors.sub },
  discoverHint: { color: colors.sub, fontSize: 12, fontStyle: "italic", marginBottom: 10 },
  profileHead: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  profileHandle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  profileName: { color: colors.text, fontSize: 14, marginTop: 1 },
  classRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  classChip: { color: colors.accent, fontSize: 11, fontWeight: "700", borderWidth: 1, borderColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  garageChip: { color: colors.text, fontSize: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" },
  section: { color: colors.sub, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  palmares: { flexDirection: "row" },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.text, fontSize: 22, fontWeight: "900" },
  statLabel: { color: colors.sub, fontSize: 10, marginTop: 2 },
  rateRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  rateText: { color: colors.sub, fontSize: 12, fontWeight: "700" },
  bestLap: { color: colors.good, fontSize: 12, fontWeight: "700", marginTop: 10 },
  cardBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, alignItems: "center", marginTop: 16 },
  cardBtnText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },
  ghostBtn: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  ghostBtnText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  offscreen: { position: "absolute", left: -10000, top: 0, width: 1080, height: 1350 },
});
