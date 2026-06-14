import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { Account, ExperienceLevel } from "../accountstore";
import { LEVELS } from "../accountstore";
import { ChipRow, KeyboardAwareForm, LabeledInput, MultiChipRow, Section } from "./forms";
import { colors, radius } from "../theme";

/**
 * Edit your driver identity (D32+): handle, display name, avatar, home track,
 * classes raced + level. The handle is what attributes your shared setups, so
 * it's stripped to a clean @-safe token on save.
 */

const CLASS_OPTIONS = [
  "1/8 nitro buggy",
  "1/8 e-buggy",
  "1/8 truggy",
  "1/10 2WD buggy",
  "1/10 4WD buggy",
  "stadium truck",
  "short course",
  "touring",
  "1/12 pan",
  "F1",
];

function cleanHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").replace(/[^a-z0-9_-]+/gi, "").slice(0, 24).toLowerCase();
}

export function ProfileEditForm({
  account,
  setAccount,
  onClose,
}: {
  account: Account;
  setAccount: (patch: Partial<Account>) => void;
  onClose: () => void;
}) {
  const [handle, setHandle] = useState(account.handle ?? "");
  const [displayName, setDisplayName] = useState(account.display_name ?? "");
  const [avatar, setAvatar] = useState(account.avatar_uri);
  const [country, setCountry] = useState(account.country ?? "");
  const [homeTrack, setHomeTrack] = useState(account.home_track ?? "");
  const [level, setLevel] = useState<ExperienceLevel | undefined>(account.level);
  const [classes, setClasses] = useState<string[]>(account.classes ?? []);

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [1, 1] });
    if (!res.canceled && res.assets[0]) setAvatar(res.assets[0].uri);
  };

  const save = () => {
    setAccount({
      handle: cleanHandle(handle) || undefined,
      display_name: displayName.trim() || undefined,
      avatar_uri: avatar,
      country: country.trim() || undefined,
      home_track: homeTrack.trim() || undefined,
      level,
      classes: classes.length > 0 ? classes : undefined,
    });
    onClose();
  };

  const toggleClass = (c: string) => setClasses((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>‹ Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Edit profile</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAwareForm contentStyle={{ padding: 14, paddingBottom: 30 }}>
        <View style={styles.avatarRow}>
          <Pressable onPress={() => void pickAvatar()}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarDisc}>
                <Text style={styles.avatarInitial}>{(handle || "?").charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.avatarEdit}>change photo</Text>
          </Pressable>
        </View>

        <Section title="Identity">
          <LabeledInput label="Handle (@)" value={handle} onChangeText={setHandle} placeholder="theo" autoCapitalize="none" autoCorrect={false} />
          <Text style={styles.hint}>Your @handle attributes every setup you share.</Text>
          <LabeledInput label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="optional" />
          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Country" value={country} onChangeText={setCountry} placeholder="FR" />
            </View>
            <View style={{ flex: 2 }}>
              <LabeledInput label="Home track" value={homeTrack} onChangeText={setHomeTrack} placeholder="MRT outdoor" />
            </View>
          </View>
        </Section>

        <Section title="Level">
          <ChipRow options={LEVELS} value={level} onSelect={(v) => setLevel(level === v ? undefined : v)} />
        </Section>

        <Section title="Classes raced">
          <MultiChipRow options={CLASS_OPTIONS} values={classes} onToggle={toggleClass} />
        </Section>

        <Pressable style={styles.saveBtn} onPress={save} accessibilityRole="button" accessibilityLabel="Save profile">
          <Text style={styles.saveBtnText}>Save profile</Text>
        </Pressable>
      </KeyboardAwareForm>
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
  avatarRow: { alignItems: "center", marginVertical: 12 },
  avatarImg: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: colors.accent },
  avatarDisc: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accent, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: colors.accent, fontSize: 42, fontWeight: "900" },
  avatarEdit: { color: colors.sub, fontSize: 11, textAlign: "center", marginTop: 6 },
  hint: { color: colors.sub, fontSize: 11, fontStyle: "italic", marginTop: -4, marginBottom: 4 },
  twoCol: { flexDirection: "row", gap: 8 },
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", marginTop: 10 },
  saveBtnText: { color: colors.onAccent, fontWeight: "800", fontSize: 15 },
});
