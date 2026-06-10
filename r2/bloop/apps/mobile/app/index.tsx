import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PlayerProfile } from '@bloop/protocol';
import { AVATARS } from '../src/avatars';
import { Avatar } from '../src/components/players';
import { AppText, PrimaryButton, SecondaryButton, ToastHost } from '../src/components/ui';
import { CodeInput } from '../src/components/room';
import { roomsUrl, SERVER_URL } from '../src/config';
import type { SessionToast } from '../src/net/session';
import { loadProfile, normalizeNickname, randomProfile, saveProfile } from '../src/storage/profile';
import { useTheme } from '../src/theme/useTheme';

export default function Home() {
  const { theme, tokens } = useTheme();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [nickDraft, setNickDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<SessionToast | null>(null);
  const oops = (text: string) => setToast((t) => ({ seq: (t?.seq ?? 0) + 1, kind: 'error', text }));

  useEffect(() => {
    void (async () => {
      let p = await loadProfile(AsyncStorage);
      if (p === null) { p = randomProfile(); await saveProfile(AsyncStorage, p); } // §5: instant anonymous identity
      setProfile(p);
      setNickDraft(p.nickname);
    })();
  }, []);

  if (profile === null) return null;

  const update = (p: PlayerProfile) => { setProfile(p); void saveProfile(AsyncStorage, p); };
  const commitNickname = () => {
    const n = normalizeNickname(nickDraft);
    if (n === null) { setNickDraft(profile.nickname); return; }
    setNickDraft(n);
    update({ ...profile, nickname: n });
  };

  const createRoom = async () => {
    Keyboard.dismiss();
    commitNickname();
    setCreating(true);
    try {
      const res = await fetch(roomsUrl(SERVER_URL), { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { code: string };
      router.push(`/room/${body.code}/lobby`);
    } catch {
      oops("Couldn't reach the bloop server — is wrangler dev running?");
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = () => {
    Keyboard.dismiss();
    commitNickname();
    router.push(`/room/${code}/lobby`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ToastHost toast={toast} />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.xxl, alignItems: 'stretch' }}>
          <AppText role="titleL" style={{ textAlign: 'center', marginTop: tokens.spacing.xxl }}>BLOOP 🫧</AppText>

          {/* Identity card — the only "onboarding" (§4.2) */}
          <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, gap: tokens.spacing.lg, ...tokens.elevation.e1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.lg }}>
              <Pressable onPress={() => setPickerOpen((o) => !o)} accessibilityLabel="Change avatar">
                <Avatar avatarId={profile.avatar} size="lg" ring="you" />
              </Pressable>
              <TextInput
                value={nickDraft} onChangeText={setNickDraft} onBlur={commitNickname} maxLength={20}
                placeholder="Your nickname" placeholderTextColor={theme.textMuted}
                style={{ flex: 1, ...tokens.type.headline, color: theme.textPrimary, borderBottomWidth: 2, borderColor: theme.border, paddingVertical: tokens.spacing.sm }}
              />
            </View>
            {pickerOpen && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, justifyContent: 'center' }}>
                {AVATARS.map((a) => (
                  <Pressable key={a.id} accessibilityLabel={a.label} onPress={() => { update({ ...profile, avatar: a.id }); setPickerOpen(false); }}>
                    <Avatar avatarId={a.id} size="md" ring={a.id === profile.avatar ? 'you' : null} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Join (primary per 3a brief) */}
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>GOT A CODE?</AppText>
            <CodeInput value={code} onChange={setCode} />
            <PrimaryButton label="Join Game" onPress={joinRoom} disabled={code.length !== 4} />
          </View>

          <SecondaryButton label="Create Room" onPress={() => void createRoom()} disabled={creating} />
          <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>No accounts. Nothing stored about you. 2–16 players.</AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
