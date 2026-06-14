import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { addTrack, deleteTrack, updateTrack } from "../../../../packages/tracks/src";
import type { LapRecord, TrackEntity, TracksState } from "../../../../packages/tracks/src";
import { getCandidacy } from "../../../../packages/social/src";
import type { CandidacyData, CandidacyState } from "../../../../packages/social/src";
import { Overlay } from "../components/Overlay";
import { TrackForm } from "../components/TrackForm";
import { colors, radius } from "../theme";

/**
 * Tracks library (D25). Each card is a venue the engineer knows: surface,
 * character traits, mapped corners and the lap records set there. Tap a card
 * to edit it with the same TrackForm the run flow uses as a popup.
 */

interface Props {
  tracks: TracksState;
  updateTracks: (fn: (prev: TracksState) => TracksState) => void;
  candidacy: CandidacyData;
  onSubmitOfficial: (trackId: string) => void;
  onOpenOfficial: () => void;
}

export function TracksScreen({ tracks, updateTracks, candidacy, onSubmitOfficial, onOpenOfficial }: Props) {
  const [modal, setModal] = useState<null | "new" | { edit: TrackEntity }>(null);
  const editing = modal !== null && modal !== "new" ? modal.edit : undefined;
  const editingState: CandidacyState = editing ? getCandidacy(candidacy, editing.id)?.state ?? "none" : "none";

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>
          Tracks <Text style={styles.count}>· {tracks.tracks.length}</Text>
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.addBtn} onPress={onOpenOfficial}>
            <Text style={styles.addBtnText}>🏁 Official</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => setModal("new")}>
            <Text style={styles.addBtnText}>＋ Add track</Text>
          </Pressable>
        </View>
      </View>

      {tracks.tracks.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No tracks yet</Text>
          <Text style={styles.meta}>
            Add the places you race — the engineer reads your track's character: bumps, kerbs,
            banking all change the right setup. A name and a surface is enough to start; map
            corners later.
          </Text>
        </View>
      )}

      {tracks.tracks.map((track) => (
        <TrackCard
          key={track.id}
          track={track}
          candidacy={getCandidacy(candidacy, track.id)?.state ?? "none"}
          onPress={() => setModal({ edit: track })}
        />
      ))}

    </ScrollView>
      <Overlay visible={modal !== null}>
        {modal !== null && (
          <TrackForm
            initial={editing}
            candidacyState={editingState}
            onSubmitOfficial={editing ? () => onSubmitOfficial(editing.id) : undefined}
            onCancel={() => setModal(null)}
            onSave={(track) => {
              if (editing) {
                updateTracks((prev) => updateTrack(prev, editing.id, track));
              } else {
                updateTracks((prev) => addTrack(prev, track, new Date().toISOString()).state);
              }
              setModal(null);
            }}
            onDelete={
              editing
                ? () => {
                    updateTracks((prev) => deleteTrack(prev, editing.id));
                    setModal(null);
                  }
                : undefined
            }
          />
        )}
      </Overlay>
    </View>
  );
}

/** Fastest lap ever set at this track, across all categories/conditions. */
function bestRecord(track: TrackEntity): LapRecord | undefined {
  return track.records.reduce<LapRecord | undefined>(
    (best, r) => (best === undefined || r.lap_s < best.lap_s ? r : best),
    undefined,
  );
}

function TrackCard({ track, candidacy, onPress }: { track: TrackEntity; candidacy: CandidacyState; onPress: () => void }) {
  const best = bestRecord(track);
  const shown = track.traits.slice(0, 4);
  const extra = track.traits.length - shown.length;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardHead}>
        <Text style={styles.name} numberOfLines={1}>
          {track.name}
        </Text>
        {candidacy === "official" && <Text style={styles.officialBadge}>🏁 OFFICIAL</Text>}
        {candidacy === "candidate" && <Text style={styles.pendingBadge}>⏳ PENDING</Text>}
        {candidacy === "none" && track.visibility === "public" && <Text style={styles.publicBadge}>PUBLIC</Text>}
      </View>
      <Text style={styles.meta}>
        {track.surface} · {track.indoor ? "indoor" : "outdoor"}
      </Text>

      {track.traits.length > 0 && (
        <View style={styles.traitRow}>
          {shown.map((t) => (
            <Text key={t} style={styles.trait}>
              {t.replace(/_/g, " ")}
            </Text>
          ))}
          {extra > 0 && <Text style={styles.trait}>+{extra}</Text>}
        </View>
      )}

      {track.corners.length > 0 && (
        <Text style={styles.fact}>
          {track.corners.length} corner{track.corners.length > 1 ? "s" : ""} mapped
        </Text>
      )}
      {best && (
        <Text style={styles.fact}>
          ⏱ best {best.lap_s.toFixed(2)}s · {best.category}
          {best.conditions ? ` (${best.conditions})` : ""}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  h1: { color: colors.text, fontSize: 28, fontWeight: "800" },
  count: { color: colors.sub, fontWeight: "400", fontSize: 20 },
  addBtn: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  addBtnText: { color: colors.sub, fontSize: 13, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 14,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: colors.text, fontSize: 18, fontWeight: "800", flex: 1 },
  publicBadge: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: "hidden",
  },
  officialBadge: {
    color: "#FFD700",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: "#FFD700",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: "hidden",
  },
  pendingBadge: {
    color: colors.warn,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: colors.warn,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: "hidden",
  },
  meta: { color: colors.sub, fontSize: 13, marginTop: 4, lineHeight: 18 },
  traitRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  trait: {
    color: colors.sub,
    fontSize: 11,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
    overflow: "hidden",
  },
  fact: { color: colors.sub, fontSize: 12, marginTop: 6 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800", marginBottom: 6 },
});
