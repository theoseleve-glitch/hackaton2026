import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { Choice, TdResult, Verdict } from '@bloop/game-truth-dare';
import { asTruthDareView, deviceLang, pickL, type Lang } from '../games/truth-dare-view';
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

/** Big Truth / Dare (or verdict) choice chip. */
function ChoiceChip({ label, accent, onPress, disabled }: {
  label: string; accent: string; onPress: () => void; disabled?: boolean;
}) {
  const { theme, tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress} disabled={disabled === true}
      accessibilityLabel={label}
      style={{
        backgroundColor: accent,
        borderRadius: tokens.radii.xl,
        borderWidth: 3,
        borderColor: theme.stickerOutline,
        padding: tokens.layout.cardPadding,
        opacity: disabled === true ? 0.55 : 1,
        ...tokens.elevation.e2,
      }}>
      <AppText role="titleM" style={{ textAlign: 'center', color: '#FFFFFF' }}>{label}</AppText>
    </Pressable>
  );
}

/** Rotation rail: every seat, active spotlighted, disconnected greyed. */
function RotationRail({ rotation, activeId, connected, nick }: {
  rotation: readonly string[]; activeId: string; connected: Record<string, boolean>; nick: (id: string) => string;
}) {
  const { tokens } = useTheme();
  return (
    <View
      accessibilityLabel={`Turn order, ${nick(activeId)} is up`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, justifyContent: 'center' }}>
      {rotation.map((id) => (
        <Avatar
          key={id} name={nick(id)} size={id === activeId ? 'md' : 'sm'}
          ring={id === activeId ? 'you' : null} connected={connected[id] === true}
        />
      ))}
    </View>
  );
}

/** The drawn card: choice + tier badge over the prompt text. */
function PromptCard({ choice, intensity, text, lang }: {
  choice: Choice; intensity: string; text: { fr: string; en: string }; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const badge = choice === 'truth' ? L('VÉRITÉ', 'TRUTH') : L('ACTION', 'DARE');
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, gap: tokens.spacing.md, ...tokens.elevation.e2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing.sm }}>
        <View style={{ backgroundColor: choice === 'truth' ? theme.truth : theme.dare, borderRadius: tokens.radii.pill, paddingHorizontal: tokens.spacing.md, paddingVertical: 2 }}>
          <AppText role="overline" style={{ color: '#FFFFFF' }}>{badge}</AppText>
        </View>
        <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.pill, paddingHorizontal: tokens.spacing.md, paddingVertical: 2 }}>
          <AppText role="overline" color="textSecondary">{intensity.toUpperCase()}</AppText>
        </View>
      </View>
      <AppText role="titleM" style={{ textAlign: 'center' }}>{pickL(text, lang)}</AppText>
    </View>
  );
}

/** Score reveal: stamp + tally bar + points burst + forfeit card. */
function ScoreCard({ result, stamp, nick, lang }: {
  result: TdResult; stamp: string; nick: (id: string) => string; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const cast = result.tally.done + result.tally.chickened;
  const donePct = cast === 0 ? 0 : Math.round((result.tally.done / cast) * 100);
  const stampColor = result.verdict === 'done' ? 'success' as const : result.verdict === 'passed' ? 'xp' as const : 'danger' as const;
  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <AppText role="displayL" color={stampColor} style={{ textAlign: 'center' }}>{stamp}</AppText>
      <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
        {nick(result.activePlayer)} — {pickL(result.promptText, lang)}
      </AppText>
      {cast > 0 && (
        <View style={{ gap: tokens.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText role="caption" color="success">{L(`Fait : ${result.tally.done}`, `Done: ${result.tally.done}`)}</AppText>
            <AppText role="caption" color="danger">{L(`Dégonflé : ${result.tally.chickened}`, `Chickened: ${result.tally.chickened}`)}</AppText>
          </View>
          <View style={{ height: 10, borderRadius: tokens.radii.pill, backgroundColor: theme.danger, overflow: 'hidden' }}>
            <View style={{ width: `${donePct}%`, height: 10, backgroundColor: theme.success }} />
          </View>
        </View>
      )}
      <AppText role="headline" color="xp" style={{ textAlign: 'center' }}>
        +{result.pointsAwarded} pts → {nick(result.activePlayer)}
      </AppText>
      {result.forfeitText !== null && (
        <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }}>
          <AppText role="body" style={{ textAlign: 'center', fontStyle: 'italic' }}>
            🃏 {pickL(result.forfeitText, lang)}
          </AppText>
        </View>
      )}
    </View>
  );
}

export function TruthDarePlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const td = asTruthDareView(state.view);
  const now = useNow(td !== null && td.phase !== 'over');

  useEffect(() => {
    if (td === null) router.replace(`/room/${code}/lobby`);
  }, [td === null]);
  if (td === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const labels = td.labels;
  const me = state.playerId ?? '';

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {td.phase !== 'over' && (
          <View style={{ gap: tokens.spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText role="overline" color="textSecondary">
                {L(`MANCHE ${td.round + 1} SUR ${td.totalRounds}`, `ROUND ${td.round + 1} OF ${td.totalRounds}`)}
              </AppText>
              {left !== null && (
                <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
              )}
            </View>
            <RotationRail rotation={td.rotation} activeId={td.activePlayer} connected={td.connected} nick={nick} />
          </View>
        )}

        {td.phase === 'choose' && (
          <View style={{ gap: tokens.spacing.lg }}>
            {td.youAreActive ? (
              <>
                <AppText role="titleL" style={{ textAlign: 'center' }}>
                  {L('À toi de jouer ! 🔥', 'Your turn! 🔥')}
                </AppText>
                {td.choices.includes('truth') && (
                  <ChoiceChip label={L('VÉRITÉ 🗣️', 'TRUTH 🗣️')} accent={theme.truth}
                    onPress={() => sendAction({ kind: 'chooseType', choice: 'truth' })} />
                )}
                {td.choices.includes('dare') && (
                  <ChoiceChip label={L('ACTION 😈', 'DARE 😈')} accent={theme.dare}
                    onPress={() => sendAction({ kind: 'chooseType', choice: 'dare' })} />
                )}
              </>
            ) : (
              <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, alignItems: 'center', gap: tokens.spacing.md, ...tokens.elevation.e1 }}>
                <Avatar name={nick(td.activePlayer)} size="lg" />
                <AppText role="titleM" style={{ textAlign: 'center' }}>
                  {L(`${nick(td.activePlayer)} choisit…`, `${nick(td.activePlayer)} is choosing…`)}
                </AppText>
              </View>
            )}
          </View>
        )}

        {td.phase === 'prompt' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <PromptCard choice={td.choice} intensity={td.intensity} text={td.promptText} lang={lang} />
            {td.youAreActive ? (
              <>
                <PrimaryButton label={pickL(labels.claimDone, lang)}
                  onPress={() => sendAction({ kind: 'declare', result: 'done' })} />
                {td.canPass && (
                  <SecondaryButton
                    label={td.escapeMode === 'pass'
                      ? `${pickL(labels.escape, lang)} (${td.passesLeft[me] ?? 0})`
                      : pickL(labels.escape, lang)}
                    onPress={() => sendAction({ kind: 'pass' })}
                  />
                )}
                <SecondaryButton label={L('Je me dégonfle 🐔', 'I chicken out 🐔')}
                  onPress={() => sendAction({ kind: 'declare', result: 'chickened' })} />
              </>
            ) : (
              <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                {L(`TOUS LES YEUX SUR ${nick(td.activePlayer).toUpperCase()} !`,
                  `ALL EYES ON ${nick(td.activePlayer).toUpperCase()}!`)}
              </AppText>
            )}
          </View>
        )}

        {td.phase === 'verdict' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <PromptCard choice={td.choice} intensity={td.intensity} text={td.promptText} lang={lang} />
            <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }}>
              <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
                {L(`${nick(td.activePlayer)} dit : « ${pickL(labels.claimDone, lang)} » — la salle tranche !`,
                  `${nick(td.activePlayer)} says: “${pickL(labels.claimDone, lang)}” — the room decides!`)}
              </AppText>
            </View>
            {td.youAreActive ? (
              <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                {L('LA SALLE DÉLIBÈRE… 👀', 'THE ROOM IS DECIDING… 👀')}
              </AppText>
            ) : td.youCanVote ? (
              <>
                <ChoiceChip label={pickL(labels.verdictDone, lang)} accent={theme.success}
                  onPress={() => sendAction({ kind: 'verdict', vote: 'done' satisfies Verdict })} />
                <ChoiceChip label={pickL(labels.verdictChickened, lang)} accent={theme.danger}
                  onPress={() => sendAction({ kind: 'verdict', vote: 'chickened' satisfies Verdict })} />
              </>
            ) : (
              <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                {td.youVoted !== null
                  ? L('VOTE VERROUILLÉ ✓', 'VOTE LOCKED ✓')
                  : L('LE JURY VOTE…', 'THE JURY IS VOTING…')}
              </AppText>
            )}
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {L(`${td.votesIn}/${td.votersExpected} votes`, `${td.votesIn}/${td.votersExpected} votes in`)}
            </AppText>
          </View>
        )}

        {td.phase === 'score' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <ScoreCard
              result={td.lastResult}
              stamp={td.lastResult.verdict === 'passed'
                ? pickL(labels.forfeitStamp, lang)
                : td.lastResult.verdict === 'done'
                  ? pickL(labels.verdictDone, lang)
                  : pickL(labels.verdictChickened, lang)}
              nick={nick} lang={lang}
            />
            <AppText role="label" color="brand" style={{ textAlign: 'center' }}>
              {td.nextActive !== null
                ? L(`AU TOUR DE ${nick(td.nextActive).toUpperCase()} →`, `NEXT UP: ${nick(td.nextActive).toUpperCase()} →`)
                : L('DERNIER TOUR — RÉSULTATS !', 'THAT WAS THE LAST TURN — RESULTS!')}
            </AppText>
            <View style={{ gap: tokens.spacing.sm }}>
              {ranked(td.scores).map(([id, pts], i) => (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md }}>
                  <AppText role="caption" color="textMuted">{i + 1}</AppText>
                  <Avatar name={nick(id)} size="sm" />
                  <AppText role="body" style={{ flex: 1 }}>{nick(id)}</AppText>
                  <AppText role="bodyStrong" color="xp">{pts} pts</AppText>
                </View>
              ))}
            </View>
          </View>
        )}

        {td.phase === 'over' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="displayL" style={{ textAlign: 'center' }}>{L('Fini ! 🎉', 'Game over! 🎉')}</AppText>
            {ranked(td.scores).map(([id, pts], i) => (
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

        {td.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
