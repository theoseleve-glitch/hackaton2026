import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { LText, RuleHuntEpilogue, SeatView } from '@bloop/game-rule-hunt';
import {
  asRuleHuntView, deviceLang, pickL,
  type FlagBet, type Lang, type NoteBet,
} from '../games/rule-hunt-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import {
  EpilogueCard, haptics, StreakTag,
  type EpilogueStanding, type EpilogueSuperlative,
} from './juice';
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

/** A pop chip used inside the heat-check (a soft-read toggle, or a locked echo). */
function HeatChip({ label, tone, active, onPress, lang, srLabel }: {
  label: string; tone: 'go' | 'stop'; active: boolean;
  onPress: (() => void) | null; lang: Lang; srLabel: string;
}) {
  const { theme, tokens } = useTheme();
  const fill = tone === 'go' ? theme.truth : theme.danger;
  const locked = onPress === null;
  return (
    <Pressable
      onPress={onPress ?? undefined} disabled={locked}
      accessibilityLabel={srLabel}
      accessibilityState={{ selected: active, disabled: locked }}
      style={{
        flex: 1, minHeight: 64, borderRadius: tokens.radii.lg, alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: tokens.spacing.md, borderWidth: 3,
        borderColor: active ? fill : theme.border,
        backgroundColor: active ? fill : theme.surface,
        opacity: locked && !active ? 0.45 : 1,
        ...(active ? tokens.elevation.sticker : tokens.elevation.e1),
      }}>
      <AppText role="bodyStrong" color={active ? 'textOnBrand' : 'textPrimary'} style={{ textAlign: 'center' }}>
        {label}
      </AppText>
      <AppText role="caption" color={active ? 'textOnBrand' : 'textMuted'}>
        {active ? (lang === 'fr' ? '✓ verrouillé' : '✓ locked') : (lang === 'fr' ? 'tape' : 'tap')}
      </AppText>
    </Pressable>
  );
}

/**
 * The PUBLIC suspicion meter (Wave-2 CC-2 heat). `heat` accumulates each
 * spotlight's soft reads (followers' 🚩 flag + detectives' 🔎 suspicious) onto a
 * per-target aggregate — never a per-voter map, so it leaks no hidden read. We
 * render the warmest seats as relative bars: "qui chauffe ?" at a glance. Renders
 * nothing until a single read has landed (empty map => the room is still cold).
 */
function HeatMeter({ heat, nick, lang }: {
  heat: Record<string, number>; nick: (id: string) => string; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const ranked = Object.entries(heat)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  const max = ranked[0][1];
  return (
    <View
      accessibilityLabel={lang === 'fr' ? 'Compteur de suspicion' : 'Suspicion meter'}
      style={{
        backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding,
        borderWidth: 3, borderColor: theme.danger, gap: tokens.spacing.sm, ...tokens.elevation.e1,
      }}>
      <AppText role="overline" color="danger">{lang === 'fr' ? '🌡️ QUI CHAUFFE ?' : '🌡️ WHO’S HEATING UP?'}</AppText>
      {ranked.map(([id, n], i) => (
        <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm }}>
          <Avatar name={nick(id)} size="sm" />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText role="caption" color={i === 0 ? 'danger' : 'textSecondary'}>
              {i === 0 ? '🔥 ' : ''}{nick(id)}
            </AppText>
            <View style={{ height: 8, borderRadius: tokens.radii.pill, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
              <View style={{
                height: '100%', width: `${Math.max(8, Math.round((n / max) * 100))}%`,
                borderRadius: tokens.radii.pill, backgroundColor: i === 0 ? theme.danger : theme.xp,
              }} />
            </View>
          </View>
          <AppText role="label" color={i === 0 ? 'danger' : 'textMuted'}>{n}</AppText>
        </View>
      ))}
      <AppText role="caption" color="textMuted">
        {lang === 'fr'
          ? 'Total agrégé des lectures (🚩 + 🔎) — qui a voté reste secret.'
          : 'Aggregate read total (🚩 + 🔎) — who voted stays secret.'}
      </AppText>
    </View>
  );
}

/**
 * Maps the Wave-2 CC-5 {@link RuleHuntEpilogue} onto the shared juice
 * {@link EpilogueCard}'s superlative band. Awards only the bands actually earned
 * (a superlative nobody reached is never shown): the sole MVP crown, the
 * crime-parfait streak (only when a perfect time-up ever landed), and a
 * close-finish flag. All copy bilingual via `lang`.
 */
function epilogueSuperlatives(
  epilogue: RuleHuntEpilogue, nick: (id: string) => string, lang: Lang,
): EpilogueSuperlative[] {
  const out: EpilogueSuperlative[] = [];
  if (epilogue.mvp !== null) {
    out.push({
      key: 'mvp', icon: '🏆', tone: 'win',
      label: lang === 'fr' ? 'MVP' : 'MVP',
      names: nick(epilogue.mvp),
      detail: lang === 'fr' ? 'Plus haut score de la partie.' : 'Top score of the match.',
    });
  }
  // The crime-parfait superlative — the longest clean (perfect time-up) streak
  // anyone held. Only awarded when at least one perfect round ever landed.
  if (epilogue.cleanStreak.length > 0 && epilogue.cleanStreak.holders.length > 0) {
    const n = epilogue.cleanStreak.length;
    out.push({
      key: 'cleanStreak', icon: '🕵️‍♂️', tone: 'spice',
      label: lang === 'fr' ? 'CRIME PARFAIT' : 'PERFECT CRIME',
      names: epilogue.cleanStreak.holders.map(nick).join(' · '),
      detail: lang === 'fr'
        ? `${n} manche${n > 1 ? 's' : ''} parfaite${n > 1 ? 's' : ''} d’affilée — jamais enfreinte, jamais devinée.`
        : `${n} perfect round${n > 1 ? 's' : ''} in a row — never broken, never guessed.`,
    });
  }
  if (epilogue.closeFinish && epilogue.topGap > 0) {
    out.push({
      key: 'closeFinish', icon: '🤏', tone: 'neutral',
      label: lang === 'fr' ? 'FINI DE JUSTESSE' : 'PHOTO FINISH',
      names: lang === 'fr' ? `${epilogue.topGap} pt d’écart en tête` : `${epilogue.topGap} pt apart at the top`,
    });
  }
  return out;
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

            {/* Crime-parfait streak carried in from past rounds (≥2 only — the
                kit hides a streak of one). Teases the legend-run heating up. */}
            <View style={{ alignItems: 'center' }}>
              <StreakTag count={rv.cleanStreak} label={L('CRIME PARFAIT', 'PERFECT CRIME')} />
            </View>

            {/* PUBLIC suspicion meter — accumulated heat from this round's spotlights. */}
            <HeatMeter heat={rv.heat} nick={nick} lang={lang} />
          </View>
        )}

        {rv.phase === 'spotlight' && (() => {
          // HEAT-CHECK micro-beat: one follower is named; the table gets a forced
          // quick tap. Followers soft-flag (flag/clean), the detective bookmarks
          // (suspicious/clear). Resolves back to live on its own short deadline.
          const targetName = nick(rv.target);
          // Eligibility mirrors the reducer: living, connected, NON-spotlit followers flag;
          // detectives note; the spotlit target + eliminated followers only watch.
          const iAmFlagger = iAmFollower && !rv.iAmEliminated && !rv.iAmSpotlit;
          const iAmNoter = rv.myRole === 'detective';
          const flagLocked: FlagBet | null = rv.myFlag;
          const noteLocked: NoteBet | null = rv.myNote;
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <View style={{
                backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding,
                borderWidth: 3, borderColor: theme.xp, gap: tokens.spacing.sm, ...tokens.elevation.sticker,
              }}>
                <AppText role="overline" color="xp">{L('🔦 COUP DE PROJECTEUR', '🔦 HEAT CHECK')}</AppText>
                <View style={{ alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.sm }}>
                  <Avatar name={targetName} size="md" connected />
                  <AppText role="titleL" style={{ textAlign: 'center' }}>
                    {rv.iAmSpotlit
                      ? L('Toi. Maintenant.', 'You. Right now.')
                      : L(`${targetName} sous le feu`, `${targetName} in the spotlight`)}
                  </AppText>
                </View>
                <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                  {L('Le chrono principal est en pause — ça repart tout de suite après.',
                    'The main clock is paused — it resumes the instant this ends.')}
                </AppText>
              </View>

              {rv.iAmSpotlit && (
                <AppText role="label" color="xp" style={{ textAlign: 'center' }}>
                  {L('TOUS LES YEUX SUR TOI — TIENS TON RÔLE, NE CRAQUE PAS.',
                    'ALL EYES ON YOU — HOLD YOUR ROLE, DON’T CRACK.')}
                </AppText>
              )}

              {iAmFlagger && (
                <View style={{ gap: tokens.spacing.sm }}>
                  <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                    {L(`${targetName} respecte-t-il·elle la règle ?`, `Is ${targetName} obeying the rule?`)}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
                    <HeatChip
                      label={L('🚩 Enfreint', '🚩 Broke it')} tone="stop" lang={lang}
                      active={flagLocked === 'flag'}
                      onPress={flagLocked === null ? () => { haptics.impact('light'); sendAction({ kind: 'flagBreak', flag: 'flag' satisfies FlagBet }); } : null}
                      srLabel={L('Signaler une infraction', 'Flag a break')}
                    />
                    <HeatChip
                      label={L('✅ Clean', '✅ Clean')} tone="go" lang={lang}
                      active={flagLocked === 'clean'}
                      onPress={flagLocked === null ? () => { haptics.impact('light'); sendAction({ kind: 'flagBreak', flag: 'clean' satisfies FlagBet }); } : null}
                      srLabel={L('Marquer comme clean', 'Mark as clean')}
                    />
                  </View>
                  {flagLocked !== null && (
                    <AppText role="caption" color="success" style={{ textAlign: 'center' }}>
                      {L('Lecture envoyée — gratuite, ce n’est pas un jeton d’accusation.',
                        'Read sent — it’s free, not your accusation token.')}
                    </AppText>
                  )}
                </View>
              )}

              {iAmNoter && (
                <View style={{ gap: tokens.spacing.sm }}>
                  <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                    {L(`${targetName} t’a paru… ?`, `${targetName} looked…?`)}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
                    <HeatChip
                      label={L('🔎 Suspect·e', '🔎 Suspicious')} tone="stop" lang={lang}
                      active={noteLocked === 'suspicious'}
                      onPress={noteLocked === null ? () => { haptics.impact('light'); sendAction({ kind: 'noteSuspicious', note: 'suspicious' satisfies NoteBet }); } : null}
                      srLabel={L('Noter comme suspect', 'Note as suspicious')}
                    />
                    <HeatChip
                      label={L('🆗 Clair', '🆗 Clear')} tone="go" lang={lang}
                      active={noteLocked === 'clear'}
                      onPress={noteLocked === null ? () => { haptics.impact('light'); sendAction({ kind: 'noteSuspicious', note: 'clear' satisfies NoteBet }); } : null}
                      srLabel={L('Noter comme clair', 'Note as clear')}
                    />
                  </View>
                  {noteLocked !== null && (
                    <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                      {L('Carnet privé — personne ne voit ton choix, aucun pouvoir d’élimination.',
                        'Private bookmark — nobody sees your pick, no elimination power.')}
                    </AppText>
                  )}
                </View>
              )}

              {!rv.iAmSpotlit && !iAmFlagger && !iAmNoter && (
                <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                  {rv.iAmEliminated
                    ? L('TU REGARDES — PLUS DE LECTURE POUR LES ÉLIMINÉ·ES.',
                        'YOU SPECTATE — NO MORE READS FOR THE ELIMINATED.')
                    : L('OBSERVE BIEN CE MOMENT…', 'WATCH THIS MOMENT CLOSELY…')}
                </AppText>
              )}

              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {L(`🚩 ${rv.flagCount} signalement${rv.flagCount === 1 ? '' : 's'} · 🔎 ${rv.noteCount} note${rv.noteCount === 1 ? '' : 's'} détective`,
                  `🚩 ${rv.flagCount} flag${rv.flagCount === 1 ? '' : 's'} · 🔎 ${rv.noteCount} detective note${rv.noteCount === 1 ? '' : 's'}`)}
              </AppText>

              {/* PUBLIC suspicion meter — the accumulated heat from PAST spotlights. */}
              <HeatMeter heat={rv.heat} nick={nick} lang={lang} />
            </View>
          );
        })()}

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

        {rv.phase === 'over' && (() => {
          // Epilogue cards ONLY on the over screen: the Wave-2 CC-5 award band
          // (crime-parfait superlative + MVP) rides the shared EpilogueCard juice.
          const standings: EpilogueStanding[] = ranked(rv.scores).map(([id, pts]) => ({
            id, name: nick(id), score: pts,
          }));
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              {rv.endReason === 'roomCollapsed' && (
                <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                  {L('Partie écourtée — trop de joueurs ont quitté la pièce.', 'Match cut short — too many players left the room.')}
                </AppText>
              )}
              <EpilogueCard
                title={L('Fini ! 🎉', 'Game over! 🎉')}
                standings={standings}
                superlatives={epilogueSuperlatives(rv.epilogue, nick, lang)}
                footer={
                  <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
                }
              />
            </View>
          );
        })()}

        {rv.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
