import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type {
  ConstraintCard,
  PerformJudgeOutcome,
  Reaction,
  ReactionCounts,
  SecretCard,
  TurnResult,
} from '@bloop/game-perform-judge';
import { asPerformJudgeView, deviceLang, pickL, type Lang } from '../games/perform-judge-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import {
  EpilogueCard,
  haptics,
  MultiplierBadge,
  type EpilogueStanding,
  type EpilogueSuperlative,
} from './juice';
import { Avatar } from './players';
import { AppText, PrimaryButton, SecondaryButton } from './ui';

// CC-2 — the armed final-lap multiplier (every PERFORM_JUDGE Money-Round config
// uses 1.5). The view exposes only the boolean `isFinalLap`; this is the value it
// flags. Kept here so the badge can scream the exact "×1.5".
const MONEY_ROUND_MULTIPLIER = 1.5;

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

/** Public constraint card — unmissable on every phone (guided channel). */
function ConstraintBanner({ constraint, lang }: { constraint: ConstraintCard | null; lang: Lang }) {
  const { theme, tokens } = useTheme();
  if (constraint === null) return null;
  return (
    <View style={{ backgroundColor: theme.dare, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, gap: 4 }}>
      <AppText role="titleM" style={{ textAlign: 'center', color: '#FFFFFF' }}>{pickL(constraint.label, lang)}</AppText>
      <AppText role="caption" style={{ textAlign: 'center', color: '#FFFFFF' }}>{pickL(constraint.rule, lang)}</AppText>
    </View>
  );
}

/** The secret card (prompt + hint + forbidden words) for entitled viewers only. */
function SecretPanel({ secret, lang, title }: { secret: SecretCard; lang: Lang; title: string }) {
  const { theme, tokens } = useTheme();
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, gap: tokens.spacing.md, ...tokens.elevation.e2 }}>
      <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>{title}</AppText>
      <AppText role="titleL" style={{ textAlign: 'center' }}>{pickL(secret.prompt, lang)}</AppText>
      {secret.hint !== null && (
        <AppText role="caption" color="textMuted" style={{ textAlign: 'center', fontStyle: 'italic' }}>
          💡 {pickL(secret.hint, lang)}
        </AppText>
      )}
      {secret.forbidden !== null && (
        <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
          <AppText role="label" color="danger" style={{ textAlign: 'center' }}>
            {lang === 'fr' ? '🚫 INTERDITS : ' : '🚫 FORBIDDEN: '}
            {(lang === 'fr' ? secret.forbidden.fr : secret.forbidden.en).join(' · ')}
          </AppText>
        </View>
      )}
    </View>
  );
}

const OUTCOME_FR: Record<PerformJudgeOutcome, string> = {
  'success': 'RÉUSSI ! 🎉', 'success-early': 'TROUVÉ ! ⚡', 'passed': 'PASSÉ 🪂',
  'fail': 'RATÉ 😅', 'contested': 'CONTESTÉ 🧐', 'void': 'ANNULÉ 💨',
};
const OUTCOME_EN: Record<PerformJudgeOutcome, string> = {
  'success': 'NAILED IT! 🎉', 'success-early': 'GOT IT! ⚡', 'passed': 'PASSED 🪂',
  'fail': 'MISSED 😅', 'contested': 'CONTESTED 🧐', 'void': 'VOIDED 💨',
};

function Stamp({ outcome, lang }: { outcome: PerformJudgeOutcome; lang: Lang }) {
  const { theme, tokens } = useTheme();
  const good = outcome === 'success' || outcome === 'success-early';
  return (
    <View style={{ backgroundColor: good ? theme.success : theme.surfaceAlt, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg }}>
      <AppText role="displayL" style={{ textAlign: 'center', color: good ? '#FFFFFF' : undefined }}>
        {lang === 'fr' ? OUTCOME_FR[outcome] : OUTCOME_EN[outcome]}
      </AppText>
    </View>
  );
}

// CC-4 — fixed audience reaction set (enum-only, zero free text). Order is the
// public bar order: hype → laugh → cringe.
const REACTION_META: ReadonlyArray<{ key: Reaction; emoji: string; fr: string; en: string }> = [
  { key: 'fire', emoji: '🔥', fr: 'Feu', en: 'Fire' },
  { key: 'laugh', emoji: '😂', fr: 'Mdr', en: 'Laugh' },
  { key: 'cringe', emoji: '😬', fr: 'Cringe', en: 'Cringe' },
];

/**
 * Live audience reaction bar (perform phase). Every phone shows the PUBLIC
 * per-emoji counts building in real time; eligible audience members (connected
 * non-actors who haven't reacted) tap once to add theirs. Reactions NEVER
 * resolve the turn — purely cosmetic hype. `mine` highlights the locked choice.
 */
function ReactionBar({
  counts, mine, canReact, onReact, lang,
}: {
  counts: ReactionCounts;
  mine: Reaction | null;
  canReact: boolean;
  onReact: (r: Reaction) => void;
  lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const locked = mine !== null;
  return (
    <View style={{ gap: tokens.spacing.sm, alignItems: 'center' }}>
      <AppText role="overline" color="textSecondary">
        {locked
          ? L('TA RÉACTION EST PARTIE', 'YOUR REACTION IS IN')
          : canReact
            ? L('RÉAGIS EN DIRECT', 'REACT LIVE')
            : L('RÉACTIONS DU PUBLIC', 'CROWD REACTIONS')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, justifyContent: 'center' }}>
        {REACTION_META.map((r) => {
          const isMine = mine === r.key;
          const tappable = canReact && !locked;
          const count = counts[r.key];
          return (
            <Pressable
              key={r.key}
              disabled={!tappable}
              onPress={() => onReact(r.key)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !tappable, selected: isMine }}
              accessibilityLabel={L(`${r.fr} — ${count}`, `${r.en} — ${count}`)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs,
                minHeight: 44, paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs,
                borderRadius: tokens.radii.pill,
                backgroundColor: isMine ? theme.brand : theme.surface,
                borderWidth: 2, borderColor: isMine ? theme.brand : theme.border,
                opacity: tappable || isMine ? 1 : 0.85,
                ...tokens.elevation.e1,
              }}>
              <AppText role="titleM">{r.emoji}</AppText>
              <AppText role="bodyStrong" color={isMine ? 'textOnBrand' : 'textPrimary'}>{count}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** CC-4 reveal echo — the public reaction tally rides onto the result card. */
function ReactionTally({ counts, lang }: { counts: ReactionCounts; lang: Lang }) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const total = counts.fire + counts.laugh + counts.cringe;
  if (total === 0) return null;
  return (
    <View style={{ gap: tokens.spacing.xs, alignItems: 'center' }}>
      <AppText role="overline" color="textSecondary">
        {L(`LA SALLE A RÉAGI ${total}×`, `THE ROOM REACTED ${total}×`)}
      </AppText>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm, justifyContent: 'center' }}>
        {REACTION_META.map((r) => (
          <View key={r.key} style={{
            flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs,
            paddingHorizontal: tokens.spacing.md, paddingVertical: tokens.spacing.xs,
            borderRadius: tokens.radii.pill, backgroundColor: theme.surfaceAlt,
          }}>
            <AppText role="bodyStrong">{r.emoji}</AppText>
            <AppText role="bodyStrong" color="textSecondary">{counts[r.key]}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PerformJudgePlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const pj = asPerformJudgeView(state.view);
  const now = useNow(pj !== null && pj.phase !== 'over');

  useEffect(() => {
    if (pj === null) router.replace(`/room/${code}/lobby`);
  }, [pj === null]);

  // Medium impact on the reveal beat — the result stamp lands with a thud.
  // No-op under Reduce Motion (haptics util gates on it). Fires once per entry
  // into 'reveal' since the phase string is the only dependency.
  const phase = pj?.phase ?? null;
  useEffect(() => {
    if (phase === 'reveal') haptics.impact('medium');
  }, [phase]);

  if (pj === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const player = (id: string): RoomPlayer => byId.get(id) ?? { id, ...UNKNOWN };
  const nick = (id: string) => player(id).profile.nickname;
  const me = state.playerId ?? '';
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);

  const Leaderboard = ({ scores }: { scores: Record<string, number> }) => (
    <View style={{ gap: tokens.spacing.md }}>
      {ranked(scores).map(([id, pts], i) => (
        <View key={id} style={{
          flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
          borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, opacity: player(id).connected ? 1 : 0.55,
          ...tokens.elevation.e1,
        }}>
          <AppText role="titleM">{i === 0 ? '👑' : i + 1}</AppText>
          <Avatar name={nick(id)} size="md" />
          <AppText role="bodyStrong" style={{ flex: 1 }}>{nick(id)}{id === me ? L(' (toi)', ' (you)') : ''}</AppText>
          <AppText role="headline" color="xp">{pts} pts</AppText>
        </View>
      ))}
    </View>
  );

  if (pj.phase === 'over') {
    const epi = pj.epilogue;
    // Pre-join names for the crowd favourite (≥1 performer who drew the most
    // reactions). Empty when nobody reacted all match — that card is skipped.
    const crowdNames = epi.crowdFavourite.map(nick).join(L(' & ', ' & '));
    const standings: EpilogueStanding[] = ranked(pj.scores).map(([id, score]) => ({
      id, name: nick(id), score,
    }));
    // CC-5 superlatives — MVP (sole top scorer), crowd favourite (most reacts),
    // and the photo-finish call-out. All derived from already-public state.
    const superlatives: EpilogueSuperlative[] = [];
    if (epi.bestPerformer !== null) {
      superlatives.push({
        key: 'mvp', icon: '🏆', tone: 'win',
        label: L('MVP', 'MVP'),
        names: nick(epi.bestPerformer),
      });
    }
    if (epi.crowdFavourite.length > 0) {
      superlatives.push({
        key: 'crowd', icon: '🔥', tone: 'spice',
        label: L('CHOUCHOU DU PUBLIC', 'CROWD FAVOURITE'),
        names: crowdNames,
        detail: L('A déclenché le plus de réactions', 'Sparked the most crowd reactions'),
      });
    }
    if (epi.closeFinish) {
      superlatives.push({
        key: 'photo', icon: '🤏', tone: 'neutral',
        label: L('FINISH SERRÉ', 'PHOTO FINISH'),
        names: L(`${epi.topGap} pt d'écart en tête`, `${epi.topGap} pt at the top`),
        detail: epi.nailbiters > 0
          ? L(`${epi.nailbiters} tour(s) sur le fil`, `${epi.nailbiters} nailbiter turn(s)`)
          : undefined,
      });
    }
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
          <EpilogueCard
            title={L('Fini ! 🎉', 'Game over! 🎉')}
            standings={standings}
            superlatives={superlatives}
            footer={
              <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
            }
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const isPerformer = me === pj.performer;
  const isPartner = pj.partner !== null && me === pj.partner;
  const spotName = nick(pj.performer);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {/* chrome: turn + lap + countdown */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText role="overline" color="textSecondary">
            {L(`TOUR ${pj.turnSeq + 1} · MANCHE ${pj.lap + 1}/${pj.laps}`, `TURN ${pj.turnSeq + 1} · ROUND ${pj.lap + 1}/${pj.laps}`)}
          </AppText>
          {left !== null && (
            <View accessibilityLabel={L(`${left} secondes restantes`, `${left} seconds left`)}>
              <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            </View>
          )}
        </View>

        {/* CC-2 Money Round — final lap with the armed multiplier: scream ×1.5. */}
        {pj.isFinalLap && (
          <MultiplierBadge
            multiplier={MONEY_ROUND_MULTIPLIER}
            title={L('DERNIÈRE MANCHE', 'FINAL ROUND')}
          />
        )}

        {/* rotation strip: spotlight ringed, disconnected dimmed */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, justifyContent: 'center' }}>
          {pj.rotation.map((id) => (
            <View key={id} style={{ alignItems: 'center', opacity: pj.connected[id] === true ? 1 : 0.4 }}>
              <Avatar name={nick(id)} size="sm" connected={pj.connected[id] === true} />
              {id === pj.performer && <AppText role="caption" color="xp">★</AppText>}
            </View>
          ))}
        </View>

        {pj.phase === 'ready' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <ConstraintBanner constraint={pj.constraint} lang={lang} />
            {pj.secret !== null && (
              <SecretPanel secret={pj.secret} lang={lang}
                title={L(`SECRET — guide ${spotName} sans le dire !`, `SECRET — guide ${spotName}, never say it!`)} />
            )}
            {pj.offers !== null && (
              <View style={{ gap: tokens.spacing.md }}>
                <AppText role="label" color="brand" style={{ textAlign: 'center' }}>
                  {L('CHOISIS TON MOUVEMENT SECRET', 'PICK YOUR SECRET MOVE')}
                </AppText>
                {pj.offers.map((offer) => (
                  <Pressable key={offer.index}
                    onPress={() => sendAction({ kind: 'pick', index: offer.index })}
                    accessibilityLabel={L(`Choisir : ${pickL(offer.prompt, lang)}`, `Pick: ${pickL(offer.prompt, lang)}`)}
                    style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, borderWidth: 3, borderColor: theme.border, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
                    <AppText role="titleM" style={{ textAlign: 'center' }}>{pickL(offer.prompt, lang)}</AppText>
                    {offer.hint !== null && (
                      <AppText role="caption" color="textMuted" style={{ textAlign: 'center', fontStyle: 'italic' }}>
                        💡 {pickL(offer.hint, lang)}
                      </AppText>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
            {pj.canReady && (
              <View style={{ gap: tokens.spacing.md }}>
                <AppText role="titleL" style={{ textAlign: 'center' }}>{L('Debout ! 🧍', 'Stand up! 🧍')}</AppText>
                <PrimaryButton label={L('Je suis prêt·e !', "I'm ready!")} onPress={() => sendAction({ kind: 'ready' })} />
              </View>
            )}
            {pj.mode === 'credit' && (
              <AppText role="titleL" style={{ textAlign: 'center' }}>
                {isPerformer
                  ? L('À toi ! Ton objet secret arrive…', 'You’re up! Your secret object is coming…')
                  : L(`Lève-toi, ${spotName} !`, `Stand up, ${spotName}!`)}
              </AppText>
            )}
            {pj.mode === 'rate' && pj.offers === null && (
              <AppText role="titleM" style={{ textAlign: 'center' }} color={isPartner ? 'brand' : 'textSecondary'}>
                {isPartner
                  ? L('🎙️ C’EST TOI LA VOIX — tu doubleras en aveugle !', '🎙️ YOU ARE THE VOICE — you’ll dub it blind!')
                  : L(`${spotName} choisit un mouvement secret…`, `${spotName} is picking a secret move…`)}
              </AppText>
            )}
            {pj.mode === 'guided' && !pj.canReady && pj.secret === null && (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {L(`${spotName} se met en place…`, `${spotName} is getting in position…`)}
              </AppText>
            )}
          </View>
        )}

        {pj.phase === 'perform' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <ConstraintBanner constraint={pj.constraint} lang={lang} />
            {pj.secret !== null && (
              <SecretPanel secret={pj.secret} lang={lang}
                title={pj.mode === 'credit' || pj.mode === 'rate'
                  ? L('TON SECRET — fais-le deviner !', 'YOUR SECRET — act it out!')
                  : L(`SECRET — guide ${spotName} !`, `SECRET — guide ${spotName}!`)} />
            )}
            {pj.secret === null && pj.categoryHint !== null && (
              <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.pill, paddingVertical: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg, alignSelf: 'center' }}>
                <AppText role="label">{L('Indice : ', 'Hint: ')}{pickL(pj.categoryHint, lang)}</AppText>
              </View>
            )}
            {pj.mode === 'puppet' && (
              isPerformer || pj.secret === null ? (
                <AppText role="titleL" style={{ textAlign: 'center' }}>
                  {isPerformer
                    ? L('Obéis aux ordres… et crie ce que tu crois mimer !', 'Obey the room… and shout what you think you’re miming!')
                    : L(`${spotName} est télécommandé·e…`, `${spotName} is being remote-controlled…`)}
                </AppText>
              ) : (
                <PrimaryButton
                  label={pj.myTapped
                    ? L(`Trouvé ! ✓  ${pj.tapCount}/${pj.tapGoal}`, `Got it! ✓  ${pj.tapCount}/${pj.tapGoal}`)
                    : L(`Trouvé ! ${pj.tapCount}/${pj.tapGoal}`, `Got it! ${pj.tapCount}/${pj.tapGoal}`)}
                  onPress={() => sendAction({ kind: 'tap' })}
                  disabled={pj.myTapped}
                />
              )
            )}
            {pj.claimTargets !== null && (
              <View style={{ gap: tokens.spacing.md }}>
                <AppText role="label" color="brand" style={{ textAlign: 'center' }}>
                  {L('QUI A TROUVÉ ? Tape son avatar !', 'WHO GOT IT? Tap their avatar!')}
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md, justifyContent: 'center' }}>
                  {pj.claimTargets.map((id) => (
                    <Pressable key={id} onPress={() => sendAction({ kind: 'claimFound', guesser: id })}
                      accessibilityLabel={L(`Créditer ${nick(id)}`, `Credit ${nick(id)}`)}
                      style={{ alignItems: 'center', gap: 4 }}>
                      <Avatar name={nick(id)} size="md" />
                      <AppText role="caption">{nick(id)}</AppText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            {pj.mode === 'credit' && !isPerformer && (
              <AppText role="titleL" style={{ textAlign: 'center' }}>
                {L('Crie tes réponses à voix haute ! 📣', 'Shout your guesses out loud! 📣')}
              </AppText>
            )}
            {pj.mode === 'rate' && (
              <View style={{ gap: tokens.spacing.md }}>
                <AppText role="titleL" style={{ textAlign: 'center' }}>
                  {isPerformer
                    ? L('Joue-le à fond ! 🎬', 'Sell it! 🎬')
                    : isPartner
                      ? L('🎙️ DOUBLE-LE EN DIRECT !', '🎙️ DUB IT LIVE!')
                      : L('Regardez le show…', 'Watch the show…')}
                </AppText>
                {pj.crewDone !== null && (isPerformer || isPartner) && (
                  <PrimaryButton
                    label={pj.myDone ? L('Terminé ✓', 'Done ✓') : L('Terminé !', 'Done!')}
                    onPress={() => sendAction({ kind: 'done' })}
                    disabled={pj.myDone}
                  />
                )}
              </View>
            )}
            {pj.canClaimDone && (
              <View style={{ gap: tokens.spacing.md }}>
                <PrimaryButton label={L('Je l’ai fait ! ✅', 'I did it! ✅')} onPress={() => sendAction({ kind: 'claimDone' })} />
                {pj.canGiveUp && (
                  <SecondaryButton label={L('J’abandonne 🏳️', 'Give up 🏳️')} onPress={() => sendAction({ kind: 'giveUp' })} />
                )}
              </View>
            )}
            {pj.canPass && (
              <SecondaryButton label={L('Passer (1 jeton)', 'Pass (1 token)')} onPress={() => sendAction({ kind: 'pass' })} />
            )}
            {pj.mode === 'guided' && !isPerformer && pj.secret !== null && (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {L(`Guidez ${spotName} — uniquement via le canal autorisé !`, `Guide ${spotName} — allowed channel only!`)}
              </AppText>
            )}
            {/* CC-4 — audience live reactions: public counts to all; tap-to-react
                for connected non-actors only. Never resolves the turn. */}
            <ReactionBar
              counts={pj.reactionCounts}
              mine={pj.myReaction}
              canReact={pj.canReact}
              onReact={(reaction) => {
                // Light tap on a live react — a small physical "sent" cue.
                haptics.impact('light');
                sendAction({ kind: 'react', reaction });
              }}
              lang={lang}
            />
          </View>
        )}

        {pj.phase === 'judge' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <ConstraintBanner constraint={pj.constraint} lang={lang} />
            {pj.publicItem !== null && (
              <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, gap: tokens.spacing.sm, ...tokens.elevation.e2 }}>
                <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
                  {L('L’OBJET ÉTAIT…', 'THE OBJECT WAS…')}
                </AppText>
                <AppText role="titleL" style={{ textAlign: 'center' }}>{pickL(pj.publicItem.prompt, lang)}</AppText>
              </View>
            )}
            {pj.secret !== null && (
              <SecretPanel secret={pj.secret} lang={lang} title={L('RAPPEL DU SECRET', 'THE SECRET, AS A REMINDER')} />
            )}
            {pj.claimedGuesser !== null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.md }}>
                <Avatar name={nick(pj.claimedGuesser)} size="sm" />
                <AppText role="bodyStrong">
                  {L(`${nick(pj.claimedGuesser)} aurait trouvé — c’était bon ?`, `${nick(pj.claimedGuesser)} got the credit — fair?`)}
                </AppText>
              </View>
            )}
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
              {L(`VOTES : ${pj.votesIn}/${pj.votersExpected}`, `VOTES IN: ${pj.votesIn}/${pj.votersExpected}`)}
            </AppText>
            {pj.judgeKind !== 'stars' && pj.youCanVote && (
              <View style={{ gap: tokens.spacing.md }}>
                <AppText role="titleM" style={{ textAlign: 'center' }}>
                  {pj.judgeKind === 'verdict'
                    ? L(`Alors, ${spotName} a réussi ?`, `So — did ${spotName} pull it off?`)
                    : L('On valide ?', 'Do we validate?')}
                </AppText>
                <PrimaryButton label={L('✅ Réussi', '✅ Nailed it')} onPress={() => sendAction({ kind: 'vote', vote: 'yes' })} />
                <SecondaryButton label={L('❌ Raté', '❌ Failed')} onPress={() => sendAction({ kind: 'vote', vote: 'no' })} />
              </View>
            )}
            {pj.judgeKind !== 'stars' && !pj.youCanVote && (
              <AppText role="titleM" color="textSecondary" style={{ textAlign: 'center' }}>
                {pj.myVote !== null
                  ? L(`Vote verrouillé : ${pj.myVote === 'yes' ? 'Réussi' : 'Raté'}`, `Vote locked: ${pj.myVote === 'yes' ? 'Nailed it' : 'Failed'}`)
                  : L('Le verdict tombe… 🥁', 'The verdict is coming… 🥁')}
              </AppText>
            )}
            {pj.judgeKind === 'stars' && (pj.youCanVote || pj.myStars !== null ? (
              <View style={{ gap: tokens.spacing.md }}>
                <AppText role="titleM" style={{ textAlign: 'center' }}>{L('Note le duo !', 'Rate the duo!')}</AppText>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing.sm }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} disabled={!pj.youCanVote}
                      onPress={() => sendAction({ kind: 'rate', stars: n })}
                      accessibilityLabel={L(`${n} étoiles`, `${n} stars`)}
                      style={{
                        width: 56, height: 56, borderRadius: tokens.radii.lg, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: pj.myStars !== null && n <= pj.myStars ? theme.xp : theme.surface,
                        borderWidth: 2, borderColor: theme.border, ...tokens.elevation.e1,
                      }}>
                      <AppText role="titleM">{pj.myStars !== null && n <= pj.myStars ? '★' : '☆'}</AppText>
                    </Pressable>
                  ))}
                </View>
                {pj.myStars !== null && (
                  <AppText role="caption" color="textSecondary" style={{ textAlign: 'center' }}>
                    {L('Note verrouillée !', 'Rating locked!')}
                  </AppText>
                )}
              </View>
            ) : (
              <AppText role="titleM" color="textSecondary" style={{ textAlign: 'center' }}>
                {L('🤞 Le public vote…', '🤞 The room is voting…')}
              </AppText>
            ))}
          </View>
        )}

        {pj.phase === 'reveal' && (() => {
          const result: TurnResult = pj.result;
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <Stamp outcome={result.outcome} lang={lang} />
              {result.item !== null && (
                <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, gap: tokens.spacing.sm, ...tokens.elevation.e2 }}>
                  <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
                    {L('LA RÉPONSE ÉTAIT…', 'THE ANSWER WAS…')}
                  </AppText>
                  <AppText role="titleL" style={{ textAlign: 'center' }}>{pickL(result.item.prompt, lang)}</AppText>
                </View>
              )}
              {result.tally !== null && (
                <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
                  {L(`Verdict : ${result.tally.yes} ✅ · ${result.tally.no} ❌`, `Verdict: ${result.tally.yes} ✅ · ${result.tally.no} ❌`)}
                </AppText>
              )}
              {result.stars !== null && (
                <View style={{ gap: 4 }}>
                  <AppText role="displayL" style={{ textAlign: 'center' }}>★ {result.stars.avg.toFixed(1)}</AppText>
                  <AppText role="caption" color="textSecondary" style={{ textAlign: 'center' }}>
                    {L(`${result.stars.cast} vote(s)`, `${result.stars.cast} ballot(s)`)}
                    {result.stars.ovation ? L(' · 🏆 OVATION !', ' · 🏆 STANDING OVATION!') : ''}
                  </AppText>
                </View>
              )}
              {result.fast && (
                <AppText role="label" color="success" style={{ textAlign: 'center' }}>
                  {L('⚡ Bonus rapidité !', '⚡ Speed bonus!')}
                </AppText>
              )}
              {/* CC-2 — Money Round applied to this turn's points: scream ×1.5. */}
              {result.moneyRound && (
                <MultiplierBadge
                  multiplier={MONEY_ROUND_MULTIPLIER}
                  title={L('POINTS DOUBLÉS', 'DOUBLE POINTS')}
                />
              )}
              {/* P1-2 — aggregate-only near-miss / split drama stamp. */}
              {result.drama !== null && (
                <AppText role="label" color={result.drama === 'split' ? 'dare' : 'xp'} style={{ textAlign: 'center' }}>
                  {result.drama === 'nailbiter'
                    ? L('😱 À UN VOTE PRÈS !', '😱 ONE VOTE AWAY!')
                    : L('⚖️ LA SALLE EST DIVISÉE !', '⚖️ THE ROOM IS SPLIT!')}
                </AppText>
              )}
              {/* CC-4 — public audience reaction tally rides onto the reveal card. */}
              <ReactionTally counts={result.reactions} lang={lang} />
              {Object.entries(result.points).length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md, justifyContent: 'center' }}>
                  {Object.entries(result.points).map(([id, pts]) => (
                    <View key={id} style={{ alignItems: 'center', gap: 2 }}>
                      <Avatar name={nick(id)} size="sm" />
                      <AppText role="caption" color="success">+{pts}</AppText>
                    </View>
                  ))}
                </View>
              )}
              <Leaderboard scores={pj.scores} />
            </View>
          );
        })()}

        {pj.phase === 'scoreboard' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>{L('Classement 🏁', 'Standings 🏁')}</AppText>
            <Leaderboard scores={pj.scores} />
          </View>
        )}

        <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
      </ScrollView>
    </SafeAreaView>
  );
}
