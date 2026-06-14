import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { SessionCliffhanger, VoteRecord } from '@bloop/game-secret-role';
import {
  asSecretRoleView,
  deviceLang,
  pickL,
  secretRoleMatchMultiplier,
  type Lang,
} from '../games/secret-role-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import {
  EpilogueCard,
  MultiplierBadge,
  SuperlativeRow,
  haptics,
  type EpilogueStanding,
  type EpilogueSuperlative,
} from './juice';
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

/**
 * CC-1 "lean": secretly tap who you suspect is the impostor during discuss.
 * Owner-only — your own lean shows a coral ring; everyone else only ever sees
 * the public "X leaning" count, never WHO. Re-leanable across the period.
 */
function LeanPicker({ targets, myLean, players, onLean, lang }: {
  targets: readonly string[]; myLean: string | null; players: readonly RoomPlayer[];
  onLean: (id: string) => void; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
        {myLean === null
          ? L('🤫 QUI SENS-TU COMME L’IMPOSTEUR ?', '🤫 WHO’S YOUR GUT PICK FOR IMPOSTOR?')
          : L('TON SOUPÇON — SECRET, MODIFIABLE', 'YOUR HUNCH — SECRET, CHANGEABLE')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: tokens.spacing.sm }}>
        {targets.map((id) => {
          const picked = myLean === id;
          return (
            <Pressable
              key={id} onPress={() => onLean(id)}
              accessibilityLabel={`${nick(id)}${picked ? (lang === 'fr' ? ', ton soupçon' : ', your hunch') : ''}`}
              style={{
                minHeight: tokens.layout.minTouchTarget, alignItems: 'center', gap: 4, width: 76,
                paddingVertical: tokens.spacing.sm, borderRadius: tokens.radii.lg,
                borderWidth: picked ? 3 : 0, borderColor: theme.brand,
                backgroundColor: picked ? theme.surfaceAlt : 'transparent',
                ...(picked ? tokens.elevation.sticker : {}),
              }}>
              <Avatar name={nick(id)} size="md" ring={picked ? 'you' : null} />
              <AppText role="caption" color={picked ? 'brand' : 'textSecondary'} style={{ textAlign: 'center' }}>
                {picked ? '👁 ' : ''}{nick(id)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
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

/**
 * Wave-2 CC-5 cliffhanger -> juice superlatives. Pure fold over the ALREADY-PUBLIC
 * payload (win streak, ace detective, most caught-with hits) into bilingual
 * {@link EpilogueSuperlative} rows. Shared by the finalReveal teaser and the over
 * epilogue so both screens phrase the night identically.
 */
function cliffhangerSuperlatives(
  c: SessionCliffhanger,
  nick: (id: string) => string,
  L: (fr: string, en: string) => string,
): EpilogueSuperlative[] {
  const out: EpilogueSuperlative[] = [];

  // Consecutive-win streak across matches (civilians vs impostor).
  if (c.streak.side !== null && c.streak.count >= 2) {
    const civ = c.streak.side === 'civilians';
    out.push({
      key: 'streak',
      icon: civ ? '🕵️' : '🎭',
      label: L('SÉRIE EN COURS', 'WIN STREAK'),
      names: civ
        ? L(`Les enquêteurs mènent ${c.streak.count}-0`, `Hunters on a ${c.streak.count}-0 run`)
        : L(`L'imposteur enchaîne ×${c.streak.count}`, `The impostor on a ×${c.streak.count} run`),
      detail: L('Une manche pour tout renverser…', 'One match can flip the night…'),
      tone: civ ? 'win' : 'spice',
    });
  }

  // Ace detective — the night's sole points leader (civilians score by catching).
  if (c.detectiveMvp !== null) {
    out.push({
      key: 'mvp',
      icon: '🏆',
      label: L('AS DE L’ENQUÊTE', 'ACE DETECTIVE'),
      names: nick(c.detectiveMvp),
      detail: L('Meilleur flair de la soirée', 'Best nose of the night'),
      tone: 'win',
    });
  }

  // Sharpest sleuth by raw catches participated in (omit when nobody caught anyone).
  const hits = Object.entries(c.detectiveHits).sort((a, b) => b[1] - a[1]);
  if (hits.length > 0 && hits[0]![1] > 0) {
    const [topId, n] = hits[0]!;
    if (topId !== c.detectiveMvp) {
      out.push({
        key: 'hits',
        icon: '🔎',
        label: L('LIMIER', 'SHARPEST SLEUTH'),
        names: nick(topId),
        detail: L(`${n} démasquage${n > 1 ? 's' : ''} en équipe`, `${n} team unmask${n > 1 ? 's' : ''}`),
        tone: 'neutral',
      });
    }
  }

  return out;
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

  // Heavy haptic the instant the impostor is unmasked (once per match's reveal).
  // Re-fires when the finalReveal match changes; the kit's haptics util is a
  // no-op under Reduce Motion / on unsupported platforms, so this stays safe.
  const revealMatch = sv !== null && sv.phase === 'finalReveal' ? sv.result.match : -1;
  useEffect(() => {
    if (revealMatch >= 0) haptics.impact('heavy');
  }, [revealMatch]);

  if (sv === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const me = state.playerId;
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

            {/* CC-1 lean: only seated players pick a secret hunch (spectators get none). */}
            {me !== null && byId.has(me) && (
              <View style={{
                backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.xl,
                padding: tokens.spacing.lg, gap: tokens.spacing.md,
              }}>
                <LeanPicker
                  targets={state.players.map((p) => p.id).filter((id) => id !== me)}
                  myLean={sv.myLean}
                  players={state.players}
                  onLean={(target) => sendAction({ kind: 'lean', target })}
                  lang={lang}
                />
                <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                  {sv.myLean === null
                    ? L(`👁 ${sv.leanCount} joueur${sv.leanCount > 1 ? 's' : ''} ont déjà un soupçon — personne ne voit qui tu vises.`,
                      `👁 ${sv.leanCount} player${sv.leanCount === 1 ? '' : 's'} already leaning — nobody sees who you tap.`)
                    : L(`👁 ${sv.leanCount} soupçon${sv.leanCount > 1 ? 's' : ''} en jeu — vise juste pour un bonus à la révélation.`,
                      `👁 ${sv.leanCount} hunch${sv.leanCount === 1 ? '' : 'es'} in play — nail it for a reveal-time bonus.`)}
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
          // CC-2 doubled-finale chrome: only show when this match was weighted up.
          const mult = secretRoleMatchMultiplier(r.match);
          const cliffSupers = cliffhangerSuperlatives(
            sv.cliffhanger,
            (id) => player(id).profile.nickname,
            L,
          );
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              {mult !== 1 && (
                <MultiplierBadge
                  multiplier={mult}
                  title={L('MANCHE DOUBLÉE', 'DOUBLED MATCH')}
                  tone="dare"
                />
              )}
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
              {/* CC-5 cliffhanger teaser on the way to the next match (epilogue building blocks). */}
              {cliffSupers.length > 0 && (
                <View style={{ gap: tokens.spacing.sm }}>
                  <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
                    {L(`MANCHE ${sv.cliffhanger.matchesPlayed} TERMINÉE`, `MATCH ${sv.cliffhanger.matchesPlayed} DONE`)}
                  </AppText>
                  {cliffSupers.map(({ key, ...s }) => <SuperlativeRow key={key} {...s} />)}
                </View>
              )}
            </View>
          );
        })()}

        {sv.phase === 'over' && (() => {
          // CC-5 epilogue: the cliffhanger drives the superlative band; the public
          // session scores become the ranked standings (crown + climbing pts).
          const standings: EpilogueStanding[] = ranked(sv.scores).map(([id, pts]) => ({
            id,
            name: player(id).profile.nickname,
            score: pts,
          }));
          const supers = cliffhangerSuperlatives(sv.cliffhanger, (id) => player(id).profile.nickname, L);
          const impostorWins = sv.results.filter((r) => r.winners === 'impostor').length;
          return (
            <EpilogueCard
              title={L('Fini ! 🎉', 'Game over! 🎉')}
              standings={standings}
              superlatives={supers}
              footer={
                <View style={{ gap: tokens.spacing.lg }}>
                  <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                    {L(`${impostorWins} victoire(s) d'imposteur sur ${sv.results.length} manche(s)`,
                      `${impostorWins} impostor win(s) across ${sv.results.length} match(es)`)}
                  </AppText>
                  <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
                </View>
              }
            />
          );
        })()}

        {sv.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
