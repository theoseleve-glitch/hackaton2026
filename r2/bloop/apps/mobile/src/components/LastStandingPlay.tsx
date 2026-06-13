import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { LastStandingView, TurnOutcome } from '@bloop/game-last-standing';
import { asLastStandingView, deviceLang, pickL, type Lang } from '../games/last-standing-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import { Avatar } from './players';
import { AppText, PrimaryButton, SecondaryButton } from './ui';

const UNKNOWN: Omit<RoomPlayer, 'id'> = { profile: { nickname: '???', avatar: '' }, connected: false, isHost: false };

type InRoundView = Exclude<LastStandingView, { phase: 'over' }>;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Stamp copy per turn outcome (result beat). */
const STAMP: Record<TurnOutcome, { fr: string; en: string; ok: boolean }> = {
  valid: { fr: 'VALIDÉ ✅', en: 'VALID ✅', ok: true },
  rejected: { fr: '💥 REJETÉ PAR LE JURY — ÉLIMINÉ', en: '💥 REJECTED BY THE JURY — ELIMINATED', ok: false },
  timeout: { fr: '⏰ TROP TARD — ÉLIMINÉ', en: '⏰ TOO SLOW — ELIMINATED', ok: false },
  gaveUp: { fr: '🏳️ ABANDON', en: '🏳️ GAVE UP', ok: false },
  left: { fr: '🔌 DÉCONNECTÉ — ÉLIMINÉ', en: '🔌 DISCONNECTED — ELIMINATED', ok: false },
};

/** The drawn round card: theme sentence + giant letter, SHOUTY-readable at arm's length. */
function ThemeCard({ v, lang }: { v: InRoundView; lang: Lang }) {
  const { theme, tokens } = useTheme();
  if (v.current === null) return null;
  return (
    <View
      accessibilityLabel={`${pickL(v.current.theme, lang)} — ${v.current.letter}`}
      style={{
        backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding,
        alignItems: 'center', gap: tokens.spacing.sm, ...tokens.elevation.e2,
      }}>
      <AppText role="titleM" style={{ textAlign: 'center' }}>{pickL(v.current.theme, lang)}</AppText>
      <View style={{
        backgroundColor: theme.brand, borderRadius: tokens.radii.lg, paddingHorizontal: tokens.spacing.xl,
        paddingVertical: tokens.spacing.sm, borderWidth: 3, borderColor: theme.stickerOutline,
      }}>
        <AppText role="displayL" style={{ color: '#FFFFFF' }}>{v.current.letter}</AppText>
      </View>
    </View>
  );
}

/** Seat-order strip: spotlight ring, eliminated skull + dim, connection dot. */
function Roster({ v, nick }: { v: InRoundView; nick: (id: string) => string }) {
  const { tokens } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md, justifyContent: 'center' }}>
      {v.rotation.map((id) => {
        const out = v.alive[id] !== true;
        const spot = v.spotlight === id;
        return (
          <View
            key={id} accessibilityLabel={`${nick(id)}${out ? (deviceLang() === 'fr' ? ', éliminé' : ', eliminated') : ''}`}
            style={{ alignItems: 'center', gap: 2, opacity: out ? 0.45 : 1 }}>
            <Avatar name={nick(id)} size="sm" ring={spot ? 'you' : null} connected={v.connected[id] === true} />
            <AppText role="caption" color={spot ? 'brand' : 'textMuted'}>{out ? '💀 ' : ''}{nick(id)}</AppText>
          </View>
        );
      })}
    </View>
  );
}

function JudgeButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  const { theme, tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress} accessibilityLabel={label}
      style={{
        flex: 1, backgroundColor: color, borderRadius: tokens.radii.xl, borderWidth: 3,
        borderColor: theme.stickerOutline, padding: tokens.layout.cardPadding, alignItems: 'center',
        ...tokens.elevation.e2,
      }}>
      <AppText role="titleM" style={{ color: '#FFFFFF', textAlign: 'center' }}>{label}</AppText>
    </Pressable>
  );
}

export function LastStandingPlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const ls = asLastStandingView(state.view);
  const now = useNow(ls !== null && ls.phase !== 'over');

  useEffect(() => {
    if (ls === null) router.replace(`/room/${code}/lobby`); // no game running → back to the lobby
  }, [ls === null]);
  if (ls === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const player = (id: string): RoomPlayer => byId.get(id) ?? { id, ...UNKNOWN };
  const nick = (id: string) => player(id).profile.nickname;
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {ls.phase !== 'over' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText role="overline" color="textSecondary">
              {L(`MANCHE ${ls.round + 1} SUR ${ls.totalRounds}`, `ROUND ${ls.round + 1} OF ${ls.totalRounds}`)}
            </AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 3 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            )}
          </View>
        )}

        {ls.phase !== 'over' && <ThemeCard v={ls} lang={lang} />}
        {ls.phase !== 'over' && <Roster v={ls} nick={nick} />}

        {ls.phase === 'draw' && (
          <View style={{ gap: tokens.spacing.md, alignItems: 'center' }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>{L('🎰 Nouveau thème !', '🎰 New theme!')}</AppText>
            <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
              {L(`Un mot qui commence par ${ls.current?.letter ?? '?'} — à voix haute, avant la fin du chrono !`,
                `A word starting with ${ls.current?.letter ?? '?'} — out loud, before the clock runs out!`)}
            </AppText>
          </View>
        )}

        {ls.phase === 'say' && (ls.youAreSpotlight
          ? (
            <View style={{ gap: tokens.spacing.md }}>
              <AppText role="titleL" color="brand" style={{ textAlign: 'center' }}>
                {L('🎤 À TOI ! CRIE TON MOT !', '🎤 YOUR TURN! SHOUT YOUR WORD!')}
              </AppText>
              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {L('Dis-le à voix haute, puis tape le bouton — le jury tranche.',
                  'Say it out loud, then tap the button — the jury decides.')}
              </AppText>
              <PrimaryButton label={L('MOT LANCÉ !', 'WORD SAID!')} onPress={() => sendAction({ kind: 'wordSaid' })} />
              {ls.canGiveUp && (
                <SecondaryButton label={L("🏳️ J'abandonne ce tour", '🏳️ I give up this round')} onPress={() => sendAction({ kind: 'giveUp' })} />
              )}
            </View>
          )
          : (
            <View style={{ gap: tokens.spacing.sm, alignItems: 'center' }}>
              {ls.spotlight !== null && <Avatar name={nick(ls.spotlight)} size="lg" ring="you" connected />}
              <AppText role="titleM" style={{ textAlign: 'center' }}>
                {L(`${ls.spotlight !== null ? nick(ls.spotlight) : '???'} cherche un mot…`,
                  `${ls.spotlight !== null ? nick(ls.spotlight) : '???'} is hunting for a word…`)}
              </AppText>
              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {L(`Chrono de ${Math.round(ls.sayMsThisLap / 100) / 10}s — il rétrécit à chaque tour de table !`,
                  `${Math.round(ls.sayMsThisLap / 100) / 10}s clock — it shrinks every lap!`)}
              </AppText>
            </View>
          ))}

        {ls.phase === 'judge' && (
          <View style={{ gap: tokens.spacing.md }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>
              {L(`Le mot de ${ls.spotlight !== null ? nick(ls.spotlight) : '???'} est-il bon ?`,
                `Was ${ls.spotlight !== null ? nick(ls.spotlight) : '???'}'s word good?`)}
            </AppText>
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {L('Déjà dit, hors thème ou silence = pouce rouge !', 'Repeats, off-theme or silence = thumbs down!')}
            </AppText>
            {ls.youCanVote
              ? (
                <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
                  <JudgeButton label={L('👍 VALIDE', '👍 VALID')} color={theme.success} onPress={() => sendAction({ kind: 'judge', vote: 'valid' })} />
                  <JudgeButton label={L('👎 REJET', '👎 REJECT')} color={theme.danger} onPress={() => sendAction({ kind: 'judge', vote: 'reject' })} />
                </View>
              )
              : (
                <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                  {ls.myVote !== null
                    ? L(`Vote verrouillé : ${ls.myVote === 'valid' ? '👍' : '👎'}`, `Vote locked: ${ls.myVote === 'valid' ? '👍' : '👎'}`)
                    : L('Le jury délibère…', 'The jury is out…')}
                </AppText>
              )}
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {L(`${ls.votesIn}/${ls.votersExpected} votes`, `${ls.votesIn}/${ls.votersExpected} votes in`)}
            </AppText>
          </View>
        )}

        {ls.phase === 'result' && ls.lastTurn !== null && (() => {
          const stamp = STAMP[ls.lastTurn.outcome];
          const cast = ls.lastTurn.tally.valid + ls.lastTurn.tally.reject;
          return (
            <View style={{
              backgroundColor: stamp.ok ? theme.success : theme.danger, borderRadius: tokens.radii.xl,
              padding: tokens.layout.cardPadding, alignItems: 'center', gap: tokens.spacing.sm,
              borderWidth: 3, borderColor: theme.stickerOutline, ...tokens.elevation.e2,
            }}>
              <AppText role="titleM" style={{ color: '#FFFFFF', textAlign: 'center' }}>
                {nick(ls.lastTurn.player)} — {lang === 'fr' ? stamp.fr : stamp.en}
              </AppText>
              {cast > 0 && (
                <AppText role="caption" style={{ color: '#FFFFFF' }}>
                  {L(`Jury : 👍 ${ls.lastTurn.tally.valid} · 👎 ${ls.lastTurn.tally.reject}`,
                    `Jury: 👍 ${ls.lastTurn.tally.valid} · 👎 ${ls.lastTurn.tally.reject}`)}
                </AppText>
              )}
            </View>
          );
        })()}

        {ls.phase === 'roundEnd' && (
          <View style={{ gap: tokens.spacing.md, alignItems: 'center' }}>
            <AppText role="displayL" style={{ textAlign: 'center' }}>👑</AppText>
            <AppText role="titleL" style={{ textAlign: 'center' }}>
              {ls.roundWinners.length === 0
                ? L('Personne ne survit !', 'Nobody survives!')
                : ls.roundWinners.length === 1
                  ? L(`${nick(ls.roundWinners[0]!)} survit !`, `${nick(ls.roundWinners[0]!)} survives!`)
                  : L('Les survivants se partagent la couronne !', 'The survivors share the crown!')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md, justifyContent: 'center' }}>
              {ls.roundWinners.map((id) => (
                <View key={id} style={{ alignItems: 'center', gap: 2 }}>
                  <Avatar name={nick(id)} size="md" ring="host" connected />
                  <AppText role="caption" color="success">+{ls.pointsAwarded} pts</AppText>
                </View>
              ))}
            </View>
          </View>
        )}

        {ls.phase === 'over' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="displayL" style={{ textAlign: 'center' }}>{L('Fini ! 🎉', 'Game over! 🎉')}</AppText>
            {ranked(ls.scores).map(([id, pts], i) => (
              <View key={id} style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, ...tokens.elevation.e1,
              }}>
                <AppText role="titleM">{i === 0 ? '👑' : i + 1}</AppText>
                <Avatar name={nick(id)} size="md" />
                <View style={{ flex: 1 }}>
                  <AppText role="bodyStrong">{nick(id)}</AppText>
                  <AppText role="caption" color="textMuted">
                    {L(`🗣️ ${ls.wordsValidated[id] ?? 0} mots validés`, `🗣️ ${ls.wordsValidated[id] ?? 0} words validated`)}
                  </AppText>
                </View>
                <AppText role="headline" color="xp">{pts} pts</AppText>
              </View>
            ))}
            <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
          </View>
        )}

        {/* Mid-game there is no "back to lobby" — leaving mid-game is a real leave. */}
        {ls.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
