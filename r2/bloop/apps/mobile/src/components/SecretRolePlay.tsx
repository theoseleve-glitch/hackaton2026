import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { VoteRecord } from '@bloop/game-secret-role';
import { asSecretRoleView, deviceLang, pickL, type Lang } from '../games/secret-role-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import { Avatar, VoteCard } from './players';
import { AppText, PrimaryButton, SecondaryButton } from './ui';

const UNKNOWN: Omit<RoomPlayer, 'id'> = { profile: { nickname: '???', avatar: '' }, connected: false, isHost: false };

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Avatar strip with a ✓ for players who already acted (booleans only — never choices). */
function ProgressChips({ flags, players }: { flags: Record<string, boolean>; players: readonly RoomPlayer[] }) {
  const { tokens } = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md, justifyContent: 'center' }}>
      {Object.entries(flags).map(([id, done]) => {
        const p = byId.get(id) ?? { id, ...UNKNOWN };
        return (
          <View key={id} style={{ alignItems: 'center', gap: 2, opacity: done ? 1 : 0.5 }}
            accessibilityLabel={`${p.profile.nickname}${done ? ', ready' : ', waiting'}`}>
            <Avatar name={p.profile.nickname} size="sm" />
            <AppText role="caption" color={done ? 'success' : 'textMuted'}>{done ? '✓' : '…'}</AppText>
          </View>
        );
      })}
    </View>
  );
}

/** Public tally bars of a resolved vote round (counts only — ballots stay secret). */
function TallyBars({ record, players, lang }: { record: VoteRecord; players: readonly RoomPlayer[]; lang: Lang }) {
  const { theme, tokens } = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const rows = Object.entries(record.tally).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {rows.map(([id, n]) => (
        <View key={id} style={{
          flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
          backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.md,
          borderWidth: record.topAccused === id ? 3 : 0, borderColor: theme.brand, ...tokens.elevation.e1,
        }}>
          <Avatar name={nick(id)} size="sm" />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText role="bodyStrong">{nick(id)}</AppText>
            <View style={{ height: 8, borderRadius: tokens.radii.pill, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round((n / max) * 100)}%`, height: 8, backgroundColor: theme.dare }} />
            </View>
          </View>
          <AppText role="headline" color="brand">{n}</AppText>
        </View>
      ))}
      {rows.length === 0 && (
        <AppText role="body" color="textMuted" style={{ textAlign: 'center' }}>
          {lang === 'fr' ? 'Personne n’a voté…' : 'Nobody voted…'}
        </AppText>
      )}
      {record.abstained.length > 0 && (
        <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
          {lang === 'fr'
            ? `N'ont pas voté : ${record.abstained.map(nick).join(', ')}`
            : `Did not vote: ${record.abstained.map(nick).join(', ')}`}
        </AppText>
      )}
    </View>
  );
}

export function SecretRolePlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const sv = asSecretRoleView(state.view);
  const now = useNow(sv !== null && sv.phase !== 'over');
  const [peeking, setPeeking] = useState(false);

  useEffect(() => {
    if (sv === null) router.replace(`/room/${code}/lobby`);
  }, [sv === null]);
  if (sv === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const player = (id: string): RoomPlayer => byId.get(id) ?? { id, ...UNKNOWN };
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {sv.phase !== 'over' && (
          <View style={{ gap: tokens.spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText role="overline" color="textSecondary">
                {L(`MANCHE ${sv.match + 1} SUR ${sv.totalMatches}`, `MATCH ${sv.match + 1} OF ${sv.totalMatches}`)}
              </AppText>
              {left !== null && (
                <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
              )}
            </View>
            {/* The theme is PUBLIC — pinned in every phase. */}
            <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
              <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                {L('THÈME : ', 'THEME: ')}{pickL(sv.theme, lang)}
              </AppText>
            </View>
          </View>
        )}

        {sv.phase === 'secretReveal' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>
              {L('Ton mot secret 🤫', 'Your secret word 🤫')}
            </AppText>
            <Pressable
              onPressIn={() => setPeeking(true)}
              onPressOut={() => setPeeking(false)}
              disabled={sv.myItem === null}
              accessibilityLabel={L('Maintiens pour voir ton mot secret', 'Hold to peek at your secret word')}
              style={{
                backgroundColor: peeking ? theme.brand : theme.surface,
                borderRadius: tokens.radii.xl, borderWidth: 3, borderColor: theme.stickerOutline,
                padding: tokens.layout.cardPadding, minHeight: 120, justifyContent: 'center', ...tokens.elevation.e2,
              }}>
              <AppText role="titleL" style={{ textAlign: 'center', color: peeking ? '#FFFFFF' : undefined }}>
                {sv.myItem === null
                  ? L('Spectateur — pas de mot pour toi', 'Spectator — no word for you')
                  : peeking
                    ? pickL(sv.myItem, lang)
                    : L('👆 Maintiens pour voir', '👆 Hold to peek')}
              </AppText>
            </Pressable>
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {L('Un joueur a un mot légèrement différent. Personne ne connaît son rôle — même pas lui.',
                'One player got a slightly different word. Nobody knows their role — not even them.')}
            </AppText>
            <ProgressChips flags={sv.acked} players={state.players} />
            <PrimaryButton
              label={sv.iAcked ? L('Mémorisé ✓ — on attend les autres', 'Memorized ✓ — waiting for the others') : L("C'est mémorisé !", 'Got it memorized!')}
              onPress={() => sendAction({ kind: 'ack' })}
              disabled={sv.iAcked || sv.myItem === null}
            />
          </View>
        )}

        {sv.phase === 'discuss' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
              {L(`DISCUSSION ${sv.period + 1} SUR 2`, `DISCUSSION ${sv.period + 1} OF 2`)}
            </AppText>
            <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
              <AppText role="titleM" style={{ textAlign: 'center' }}>
                {L('Parlez ! Décrivez votre mot sans le dire. Qui sonne faux ?',
                  'Talk it out! Hint at your word without saying it. Who sounds off?')}
              </AppText>
            </View>
            {sv.lastVote !== null && (
              <View style={{ backgroundColor: theme.xp, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
                <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
                  {sv.lastVote.topAccused !== null
                    ? L(`🕊️ ${player(sv.lastVote.topAccused).profile.nickname} n'est PAS l'imposteur — dernier vote !`,
                      `🕊️ ${player(sv.lastVote.topAccused).profile.nickname} is NOT the impostor — final vote!`)
                    : L('⚖️ Vote 1 sans verdict — dernier vote !', '⚖️ Vote 1 was a wash — final vote!')}
                </AppText>
              </View>
            )}
            <ProgressChips flags={sv.ready} players={state.players} />
            <PrimaryButton
              label={sv.iAmReady
                ? L('Prêt ✓ — on attend les autres', 'Ready ✓ — waiting for the others')
                : L('Prêt à voter', 'Ready to vote')}
              onPress={() => sendAction({ kind: 'ready' })}
              disabled={sv.iAmReady}
            />
          </View>
        )}

        {sv.phase === 'vote' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>
              {sv.voteRound === 0 ? L('Vote 1 sur 2 🗳️', 'Vote 1 of 2 🗳️') : L('DERNIER vote ! 🗳️', 'FINAL vote! 🗳️')}
            </AppText>
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
              {sv.myVote === null
                ? L("TAPE L'IMPOSTEUR PRÉSUMÉ", 'TAP YOUR SUSPECT')
                : L('VOTE VERROUILLÉ — ON ATTEND LES AUTRES', 'VOTE LOCKED — WAITING FOR THE OTHERS')}
            </AppText>
            {sv.voteRound === 1 && (
              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {L("Raté = l'imposteur gagne. Pas de pression.", 'Miss this and the impostor wins. No pressure.')}
              </AppText>
            )}
            {sv.votableTargets.map((id) => (
              <VoteCard
                key={id} player={player(id)} selected={sv.myVote === id} voted={sv.hasVoted[id] === true}
                disabled={sv.myVote !== null} onPress={() => sendAction({ kind: 'vote', target: id })}
              />
            ))}
            {sv.votableTargets.length === 0 && (
              <AppText role="body" color="textMuted" style={{ textAlign: 'center' }}>
                {L('Spectateur — la salle vote…', 'Spectator — the room is voting…')}
              </AppText>
            )}
          </View>
        )}

        {sv.phase === 'verdict' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>
              {L('Le verdict… 🥁', 'The verdict… 🥁')}
            </AppText>
            <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
              <AppText role="titleM" style={{ textAlign: 'center' }}>
                {sv.vote.topAccused !== null
                  ? L(`${player(sv.vote.topAccused).profile.nickname} n'est PAS l'imposteur !`,
                    `${player(sv.vote.topAccused).profile.nickname} is NOT the impostor!`)
                  : L('Égalité — personne n’est démasqué !', 'A tie — nobody is unmasked!')}
              </AppText>
              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {L("L'imposteur est toujours parmi vous…", 'The impostor is still among you…')}
              </AppText>
            </View>
            <TallyBars record={sv.vote} players={state.players} lang={lang} />
          </View>
        )}

        {sv.phase === 'finalReveal' && (() => {
          const r = sv.result;
          const impostorWon = r.winners === 'impostor';
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <View style={{ backgroundColor: impostorWon ? theme.dare : theme.truth, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg }}>
                <AppText role="titleL" style={{ textAlign: 'center', color: '#FFFFFF' }}>
                  {impostorWon
                    ? L("🎭 L'imposteur gagne !", '🎭 The impostor wins!')
                    : r.endReason === 'impostorLeft'
                      ? L("🔌 L'imposteur s'est enfui !", '🔌 The impostor bailed!')
                      : L('🎉 Démasqué !', '🎉 Unmasked!')}
                </AppText>
              </View>
              <View style={{ alignItems: 'center', gap: tokens.spacing.sm }}>
                <Avatar name={player(r.impostor).profile.nickname} size="md" />
                <AppText role="titleM">
                  {L(`${player(r.impostor).profile.nickname} était l'imposteur`, `${player(r.impostor).profile.nickname} was the impostor`)}
                </AppText>
                {r.caughtOnVote !== null && (
                  <AppText role="caption" color="textMuted">
                    {L(`Attrapé au vote ${r.caughtOnVote + 1}`, `Caught on vote ${r.caughtOnVote + 1}`)}
                  </AppText>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
                <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, ...tokens.elevation.e1 }}>
                  <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>{L('VOUS AVIEZ', 'YOU HAD')}</AppText>
                  <AppText role="titleM" style={{ textAlign: 'center' }}>{pickL(r.majorityItem, lang)}</AppText>
                </View>
                <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, borderWidth: 3, borderColor: theme.dare, ...tokens.elevation.e1 }}>
                  <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>{L('LUI AVAIT', 'THEY HAD')}</AppText>
                  <AppText role="titleM" style={{ textAlign: 'center' }}>{pickL(r.impostorItem, lang)}</AppText>
                </View>
              </View>
              {ranked(r.points).filter(([, pts]) => pts > 0).map(([id, pts]) => (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
                  <Avatar name={player(id).profile.nickname} size="sm" />
                  <AppText role="bodyStrong" style={{ flex: 1 }}>{player(id).profile.nickname}</AppText>
                  <AppText role="headline" color="xp">+{pts}</AppText>
                </View>
              ))}
            </View>
          );
        })()}

        {sv.phase === 'over' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="displayL" style={{ textAlign: 'center' }}>{L('Fini ! 🎉', 'Game over! 🎉')}</AppText>
            {ranked(sv.scores).map(([id, pts], i) => (
              <View key={id} style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, ...tokens.elevation.e1,
              }}>
                <AppText role="titleM">{i === 0 ? '👑' : i + 1}</AppText>
                <Avatar name={player(id).profile.nickname} size="md" />
                <AppText role="bodyStrong" style={{ flex: 1 }}>{player(id).profile.nickname}</AppText>
                <AppText role="headline" color="xp">{pts} pts</AppText>
              </View>
            ))}
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {L(`${sv.results.filter((r) => r.winners === 'impostor').length} victoire(s) d'imposteur sur ${sv.results.length} manche(s)`,
                `${sv.results.filter((r) => r.winners === 'impostor').length} impostor win(s) across ${sv.results.length} match(es)`)}
            </AppText>
            <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
          </View>
        )}

        {sv.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
