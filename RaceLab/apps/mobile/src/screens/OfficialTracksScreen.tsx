import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TracksState } from "../../../../packages/tracks/src";
import type { CandidacyData } from "../../../../packages/social/src";
import { colors, radius } from "../theme";

/**
 * Official Tracks (Strava-segments for RC). Admin-curated: a track you "submit
 * as official" becomes a candidate (Pending review) until a curator approves it;
 * official tracks then expose a community leaderboard from aggregated lap records
 * (gated n≥8). Approval + aggregation are backend — this view shows local
 * candidacy state and explains the model until the server lands.
 */

const LEADERBOARD_MIN = 8; // n≥8 anti-deanonymization gate (social spec §5)

export function OfficialTracksScreen({
  tracks,
  candidacy,
  onClose,
}: {
  tracks: TracksState;
  candidacy: CandidacyData;
  onClose: () => void;
}) {
  const byId = new Map(tracks.tracks.map((t) => [t.id, t]));
  const candidates = candidacy.items.filter((i) => i.state === "candidate");
  const official = candidacy.items.filter((i) => i.state === "official");

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>‹ Tracks</Text>
        </Pressable>
        <Text style={styles.title}>Official tracks</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
        <View style={styles.intro}>
          <Text style={styles.introText}>
            Submit a track to become an <Text style={{ color: colors.accent, fontWeight: "800" }}>official</Text>{" "}
            venue — once a curator approves it, everyone races the same canonical track and its lap records become a
            community leaderboard.
          </Text>
        </View>

        <Text style={styles.section}>Pending review · {candidates.length}</Text>
        {candidates.length === 0 ? (
          <Text style={styles.hint}>
            Open a track and tap “Submit as official” to put it forward. It queues here and syncs for review when you're
            online.
          </Text>
        ) : (
          candidates.map((c) => {
            const t = byId.get(c.track_id);
            return (
              <View key={c.track_id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{t?.name ?? "Track"}</Text>
                  <Text style={styles.rowMeta}>
                    submitted {c.submitted_at ? c.submitted_at.slice(0, 10) : "—"}
                  </Text>
                </View>
                <Text style={styles.pending}>⏳ Pending review</Text>
              </View>
            );
          })
        )}

        <Text style={styles.section}>Official · {official.length}</Text>
        {official.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>No official tracks yet</Text>
            <Text style={styles.hint}>
              Approved venues appear here with a leaderboard per category and conditions. Leaderboards unlock at{" "}
              {LEADERBOARD_MIN}+ racers so small clubs stay anonymous.
            </Text>
          </View>
        ) : (
          official.map((c) => {
            const t = byId.get(c.track_id);
            const records = t?.records ?? [];
            return (
              <View key={c.track_id} style={styles.card}>
                <Text style={styles.rowName}>🏁 {t?.name ?? "Track"}</Text>
                {records.length > 0 ? (
                  records.slice(0, 5).map((r, i) => (
                    <View key={i} style={styles.lbRow}>
                      <Text style={styles.lbCat}>
                        {r.category}
                        {r.conditions ? ` · ${r.conditions}` : ""}
                      </Text>
                      <Text style={styles.lbLap}>{r.lap_s.toFixed(2)}s</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.hint}>No records logged here yet.</Text>
                )}
                <Text style={styles.gate}>Community leaderboard unlocks at {LEADERBOARD_MIN}+ racers (syncs with the backend).</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: 15, fontWeight: "700" },
  title: { color: colors.text, fontSize: 16, fontWeight: "800" },
  intro: { backgroundColor: colors.accentSoft, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, padding: 14, marginBottom: 14 },
  introText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  section: { color: colors.sub, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginTop: 10, marginBottom: 8 },
  hint: { color: colors.sub, fontSize: 12, lineHeight: 18, fontStyle: "italic" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 13,
    marginBottom: 8,
  },
  rowName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowMeta: { color: colors.sub, fontSize: 11, marginTop: 2 },
  pending: { color: colors.warn, fontSize: 12, fontWeight: "700" },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 8 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 6 },
  lbRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 6 },
  lbCat: { color: colors.sub, fontSize: 12, flex: 1 },
  lbLap: { color: colors.text, fontSize: 13, fontWeight: "800" },
  gate: { color: colors.sub, fontSize: 10, fontStyle: "italic", marginTop: 10 },
});
