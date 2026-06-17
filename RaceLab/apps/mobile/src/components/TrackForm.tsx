import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { CORNER_FEATURES, TRACK_TRAITS } from "../../../../packages/tracks/src";
import type {
  CornerDirection,
  CornerFeature,
  CornerShape,
  CornerSpec,
  TrackEntity,
  TrackTrait,
  TrackVisibility,
} from "../../../../packages/tracks/src";
import type { CandidacyState } from "../../../../packages/social/src";
import { surfacesByDiscipline } from "../rcdata";
import { colors, radius } from "../theme";
import { ChipRow, LabeledInput, MultiChipRow, Section, num } from "./forms";
import { useT } from "../i18n";

/**
 * Track identity sheet (D25). Creatable trackside in seconds — name + surface
 * + a few trait chips is already a useful track. Corner mapping and records
 * live in collapsed sections for the evening you walk the layout properly.
 * Used both as the full editor (Tracks tab) and as a popup from the run flow.
 */

// the complete researched surface list (offroad first), ids as values
const SURFACE_OPTIONS = surfacesByDiscipline();
const SURFACE_IDS = SURFACE_OPTIONS.map((s) => s.id);
const SURFACE_LABEL = new Map(SURFACE_OPTIONS.map((s) => [s.id, s.label]));
const SHAPES: CornerShape[] = ["hairpin", "ninety", "sweeper", "chicane", "kink", "esses"];
const DIRECTIONS: CornerDirection[] = ["left", "right"];
const VISIBILITIES: TrackVisibility[] = ["private", "public"];

interface Props {
  initial?: TrackEntity;
  /** official-track candidacy (only when editing an existing track) */
  candidacyState?: CandidacyState;
  onSubmitOfficial?: () => void;
  onSave: (track: Omit<TrackEntity, "id">) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

interface CornerDraft {
  /** index into corners, or null when adding a new corner */
  index: number | null;
  name: string;
  direction: CornerDirection;
  shape?: CornerShape;
  features: CornerFeature[];
  surface: string;
  note: string;
}

interface RecordRow {
  category: string;
  conditions: string;
  lap_s: string;
  holder: string;
  date?: string; // preserved across edits, never typed by hand
}

export function TrackForm({ initial, candidacyState = "none", onSubmitOfficial, onSave, onCancel, onDelete }: Props) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [surfaces, setSurfaces] = useState<string[]>(
    initial?.surfaces ?? (initial?.surface !== undefined ? [initial.surface] : []),
  );
  const [indoor, setIndoor] = useState(initial?.indoor ?? false);
  const [visibility, setVisibility] = useState<TrackVisibility>(initial?.visibility ?? "private");
  const [traits, setTraits] = useState<TrackTrait[]>(initial?.traits ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [corners, setCorners] = useState<CornerSpec[]>(initial?.corners ?? []);
  const [lat, setLat] = useState(initial?.gps !== undefined ? String(initial.gps.lat) : "");
  const [lon, setLon] = useState(initial?.gps !== undefined ? String(initial.gps.lon) : "");
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [photoUris, setPhotoUris] = useState<string[]>(initial?.photo_uris ?? []);
  const [records, setRecords] = useState<RecordRow[]>(
    (initial?.records ?? []).map((r) => ({
      category: r.category,
      conditions: r.conditions ?? "",
      lap_s: String(r.lap_s),
      holder: r.holder ?? "",
      date: r.date,
    })),
  );
  const [showCorners, setShowCorners] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [cornerDraft, setCornerDraft] = useState<CornerDraft | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const toggleTrait = (t: TrackTrait) =>
    setTraits((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  // same idiom as the garage photo picker
  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    const asset = res.canceled ? undefined : res.assets[0];
    if (asset) setPhotoUris((prev) => [...prev, asset.uri]);
  };

  const patchRecord = (i: number, patch: Partial<RecordRow>) =>
    setRecords((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const saveCorner = () => {
    if (!cornerDraft) return;
    const at = cornerDraft.index;
    const spec: CornerSpec = {
      n: at === null ? corners.length + 1 : corners[at].n,
      name: cornerDraft.name.trim() || undefined,
      direction: cornerDraft.direction,
      shape: cornerDraft.shape,
      features: cornerDraft.features,
      surface: cornerDraft.surface.trim() || undefined,
      note: cornerDraft.note.trim() || undefined,
    };
    setCorners((prev) => (at === null ? [...prev, spec] : prev.map((c, i) => (i === at ? spec : c))));
    setCornerDraft(null);
  };

  const removeCorner = () => {
    if (!cornerDraft) return;
    const at = cornerDraft.index;
    // renumber so corner numbers stay 1..n after a removal
    if (at !== null) setCorners((prev) => prev.filter((_, i) => i !== at).map((c, i) => ({ ...c, n: i + 1 })));
    setCornerDraft(null);
  };

  const save = () => {
    const latN = num(lat);
    const lonN = num(lon);
    onSave({
      name: name.trim() || t({ en: "My track", fr: "Ma piste" }),
      surface: surfaces[0] ?? "clay", // primary — the engine reads this one
      surfaces: surfaces.length > 0 ? surfaces : undefined,
      indoor,
      visibility,
      gps: latN !== undefined && lonN !== undefined ? { lat: latN, lon: lonN } : undefined,
      length_m: initial?.length_m,
      width_m: initial?.width_m,
      traits,
      corners,
      notes: notes.trim() || undefined,
      photo_uris: photoUris.length > 0 ? photoUris : undefined,
      records: records
        .filter((r) => r.category.trim() !== "" && num(r.lap_s) !== undefined)
        .map((r) => ({
          category: r.category.trim(),
          conditions: r.conditions.trim() || undefined,
          lap_s: num(r.lap_s)!,
          holder: r.holder.trim() || undefined,
          date: r.date,
        })),
      created_at: initial?.created_at ?? new Date().toISOString(),
    });
  };

  const editCorner = (c: CornerSpec, i: number) =>
    setCornerDraft({
      index: i,
      name: c.name ?? "",
      direction: c.direction,
      shape: c.shape,
      features: c.features,
      surface: c.surface ?? "",
      note: c.note ?? "",
    });

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Text style={styles.title}>{initial ? t({ en: "Edit track", fr: "Modifier la piste" }) : t({ en: "New track", fr: "Nouvelle piste" })}</Text>

      <Section title={t({ en: "Track", fr: "Piste" })}>
        <LabeledInput label={t({ en: "Track name", fr: "Nom de la piste" })} value={name} onChangeText={setName} placeholder={t({ en: "e.g. MRT outdoor", fr: "ex. MRT extérieur" })} />
        <Text style={styles.hint}>{t({ en: "Surfaces — tap all that apply (first = main)", fr: "Surfaces — touche toutes celles qui s’appliquent (la première = principale)" })}</Text>
        <MultiChipRow
          options={SURFACE_IDS}
          values={surfaces}
          onToggle={(s) => setSurfaces((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))}
          labelFor={(s) => SURFACE_LABEL.get(s) ?? s}
        />
        <Text style={styles.hint}>{t({ en: "Indoor / outdoor", fr: "Intérieur / extérieur" })}</Text>
        <ChipRow
          options={["outdoor", "indoor"] as const}
          value={indoor ? "indoor" : "outdoor"}
          onSelect={(v) => setIndoor(v === "indoor")}
          labelFor={(v) => (v === "indoor" ? t({ en: "indoor", fr: "intérieur" }) : t({ en: "outdoor", fr: "extérieur" }))}
        />
        <Text style={styles.hint}>{t({ en: "Visibility", fr: "Visibilité" })}</Text>
        <ChipRow
          options={VISIBILITIES}
          value={visibility}
          onSelect={setVisibility}
          labelFor={(v) => (v === "public" ? t({ en: "public", fr: "publique" }) : t({ en: "private", fr: "privée" }))}
        />
        <Text style={styles.visHint}>{t({ en: "public tracks join the shared library once sync ships", fr: "les pistes publiques rejoindront la bibliothèque partagée dès la sortie de la synchro" })}</Text>
      </Section>

      <Section title={t({ en: "Quick traits — tap what describes this track", fr: "Caractéristiques rapides — touche ce qui décrit cette piste" })}>
        <MultiChipRow options={TRACK_TRAITS} values={traits} onToggle={toggleTrait} />
      </Section>

      <LabeledInput label={t({ en: "Notes", fr: "Notes" })} value={notes} onChangeText={setNotes} placeholder={t({ en: 'e.g. "second lane blows out by Sunday"', fr: 'ex. « la deuxième ligne se dégrade d’ici dimanche »' })} />

      <FoldHeader
        title={t({ en: "Corner by corner (optional)", fr: "Virage par virage (optionnel)" })}
        sub={
          corners.length > 0
            ? t({
                en: `${corners.length} corner${corners.length > 1 ? "s" : ""} mapped`,
                fr: `${corners.length} virage${corners.length > 1 ? "s" : ""} tracé${corners.length > 1 ? "s" : ""}`,
              })
            : t({ en: "map the layout when you have a minute", fr: "trace le tracé quand tu as une minute" })
        }
        open={showCorners}
        onPress={() => setShowCorners((v) => !v)}
      />
      {showCorners && (
        <View style={styles.foldBody}>
          {corners.map((c, i) => (
            <React.Fragment key={`${c.n}-${i}`}>
              <Pressable style={styles.cornerRow} onPress={() => editCorner(c, i)}>
                <Text style={styles.cornerNum}>#{c.n}</Text>
                <Text style={styles.cornerDir}>{c.direction === "left" ? "L" : "R"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cornerMain}>
                    {c.name ? `${c.name} · ` : ""}
                    {(c.shape ?? t({ en: "corner", fr: "virage" })).replace(/_/g, " ")}
                    {c.features.length > 0
                      ? t({
                          en: ` · ${c.features.length} feature${c.features.length > 1 ? "s" : ""}`,
                          fr: ` · ${c.features.length} caractéristique${c.features.length > 1 ? "s" : ""}`,
                        })
                      : ""}
                  </Text>
                  {!!c.note && (
                    <Text style={styles.cornerNote} numberOfLines={1}>
                      {c.note}
                    </Text>
                  )}
                </View>
              </Pressable>
              {cornerDraft !== null && cornerDraft.index === i && (
                <CornerEditor draft={cornerDraft} onChange={setCornerDraft} onSave={saveCorner} onRemove={removeCorner} />
              )}
            </React.Fragment>
          ))}
          {cornerDraft !== null && cornerDraft.index === null && (
            <CornerEditor draft={cornerDraft} onChange={setCornerDraft} onSave={saveCorner} onRemove={removeCorner} />
          )}
          {(cornerDraft === null || cornerDraft.index !== null) && (
            <Pressable
              style={styles.addRowBtn}
              onPress={() => setCornerDraft({ index: null, name: "", direction: "left", features: [], surface: "", note: "" })}
            >
              <Text style={styles.addRowText}>{t({ en: "+ add corner", fr: "+ ajouter un virage" })}</Text>
            </Pressable>
          )}
        </View>
      )}

      <FoldHeader title={t({ en: "More details", fr: "Plus de détails" })} sub={t({ en: "location · photos · lap records", fr: "localisation · photos · records au tour" })} open={showMore} onPress={() => setShowMore((v) => !v)} />
      {showMore && (
        <View style={styles.foldBody}>
          <Text style={styles.hint}>{t({ en: "GPS — lets the run log pull weather automatically", fr: "GPS — permet à la session de récupérer la météo automatiquement" })}</Text>
          <Pressable
            style={styles.locateBtn}
            disabled={locating}
            onPress={() => {
              void (async () => {
                setLocError(null);
                setLocating(true);
                try {
                  const perm = await Location.requestForegroundPermissionsAsync();
                  if (!perm.granted) {
                    setLocError(t({ en: "Location permission denied — you can still type coordinates below.", fr: "Autorisation de localisation refusée — tu peux quand même saisir les coordonnées ci-dessous." }));
                    return;
                  }
                  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                  setLat(pos.coords.latitude.toFixed(5));
                  setLon(pos.coords.longitude.toFixed(5));
                } catch {
                  setLocError(t({ en: "Could not get a fix — move outdoors or type coordinates below.", fr: "Impossible d’obtenir un point — sors à l’extérieur ou saisis les coordonnées ci-dessous." }));
                } finally {
                  setLocating(false);
                }
              })();
            }}
          >
            {locating ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={styles.locateText}>
                {lat && lon
                  ? t({ en: "📍 Update to my current location", fr: "📍 Mettre à jour vers ma position actuelle" })
                  : t({ en: "📍 Use my current location", fr: "📍 Utiliser ma position actuelle" })}
              </Text>
            )}
          </Pressable>
          {locError && <Text style={styles.locError}>{locError}</Text>}
          {lat !== "" && lon !== "" && <Text style={styles.locSet}>{t({ en: `Pinned at ${lat}, ${lon}`, fr: `Épinglé à ${lat}, ${lon}` })}</Text>}

          <Text style={styles.hint}>{t({ en: "Photos", fr: "Photos" })}</Text>
          <View style={styles.photoRow}>
            {photoUris.map((uri, i) => (
              <View key={`${uri}-${i}`} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} />
                <Pressable style={styles.thumbRemove} hitSlop={8} onPress={() => setPhotoUris((prev) => prev.filter((_, j) => j !== i))}>
                  <Text style={styles.thumbRemoveText}>✕</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.thumbAdd} onPress={() => void pickPhoto()}>
              <Text style={styles.thumbAddText}>＋</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>{t({ en: "Lap records — auto-updated from your run results, editable here", fr: "Records au tour — mis à jour automatiquement depuis tes résultats de session, modifiables ici" })}</Text>
          {records.map((r, i) => (
            <View key={i} style={styles.recordRow}>
              <View style={styles.recordHead}>
                <Text style={styles.recordIndex}>{t({ en: `record ${i + 1}`, fr: `record ${i + 1}` })}</Text>
                <Pressable hitSlop={8} onPress={() => setRecords((prev) => prev.filter((_, j) => j !== i))}>
                  <Text style={styles.recordRemove}>{t({ en: "✕ remove", fr: "✕ supprimer" })}</Text>
                </Pressable>
              </View>
              <View style={styles.twoCol}>
                <View style={{ flex: 2 }}>
                  <LabeledInput label={t({ en: "Category", fr: "Catégorie" })} value={r.category} onChangeText={(v) => patchRecord(i, { category: v })} placeholder={t({ en: 'e.g. "1/8 nitro buggy"', fr: 'ex. « buggy nitro 1/8 »' })} />
                </View>
                <View style={{ flex: 1 }}>
                  <LabeledInput label={t({ en: "Lap (s)", fr: "Tour (s)" })} value={r.lap_s} onChangeText={(v) => patchRecord(i, { lap_s: v })} keyboardType="decimal-pad" placeholder="31.2" />
                </View>
              </View>
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <LabeledInput label={t({ en: "Conditions", fr: "Conditions" })} value={r.conditions} onChangeText={(v) => patchRecord(i, { conditions: v })} placeholder={t({ en: "optional", fr: "optionnel" })} />
                </View>
                <View style={{ flex: 1 }}>
                  <LabeledInput label={t({ en: "Holder", fr: "Détenteur" })} value={r.holder} onChangeText={(v) => patchRecord(i, { holder: v })} placeholder={t({ en: "optional", fr: "optionnel" })} />
                </View>
              </View>
            </View>
          ))}
          <Pressable
            style={styles.addRowBtn}
            onPress={() => setRecords((prev) => [...prev, { category: "", conditions: "", lap_s: "", holder: "" }])}
          >
            <Text style={styles.addRowText}>{t({ en: "+ add record", fr: "+ ajouter un record" })}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onCancel}>
          <Text style={styles.btnGhostText}>{t({ en: "Cancel", fr: "Annuler" })}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={save}>
          <Text style={styles.btnPrimaryText}>{initial ? t({ en: "Save track", fr: "Enregistrer la piste" }) : t({ en: "Add track", fr: "Ajouter la piste" })}</Text>
        </Pressable>
      </View>

      {onSubmitOfficial && (
        <Pressable
          style={[styles.officialBtn, candidacyState !== "none" && candidacyState !== "rejected" && styles.officialBtnDone]}
          disabled={candidacyState === "candidate" || candidacyState === "official"}
          onPress={onSubmitOfficial}
        >
          <Text style={styles.officialBtnText}>
            {candidacyState === "official"
              ? t({ en: "🏁 Official track ✓", fr: "🏁 Piste officielle ✓" })
              : candidacyState === "candidate"
                ? t({ en: "⏳ Pending review", fr: "⏳ En attente de validation" })
                : candidacyState === "rejected"
                  ? t({ en: "Submit again as official", fr: "Soumettre à nouveau comme officielle" })
                  : t({ en: "🏁 Submit as official track", fr: "🏁 Soumettre comme piste officielle" })}
          </Text>
          {candidacyState === "none" && (
            <Text style={styles.officialBtnHint}>{t({ en: "Curators vet it into the shared library + leaderboard", fr: "Les curateurs la valident pour la bibliothèque partagée + le classement" })}</Text>
          )}
        </Pressable>
      )}

      {onDelete && (
        <View style={styles.deleteZone}>
          {deleteArmed && (
            <Text style={styles.deleteWarn}>
              {t({
                en: "This permanently removes the track and its records — runs that referenced it keep their own copy of its name.",
                fr: "Ceci supprime définitivement la piste et ses records — les sessions qui la référençaient gardent leur propre copie de son nom.",
              })}
            </Text>
          )}
          <Pressable
            style={[styles.deleteBtn, deleteArmed && styles.deleteBtnArmed]}
            onPress={() => (deleteArmed ? onDelete() : setDeleteArmed(true))}
          >
            <Text style={[styles.deleteText, deleteArmed && styles.deleteTextArmed]}>
              {deleteArmed ? t({ en: "Tap again to delete track", fr: "Touche à nouveau pour supprimer la piste" }) : t({ en: "Delete track", fr: "Supprimer la piste" })}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

/** Collapsed-section header: tap to fold/unfold. */
function FoldHeader({ title, sub, open, onPress }: { title: string; sub?: string; open: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.fold} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.foldTitle}>{title}</Text>
        {sub !== undefined && <Text style={styles.foldSub}>{sub}</Text>}
      </View>
      <Text style={styles.foldChevron}>{open ? "▾" : "▸"}</Text>
    </Pressable>
  );
}

/** Inline corner editor — chips first, keyboards only for overrides. */
function CornerEditor({
  draft,
  onChange,
  onSave,
  onRemove,
}: {
  draft: CornerDraft;
  onChange: (d: CornerDraft) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const toggleFeature = (f: CornerFeature) =>
    onChange({
      ...draft,
      features: draft.features.includes(f) ? draft.features.filter((x) => x !== f) : [...draft.features, f],
    });
  return (
    <View style={styles.cornerEditor}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
        <View>
          <Text style={styles.hint}>{t({ en: "Direction", fr: "Direction" })}</Text>
          <ChipRow
            options={DIRECTIONS}
            value={draft.direction}
            onSelect={(d) => onChange({ ...draft, direction: d })}
            labelFor={(d) => (d === "left" ? "L" : "R")}
          />
        </View>
        <View style={{ flex: 1 }}>
          <LabeledInput
            label={t({ en: "Corner name", fr: "Nom du virage" })}
            value={draft.name}
            onChangeText={(v) => onChange({ ...draft, name: v })}
            placeholder={t({ en: 'e.g. "le triple"', fr: 'ex. « le triple »' })}
          />
        </View>
      </View>
      <Text style={styles.hint}>{t({ en: "Shape", fr: "Forme" })}</Text>
      <ChipRow options={SHAPES} value={draft.shape} onSelect={(s) => onChange({ ...draft, shape: draft.shape === s ? undefined : s })} />
      <Text style={styles.hint}>{t({ en: "Features", fr: "Caractéristiques" })}</Text>
      <MultiChipRow options={CORNER_FEATURES} values={draft.features} onToggle={toggleFeature} />
      <View style={{ height: 8 }} />
      <LabeledInput
        label={t({ en: "Surface override", fr: "Surface spécifique" })}
        value={draft.surface}
        onChangeText={(v) => onChange({ ...draft, surface: v })}
        placeholder={t({ en: "only if different from the track", fr: "seulement si différente de la piste" })}
      />
      <LabeledInput
        label={t({ en: "Note", fr: "Note" })}
        value={draft.note}
        onChangeText={(v) => onChange({ ...draft, note: v })}
        placeholder={t({ en: 'e.g. "inside kerb launches the car"', fr: 'ex. « le vibreur intérieur fait sauter la voiture »' })}
      />
      <View style={styles.cornerEditorBtns}>
        <Pressable style={[styles.smallBtn, styles.smallGhost]} onPress={onRemove}>
          <Text style={styles.smallWarnText}>{draft.index === null ? t({ en: "discard", fr: "abandonner" }) : t({ en: "remove", fr: "supprimer" })}</Text>
        </Pressable>
        <Pressable style={[styles.smallBtn, styles.smallPrimary]} onPress={onSave}>
          <Text style={styles.smallPrimaryText}>{t({ en: "Save corner", fr: "Enregistrer le virage" })}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const card = { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md } as const;
const thumbBox = { width: 72, height: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border } as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 14 },
  hint: { color: colors.sub, fontSize: 12, marginTop: 8, marginBottom: 4 },
  visHint: { color: colors.sub, fontSize: 11, marginTop: 6, fontStyle: "italic" },
  fold: { ...card, flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  foldTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  foldSub: { color: colors.sub, fontSize: 11, marginTop: 2 },
  foldChevron: { color: colors.sub, fontSize: 14, marginLeft: 8 },
  foldBody: { marginBottom: 14 },
  cornerRow: { ...card, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6 },
  cornerNum: { color: colors.accent, fontSize: 13, fontWeight: "800", width: 30 },
  cornerDir: { color: colors.text, fontSize: 12, fontWeight: "800", width: 16 },
  cornerMain: { color: colors.text, fontSize: 13 },
  cornerNote: { color: colors.sub, fontSize: 11, marginTop: 1 },
  cornerEditor: { ...card, backgroundColor: colors.cardAlt, borderColor: colors.accent, padding: 10, marginBottom: 8 },
  cornerEditorBtns: { flexDirection: "row", gap: 8, marginTop: 4 },
  smallBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 9, alignItems: "center" },
  smallPrimary: { backgroundColor: colors.accent },
  smallPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  smallGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  smallWarnText: { color: colors.warn, fontWeight: "700", fontSize: 13 },
  addRowBtn: { borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 10, alignItems: "center", marginTop: 2 },
  addRowText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  twoCol: { flexDirection: "row", gap: 8 },
  locateBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: "dashed",
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: "center",
    marginBottom: 6,
  },
  locateText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  locError: { color: colors.warn, fontSize: 11, marginBottom: 4 },
  locSet: { color: colors.good, fontSize: 11, marginBottom: 4 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  thumbWrap: { position: "relative" },
  thumb: { ...thumbBox },
  thumbRemove: { position: "absolute", top: -6, right: -6, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 999, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  thumbRemoveText: { color: colors.sub, fontSize: 10 },
  thumbAdd: { ...thumbBox, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  thumbAddText: { color: colors.accent, fontSize: 22 },
  recordRow: { ...card, padding: 10, marginBottom: 8 },
  recordHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  recordIndex: { color: colors.sub, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  recordRemove: { color: colors.warn, fontSize: 11, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  officialBtn: {
    marginTop: 14,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  officialBtnDone: { opacity: 0.7 },
  officialBtnText: { color: colors.accent, fontWeight: "800", fontSize: 14 },
  officialBtnHint: { color: colors.sub, fontSize: 11, marginTop: 3 },
  deleteZone: { marginTop: 18 },
  deleteWarn: { color: colors.warn, fontSize: 12, marginBottom: 6, lineHeight: 17 },
  deleteBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 11, alignItems: "center" },
  deleteBtnArmed: { borderColor: colors.warn, backgroundColor: colors.accentSoft },
  deleteText: { color: colors.sub, fontWeight: "700", fontSize: 13 },
  deleteTextArmed: { color: colors.warn, fontWeight: "800" },
});
