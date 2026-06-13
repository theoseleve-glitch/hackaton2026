import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { LText, SeatView } from '@bloop/game-rule-hunt';
import { asRuleHuntView, deviceLang, pickL, type Lang } from '../games/rule-hunt-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import { Avatar } from './players';
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

/** One roster seat: avatar + name + public role/state badges. */
function SeatChip({ seat, nickname, isYou, selected, onPress, lang }: {
  seat: SeatView; nickname: string; isYou: boolean; selected: boolean;
  onPress: (() => void) | null; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const badge = seat.isDetective ? '🕵️' : seat.eliminated ? '❌' : null;
  return (
    <Pressable
      onPress={onPress ?? undefined} disabled={onPress === null}
      accessibilityLabel={`${nickname}${seat.isDetective ? (lang === 'fr' ? ', détective' : ', detective') : ''}${seat.eliminated ? (lang === 'fr' ? ', éliminé' : ', eliminated') : ''}${selected ? (lang === 'fr' ? ', sélectionné' : ', selected') : ''}`}
      style={{
        alignItems: 'center', gap: 4, width: 76, paddingVertical: tokens.spacing.sm,
        borderRadius: tokens.radii.lg, borderWidth: selected ? 3 : 0, borderColor: theme.danger,
        backgroundColor: selected ? theme.surfaceAlt : 'transparent',
        opacity: seat.connected ? (seat.eliminated ? 0.55 : 1) : 0.4,
      }}>
      <Avatar name={nickname} size="sm" ring={isYou ? 'you' : null} connected={seat.connected} />
      <AppText role="caption" style={{ textAlign: 'center' }} color={seat.isDetective ? 'brand' : 'textSecondary'}>
        {badge !== null ? `${badge} ` : ''}{nickname}
      </AppText>
    </Pressable>
  );
}

/** The follower's private rule card — stays on screen all round (eliminated included). */
function RuleCard({ rule, eliminated, lang }: { rule: LText; eliminated: boolean; lang: Lang }) {
  const { theme, tokens } = useTheme();
  return (
    <View style={{
      backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding,
      borderWidth: 3, borderColor: eliminated ? theme.border : theme.truth, gap: tokens.spacing.sm, ...tokens.elevation.e2,
    }}>
      <AppText role="overline" color={eliminated ? 'textMuted' : 'truth'}>
        {eliminated
          ? (lang === 'fr' ? '❌ ÉLIMINÉ·E — LA RÈGLE RESTE TON SECRET' : '❌ ELIMINATED — THE RULE IS STILL YOUR SECRET')
          : (lang === 'fr' ? '🤫 LA RÈGLE SECRÈTE — OBÉIS-Y COÛTE QUE COÛTE' : '🤫 THE SECRET RULE — OBEY IT NO MATTER WHAT')}
      </AppText>
      <AppText role="titleM">{pickL(rule, lang)}</AppText>
    </View>
  );
}

export function RuleHuntPlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const rv = asRuleHuntView(state.view);
  const now = useNow(rv !== null && rv.phase !== 'over');
  // Local accuse draft — reset whenever the phase instance changes.
  const [target, setTarget] = useState<string | null>(null);
  const phaseInstance = rv === null ? 'none' : `${rv.phase}:${rv.round}`;
  useEffect(() => { setTarget(null); }, [phaseInstance]);
  useEffect(() => {
    if (rv === null) router.replace(`/room/${code}/lobby`);
  }, [rv === null]);
  if (rv === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const me = state.playerId;
  const seats = rv.seats;
  const detectives = seats.filter((s) => s.isDetective);
  const followers = seats.filter((s) => !s.isDetective);
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);

  const detectiveNames = detectives.map((d) => nick(d.id)).join(' + ');
  const iAmFollower = rv.myRole === 'follower';
  const canAccuse = rv.phase === 'live' && iAmFollower && !rv.iAmEliminated && rv.myAccusationsLeft > 0;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {rv.phase !== 'over' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText role="overline" color="textSecondary">
              {L(`MANCHE ${rv.round + 1} SUR ${rv.totalRounds}`, `ROUND ${rv.round + 1} OF ${rv.totalRounds}`)}
            </AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 10 ? 'danger' : 'textSecondary'}>
                {rv.phase === 'live' ? `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `${left}s`}
              </AppText>
            )}
          </View>
        )}

        {/* Role banner — roles are PUBLIC; the rule is the followers' secret. */}
        {rv.phase !== 'over' && rv.phase !== 'reveal' && (
          rv.myRole === 'detective' ? (
            <View style={{
              backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding,
              borderWidth: 3, borderColor: theme.brand, gap: tokens.spacing.sm, ...tokens.elevation.e2,
            }}>
              <AppText role="overline" color="brand">{L('🕵️ TU ES DÉTECTIVE', '🕵️ YOU ARE A DETECTIVE')}</AppText>
              <AppText role="body" color="textSecondary">
                {L('Toute la pièce suit une règle secrète. Observe, interroge — et devine-la avant la fin du chrono.',
                  'The whole room is following a secret rule. Watch, interrogate — and crack it before the clock runs out.')}
              </AppText>
            </View>
          ) : rv.myRule !== null ? (
            <RuleCard rule={rv.myRule} eliminated={rv.iAmEliminated} lang={lang} />
          ) : null
        )}

        {rv.phase === 'briefing' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
              {L(`DÉTECTIVE${detectives.length > 1 ? 'S' : ''} : ${detectiveNames}`,
                `DETECTIVE${detectives.length > 1 ? 'S' : ''}: ${detectiveNames}`)}
            </AppText>
            {iAmFollower && rv.acked[me ?? ''] !== true && (
              <PrimaryButton label={L('✔ J’ai compris la règle', '✔ Got the rule')} onPress={() => sendAction({ kind: 'ackRule' })} />
            )}
            {iAmFollower && rv.acked[me ?? ''] === true && (
              <AppText role="label" color="success" style={{ textAlign: 'center' }}>
                {L('PRÊT·E — ON ATTEND LES AUTRES…', 'READY — WAITING FOR THE OTHERS…')}
              </AppText>
            )}
            {rv.myRole === 'detective' && (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {L('Les suiveurs lisent la règle secrète…', 'The followers are reading the secret rule…')}
              </AppText>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: tokens.spacing.sm }}>
              {followers.map((s) => (
                <View key={s.id} style={{ alignItems: 'center', gap: 2 }}>
                  <Avatar name={nick(s.id)} size="sm" connected={s.connected} />
                  <AppText role="caption" color={rv.acked[s.id] === true ? 'success' : 'textMuted'}>
                    {rv.acked[s.id] === true ? '✔' : '…'} {nick(s.id)}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        )}

        {rv.phase === 'live' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
              {rv.myRole === 'detective'
                ? L('OBSERVE LA PIÈCE. UN COMPORTEMENT REVIENT ?', 'WATCH THE ROOM. SPOT A PATTERN?')
                : rv.iAmEliminated
                  ? L('TU REGARDES — LA MANCHE CONTINUE SANS TOI', 'YOU SPECTATE — THE ROUND GOES ON WITHOUT YOU')
                  : L('JOUE NORMALEMENT… ET RESPECTE LA RÈGLE', 'ACT NATURAL… AND OBEY THE RULE')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: tokens.spacing.sm }}>
              {seats.map((s) => {
                const accusable = canAccuse && !s.isDetective && !s.eliminated && s.id !== me;
                return (
                  <SeatChip
                    key={s.id} seat={s} nickname={nick(s.id)} isYou={s.id === me} lang={lang}
                    selected={target === s.id}
                    onPress={accusable ? () => setTarget(target === s.id ? null : s.id) : null}
                  />
                );
              })}
            </View>
            {rv.myRole === 'detective' && (
              <PrimaryButton
                label={L(`🔍 Ouvrir la grille (${rv.teamGuessesLeft} essai${rv.teamGuessesLeft > 1 ? 's' : ''})`,
                  `🔍 Open the guess grid (${rv.teamGuessesLeft} ${rv.teamGuessesLeft === 1 ? 'try' : 'tries'})`)}
                onPress={() => sendAction({ kind: 'openGuess' })}
                disabled={rv.teamGuessesLeft <= 0}
              />
            )}
            {canAccuse && (
              <View style={{ gap: tokens.spacing.sm }}>
                <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                  {L('Quelqu’un a enfreint la règle ? Tape sa tête, puis confirme — 1 seul jeton.',
                    'Someone broke the rule? Tap their face, then confirm — you only get 1 token.')}
                </AppText>
                {target !== null && (
                  <PrimaryButton
                    label={L(`⚖️ Accuser ${nick(target)}`, `⚖️ Accuse ${nick(target)}`)}
                    onPress={() => { sendAction({ kind: 'accuse', target }); setTarget(null); }}
                  />
                )}
              </View>
            )}
            {iAmFollower && !rv.iAmEliminated && rv.myAccusationsLeft <= 0 && (
              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {L('Jeton d’accusation déjà utilisé pour cette manche.', 'Accusation token already spent this round.')}
              </AppText>
            )}
          </View>
        )}

        {rv.phase === 'tribunal' && (() => {
          const iAmVoter = me !== null && rv.voters.includes(me);
          const voted = Object.values(rv.hasVoted).filter(Boolean).length;
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, gap: tokens.spacing.sm, ...tokens.elevation.e2 }}>
                <AppText role="overline" color="danger">{L('⚖️ TRIBUNAL', '⚖️ TRIBUNAL')}</AppText>
                <AppText role="titleM">
                  {L(`${nick(rv.accuser)} accuse ${nick(rv.accused)} d’avoir enfreint la règle !`,
                    `${nick(rv.accuser)} accuses ${nick(rv.accused)} of breaking the rule!`)}
                </AppText>
                <AppText role="caption" color="textMuted">
                  {L('Le chrono principal est en pause. Les détectives regardent — chaque verdict est un indice pour eux.',
                    'The main clock is paused. The detectives are watching — every verdict is a clue for them.')}
                </AppText>
              </View>
              {iAmVoter && rv.myVote === null && (
                <View style={{ gap: tokens.spacing.md }}>
                  <PrimaryButton label={L('🔨 Coupable', '🔨 Guilty')} onPress={() => sendAction({ kind: 'tribunalVote', guilty: true })} />
                  <SecondaryButton label={L('🕊 Non coupable', '🕊 Not guilty')} onPress={() => sendAction({ kind: 'tribunalVote', guilty: false })} />
                </View>
              )}
              {iAmVoter && rv.myVote !== null && (
                <AppText role="label" color="success" style={{ textAlign: 'center' }}>
                  {L('VOTE VERROUILLÉ', 'VOTE LOCKED IN')}
                </AppText>
              )}
              {!iAmVoter && (
                <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                  {rv.myRole === 'detective'
                    ? L('LES SUIVEURS VOTENT EN SECRET — OBSERVE QUI ACCUSE QUI…', 'THE FOLLOWERS VOTE IN SECRET — WATCH WHO ACCUSES WHOM…')
                    : L('TU NE VOTES PAS DANS CE PROCÈS', 'YOU DON’T VOTE IN THIS TRIAL')}
                </AppText>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: tokens.spacing.sm }}>
                {rv.voters.map((id) => (
                  <View key={id} style={{ alignItems: 'center', gap: 2 }}>
                    <Avatar name={nick(id)} size="sm" />
                    <AppText role="caption" color={rv.hasVoted[id] === true ? 'success' : 'textMuted'}>
                      {rv.hasVoted[id] === true ? '✔' : '…'} {nick(id)}
                    </AppText>
                  </View>
                ))}
              </View>
              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {L(`${voted}/${rv.voters.length} votes`, `${voted}/${rv.voters.length} votes`)}
              </AppText>
            </View>
          );
        })()}

        {rv.phase === 'guess' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleM" style={{ textAlign: 'center' }}>
              {rv.iAmGuessing
                ? L('Annonce ta théorie à voix haute… puis verrouille UNE règle.', 'Shout your theory out loud… then lock ONE rule.')
                : L(`${nick(rv.guesser)} verrouille une règle…`, `${nick(rv.guesser)} is locking in a rule…`)}
            </AppText>
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {L(`Essais d’équipe restants : ${rv.teamGuessesLeft}`, `Team tries left: ${rv.teamGuessesLeft}`)}
            </AppText>
            {rv.candidates === null ? (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {L('Grille en cours…', 'Grid in progress…')}
              </AppText>
            ) : (
              rv.candidates.map((c, i) => {
                const used = rv.usedCandidates.includes(i);
                return (
                  <Pressable
                    key={i}
                    disabled={!rv.iAmGuessing || used}
                    onPress={() => sendAction({ kind: 'pickCandidate', index: i })}
                    accessibilityLabel={`${pickL(c, lang)}${used ? L(' , déjà tenté', ', already tried') : ''}`}
                    style={{
                      backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg,
                      borderWidth: 2, borderColor: theme.border, opacity: used ? 0.35 : 1, ...tokens.elevation.e1,
                    }}>
                    <AppText role="bodyStrong" color={used ? 'textMuted' : 'textPrimary'}>
                      {used ? '✗ ' : ''}{pickL(c, lang)}
                    </AppText>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {rv.phase === 'reveal' && (() => {
          const o = rv.outcome;
          const headline = o.kind === 'guessed'
            ? L(`🕵️ ${nick(o.guesser ?? '')} a démasqué la règle !`, `🕵️ ${nick(o.guesser ?? '')} cracked the rule!`)
            : o.perfect
              ? L('🏆 Manche parfaite — ni enfreinte, ni devinée !', '🏆 Perfect round — never broken, never guessed!')
              : L('⏰ Temps écoulé — mais la règle a été enfreinte…', '⏰ Time’s up — but the rule was broken…');
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <AppText role="titleL" style={{ textAlign: 'center' }}>{headline}</AppText>
              <View style={{
                backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding,
                borderWidth: 3, borderColor: theme.xp, gap: tokens.spacing.sm, ...tokens.elevation.e2,
              }}>
                <AppText role="overline" color="textSecondary">{L('LA RÈGLE ÉTAIT', 'THE RULE WAS')}</AppText>
                <AppText role="titleM">{pickL(o.ruleText, lang)}</AppText>
              </View>
              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {o.kind === 'guessed'
                  ? L('Détectives +4 · suiveurs survivants +1', 'Detectives +4 · surviving followers +1')
                  : o.perfect
                    ? L('Suiveurs +3 · détectives +1', 'Followers +3 · detectives +1')
                    : L('Survivants +2 · éliminés +1 · détectives +1', 'Survivors +2 · eliminated +1 · detectives +1')}
              </AppText>
              {ranked(rv.scores).map(([id, pts]) => (
                <View key={id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                  borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, ...tokens.elevation.e1,
                }}>
                  <Avatar name={nick(id)} size="sm" />
                  <AppText role="bodyStrong" style={{ flex: 1 }}>
                    {seats.find((s) => s.id === id)?.isDetective === true ? '🕵️ ' : ''}{nick(id)}
                  </AppText>
                  <AppText role="headline" color="xp">{pts} pts</AppText>
                </View>
              ))}
            </View>
          );
        })()}

        {rv.phase === 'over' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="displayL" style={{ textAlign: 'center' }}>{L('Fini ! 🎉', 'Game over! 🎉')}</AppText>
            {rv.endReason === 'roomCollapsed' && (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {L('Partie écourtée — trop de joueurs ont quitté la pièce.', 'Match cut short — too many players left the room.')}
              </AppText>
            )}
            {ranked(rv.scores).map(([id, pts], i) => (
              <View key={id} style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, ...tokens.elevation.e1,
              }}>
                <AppText role="titleM">{i === 0 ? '👑' : i + 1}</AppText>
                <Avatar name={nick(id)} size="md" />
                <AppText role="bodyStrong" style={{ flex: 1 }}>{nick(id)}</AppText>
                <AppText role="headline" color="xp">{pts} pts</AppText>
              </View>
            ))}
            <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
          </View>
        )}

        {rv.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
