import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { LastStandingView, SpotBet, TurnOutcome } from '@bloop/game-last-standing';
import {
  asLastStandingView,
  deviceLang,
  pickL,
  type Lang,
  type LastStandingEpilogue,
} from '../games/last-standing-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import {
  EpilogueCard,
  MultiplierBadge,
  ScoreClimb,
  haptics,
  type EpilogueStanding,
  type EpilogueSuperlative,
} from './juice';
import { Avatar } from './players';
import { AppText, PrimaryButton, SecondaryButton } from './ui';

/**
 * CC-2 base survivor crown (jeu-du-theme design param). The view publishes only
 * the ALREADY-escalated `pointsAwarded`; the round multiplier is therefore
 * derived client-side as `pointsAwarded / BASE_SURVIVOR_POINTS`. Kept as a local
 * documented constant (NOT a value import) so the type-only import firewall holds.
 */
const BASE_SURVIVOR_POINTS = 3;

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

/**
 * P0-1 — survives/chokes side-bet chip. Every NON-SPOTLIGHT player (alive OR
 * eliminated) calls whether the spotlight nails the word; the choice is the one
 * channel an eliminated player can still act in. Pop-shadowed rounded chip in
 * the brand sticker style, matching JudgeButton.
 */
function BetButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  const { theme, tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress} accessibilityLabel={label}
      style={{
        flex: 1, backgroundColor: color, borderRadius: tokens.radii.xl, borderWidth: 3,
        borderColor: theme.stickerOutline, paddingVertical: tokens.spacing.lg,
        paddingHorizontal: tokens.spacing.md, alignItems: 'center', ...tokens.elevation.e2,
      }}>
      <AppText role="titleM" style={{ color: '#FFFFFF', textAlign: 'center' }}>{label}</AppText>
    </Pressable>
  );
}

/**
 * Map the CC-5 over-view epilogue onto the juice-kit superlative rows. Each
 * award is EMPTY-STATE GATED: "Unbreakable" only when at least one player ran
 * the table, "longest streak" only when somebody survived a round (value >= 1
 * with named leaders), and "last one standing" only when the final round had a
 * sole survivor. All copy is bilingual via the caller's L().
 */
function buildSuperlatives(
  epilogue: LastStandingEpilogue,
  names: (ids: readonly string[]) => string,
  L: (fr: string, en: string) => string,
): EpilogueSuperlative[] {
  const out: EpilogueSuperlative[] = [];
  if (epilogue.survivedAllRounds.length > 0) {
    out.push({
      key: 'unbreakable',
      icon: '🛡️',
      label: L('INCASSABLE', 'UNBREAKABLE'),
      names: names(epilogue.survivedAllRounds),
      detail: L('Survie à toutes les manches', 'Survived every single round'),
      tone: 'win',
    });
  }
  const streak = epilogue.longestSurvivalStreak;
  if (streak.value > 0 && streak.players.length > 0) {
    out.push({
      key: 'streak',
      icon: '🔥',
      label: L('PLUS LONGUE SÉRIE', 'LONGEST STREAK'),
      names: names(streak.players),
      detail: L(`${streak.value} manche${streak.value > 1 ? 's' : ''} survécue${streak.value > 1 ? 's' : ''}`,
        `${streak.value} round${streak.value > 1 ? 's' : ''} survived`),
      tone: 'spice',
    });
  }
  if (epilogue.lastOneStanding !== null) {
    out.push({
      key: 'last-standing',
      icon: '👑',
      label: L('DERNIER·E EN LICE', 'LAST ONE STANDING'),
      names: names([epilogue.lastOneStanding]),
      detail: L('Seul·e survivant·e de la manche finale', 'Sole survivor of the final round'),
      tone: 'win',
    });
  }
  return out;
}

export function LastStandingPlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const ls = asLastStandingView(state.view);
  const now = useNow(ls !== null && ls.phase !== 'over');

  // P0-1: remember THIS viewer's survives/chokes call, keyed by turnSeq, so the
  // result beat can echo "you nailed it / you whiffed" — myBet only lives in the
  // 'say' view, so we stash it here while it is in hand. Cleared each new turn.
  const [myBet, setMyBet] = useState<{ turnSeq: number; bet: SpotBet } | null>(null);
  const placeBet = (turnSeq: number, bet: SpotBet) => {
    setMyBet({ turnSeq, bet });
    sendAction({ kind: 'bet', value: bet });
  };

  useEffect(() => {
    if (ls === null) router.replace(`/room/${code}/lobby`); // no game running → back to the lobby
  }, [ls === null]);

  // JUICE: fire a single medium impact when an elimination lands on the result
  // beat (any non-'valid' outcome eliminates the spotlight). Keyed on turnSeq so
  // it pulses exactly once per turn, not on every 250 ms re-render. The haptics
  // util is itself reduced-motion-safe (no-ops when Reduce Motion is on).
  const eliminated =
    ls !== null && ls.phase === 'result' && ls.lastTurn !== null && ls.lastTurn.outcome !== 'valid';
  const elimSeq = ls !== null && ls.phase !== 'over' ? ls.turnSeq : -1;
  useEffect(() => {
    if (eliminated) haptics.impact('medium');
  }, [eliminated, elimSeq]);

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
            <View style={{ gap: tokens.spacing.md, alignItems: 'center' }}>
              {ls.spotlight !== null && <Avatar name={nick(ls.spotlight)} size="lg" ring="you" connected />}
              <AppText role="titleM" style={{ textAlign: 'center' }}>
                {L(`${ls.spotlight !== null ? nick(ls.spotlight) : '???'} cherche un mot…`,
                  `${ls.spotlight !== null ? nick(ls.spotlight) : '???'} is hunting for a word…`)}
              </AppText>
              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {L(`Chrono de ${Math.round(ls.sayMsThisLap / 100) / 10}s — il rétrécit à chaque tour de table !`,
                  `${Math.round(ls.sayMsThisLap / 100) / 10}s clock — it shrinks every lap!`)}
              </AppText>

              {/* P0-1 — survives/chokes side-bet. Open to EVERY non-spotlight
                  player, alive or eliminated, so the dead keep playing. */}
              <View style={{
                width: '100%', gap: tokens.spacing.sm, marginTop: tokens.spacing.sm,
                paddingTop: tokens.spacing.md, borderTopWidth: 2, borderColor: theme.border,
                alignItems: 'center',
              }}>
                <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
                  {L('🎲 TON PRONO', '🎲 CALL YOUR SHOT')}
                </AppText>
                <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                  {state.playerId !== null && ls.alive[state.playerId] === false
                    ? L('Éliminé·e mais toujours dans la partie : il ou elle nous sort un mot valide ?',
                      'Out of the round but still in the game: do they land a valid word?')
                    : L('Il ou elle nous sort un mot valide, ou il ou elle craque ?',
                      'Do they land a valid word, or do they choke?')}
                </AppText>
                {ls.youCanBet
                  ? (
                    <View style={{ flexDirection: 'row', gap: tokens.spacing.md, width: '100%' }}>
                      <BetButton
                        label={L('🛟 PASSE', '🛟 SURVIVES')} color={theme.success}
                        onPress={() => placeBet(ls.turnSeq, 'survives')} />
                      <BetButton
                        label={L('💀 CRAQUE', '💀 CHOKES')} color={theme.danger}
                        onPress={() => placeBet(ls.turnSeq, 'chokes')} />
                    </View>
                  )
                  : ls.myBet !== null
                    ? (
                      <View style={{
                        backgroundColor: ls.myBet === 'survives' ? theme.success : theme.danger,
                        borderRadius: tokens.radii.pill, borderWidth: 3, borderColor: theme.stickerOutline,
                        paddingHorizontal: tokens.spacing.xl, paddingVertical: tokens.spacing.sm,
                        ...tokens.elevation.e1,
                      }}>
                        <AppText role="label" style={{ color: '#FFFFFF', textAlign: 'center' }}>
                          {ls.myBet === 'survives'
                            ? L('Prono verrouillé : 🛟 PASSE', 'Bet locked: 🛟 SURVIVES')
                            : L('Prono verrouillé : 💀 CRAQUE', 'Bet locked: 💀 CHOKES')}
                        </AppText>
                      </View>
                    )
                    : (
                      <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                        {L('Les paris sont ouverts…', 'Bets are open…')}
                      </AppText>
                    )}
                {ls.betsIn > 0 && (
                  <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                    {L(`${ls.betsIn} prono${ls.betsIn > 1 ? 's' : ''} en jeu`,
                      `${ls.betsIn} bet${ls.betsIn > 1 ? 's' : ''} on the table`)}
                  </AppText>
                )}
              </View>
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
          // P0-1: did this viewer's survives/chokes call land? A turn ending
          // 'valid' = survives, anything else = chokes. Only show when we placed
          // a bet THIS turn (stash keyed by turnSeq).
          const mine = myBet !== null && myBet.turnSeq === ls.turnSeq ? myBet.bet : null;
          const survived = ls.lastTurn.outcome === 'valid';
          const betRight = mine !== null && ((mine === 'survives') === survived);
          return (
            <View style={{ gap: tokens.spacing.md }}>
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

              {/* P0-1 — your survives/chokes call resolved. */}
              {mine !== null && (
                <View style={{
                  backgroundColor: theme.surface, borderRadius: tokens.radii.lg,
                  padding: tokens.layout.cardPadding, alignItems: 'center', gap: 2,
                  borderWidth: 2, borderColor: betRight ? theme.success : theme.border, ...tokens.elevation.e1,
                }}>
                  <AppText role="overline" color="textSecondary">{L('TON PRONO', 'YOUR CALL')}</AppText>
                  <AppText role="titleM" color={betRight ? 'success' : 'danger'} style={{ textAlign: 'center' }}>
                    {betRight
                      ? L('🎯 Bien vu ! +1 pt de prono', '🎯 Nailed it! +1 prediction pt')
                      : L('❌ Raté…', '❌ Missed it…')}
                  </AppText>
                  <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                    {mine === 'survives'
                      ? L('Tu avais misé sur 🛟 PASSE', 'You bet 🛟 SURVIVES')
                      : L('Tu avais misé sur 💀 CRAQUE', 'You bet 💀 CHOKES')}
                  </AppText>
                </View>
              )}
            </View>
          );
        })()}

        {ls.phase === 'roundEnd' && (() => {
          // JUICE — escalating survivorPoints chrome (CC-2). A later survival is
          // worth more: derive the round multiplier from the escalated crown the
          // view just paid vs the base survivor crown. Show the badge ONLY when
          // it actually escalated (mult != 1) and the round paid out.
          const mult = ls.pointsAwarded > 0
            ? Math.round((ls.pointsAwarded / BASE_SURVIVOR_POINTS) * 10) / 10
            : 1;
          const escalated = ls.roundWinners.length > 0 && mult > 1;
          return (
            <View style={{ gap: tokens.spacing.md, alignItems: 'center' }}>
              <AppText role="displayL" style={{ textAlign: 'center' }}>👑</AppText>
              <AppText role="titleL" style={{ textAlign: 'center' }}>
                {ls.roundWinners.length === 0
                  ? L('Personne ne survit !', 'Nobody survives!')
                  : ls.roundWinners.length === 1
                    ? L(`${nick(ls.roundWinners[0]!)} survit !`, `${nick(ls.roundWinners[0]!)} survives!`)
                    : L('Les survivants se partagent la couronne !', 'The survivors share the crown!')}
              </AppText>
              {/* Multiplier badge gated to a true escalation (mult != 1). */}
              {escalated && (
                <MultiplierBadge
                  multiplier={mult}
                  title={L('SURVIE EN OR', 'CLUTCH SURVIVAL')}
                />
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md, justifyContent: 'center' }}>
                {ls.roundWinners.map((id) => (
                  <View key={id} style={{ alignItems: 'center', gap: 2 }}>
                    <Avatar name={nick(id)} size="md" ring="host" connected />
                    {/* The awarded crown climbs in (escalated value pops harder). */}
                    <ScoreClimb value={ls.pointsAwarded} role="caption" color="success" prefix="+" suffix=" pts" />
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {ls.phase === 'over' && (() => {
          // JUICE — game-over epilogue. Map the public scores onto the shared
          // EpilogueCard standings (climbing scores + crown + sticker rows), and
          // build the CC-5 superlative band from the derived epilogue payload.
          // Epilogue cards render on the OVER screen ONLY (this branch).
          const names = (ids: readonly string[]) => ids.map(nick).join(lang === 'fr' ? ' & ' : ' & ');
          const standings: EpilogueStanding[] = ranked(ls.scores).map(([id, pts]) => ({
            id, name: nick(id), score: pts,
          }));
          const superlatives: EpilogueSuperlative[] = buildSuperlatives(ls.epilogue, names, L);
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <EpilogueCard
                title={L('Fini ! 🎉', 'Game over! 🎉')}
                standings={standings}
                superlatives={superlatives}
                footer={
                  <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
                }
              />
              {/* Additive participation recap — preserves the per-player
                  words-validated stat the prior leaderboard carried. */}
              <View style={{ gap: tokens.spacing.xs }}>
                {ranked(ls.scores).map(([id]) => (
                  <AppText key={id} role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                    {L(`🗣️ ${nick(id)} — ${ls.wordsValidated[id] ?? 0} mots validés`,
                      `🗣️ ${nick(id)} — ${ls.wordsValidated[id] ?? 0} words validated`)}
                  </AppText>
                ))}
              </View>
            </View>
          );
        })()}

        {/* Mid-game there is no "back to lobby" — leaving mid-game is a real leave. */}
        {ls.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
