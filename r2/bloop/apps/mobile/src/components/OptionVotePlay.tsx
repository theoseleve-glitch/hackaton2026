import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { Option, OptionVoteItem, RoundResult } from '@bloop/game-option-vote';
import { asOptionVoteView, deviceLang, pickL, type Lang } from '../games/option-vote-view';
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

function OptionCard({ label, selected, dimmed, onPress, disabled, accent }: {
  label: string; selected: boolean; dimmed: boolean; onPress: () => void; disabled: boolean; accent: string;
}) {
  const { theme, tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      accessibilityLabel={`${label}${selected ? ', selected' : ''}`}
      style={{
        backgroundColor: selected ? accent : theme.surface,
        borderRadius: tokens.radii.xl,
        borderWidth: 3,
        borderColor: selected ? theme.stickerOutline : theme.border,
        padding: tokens.layout.cardPadding,
        opacity: dimmed ? 0.55 : 1,
        ...tokens.elevation.e2,
      }}>
      <AppText role="titleM" style={{ textAlign: 'center', color: selected ? '#FFFFFF' : undefined }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Reveal split: count bars + avatar chips per side, crown on the majority. */
function Split({ result, item, players, lang }: {
  result: RoundResult; item: OptionVoteItem | null; players: readonly RoomPlayer[]; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const total = Math.max(1, result.counts.A + result.counts.B);
  const sides: Array<{ opt: Option; label: string; count: number; color: string }> = [
    { opt: 'A', label: pickL(item?.optionA, lang), count: result.counts.A, color: theme.truth },
    { opt: 'B', label: pickL(item?.optionB, lang), count: result.counts.B, color: theme.dare },
  ];
  return (
    <View style={{ gap: tokens.spacing.lg }}>
      {result.majority === null && (
        <View style={{ backgroundColor: theme.xp, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
          <AppText role="titleM" style={{ textAlign: 'center' }}>
            {lang === 'fr' ? '⚖️ ÉGALITÉ PARFAITE !' : '⚖️ PERFECT SPLIT!'}
          </AppText>
        </View>
      )}
      {sides.map((side) => {
        const pct = Math.round((side.count / total) * 100);
        const isMajority = result.majority === side.opt;
        const voters = Object.entries(result.picks).filter(([, pick]) => pick === side.opt).map(([id]) => id);
        return (
          <View key={side.opt} style={{
            backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg,
            borderWidth: isMajority ? 3 : 0, borderColor: theme.xp, gap: tokens.spacing.sm, ...tokens.elevation.e1,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText role="bodyStrong" style={{ flex: 1 }}>{isMajority ? '👑 ' : ''}{side.label}</AppText>
              <AppText role="headline" color="brand">{pct}%</AppText>
            </View>
            <View style={{ height: 10, borderRadius: tokens.radii.pill, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ width: `${pct}%`, height: 10, backgroundColor: side.color }} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, alignItems: 'center' }}>
              {voters.map((id) => (
                <View key={id} style={{ alignItems: 'center', gap: 2 }}>
                  <Avatar name={nick(id)} size="sm" />
                  {result.awarded.includes(id) && (
                    <AppText role="caption" color="success">+1</AppText>
                  )}
                </View>
              ))}
              {voters.length === 0 && <AppText role="caption" color="textMuted">—</AppText>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function OptionVotePlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const ov = asOptionVoteView(state.view);
  const now = useNow(ov !== null && ov.phase !== 'over');
  const isTuPreferes = state.viewGameId === 'tu-preferes';
  const [pick, setPick] = useState<Option | null>(null);

  // Reset the local two-tap draft whenever a new choose phase begins.
  const chooseKey = ov?.phase === 'choose' ? ov.round : -1;
  useEffect(() => { setPick(null); }, [chooseKey]);

  useEffect(() => {
    if (ov === null) router.replace(`/room/${code}/lobby`);
  }, [ov === null]);
  if (ov === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const player = (id: string): RoomPlayer => byId.get(id) ?? { id, ...UNKNOWN };
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);

  const submitBallot = (chosen: Option, predict?: Option) =>
    sendAction({ kind: 'ballot', pick: chosen, ...(predict !== undefined ? { predict } : {}) });

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {ov.phase !== 'over' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText role="overline" color="textSecondary">
              {L(`MANCHE ${ov.round + 1} SUR ${ov.totalRounds}`, `ROUND ${ov.round + 1} OF ${ov.totalRounds}`)}
            </AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            )}
          </View>
        )}

        {ov.phase === 'choose' && (() => {
          const submitted = ov.myBallot !== null;
          const predicting = isTuPreferes && pick !== null && !submitted;
          const waitingCount = Object.values(ov.hasSubmitted).filter(Boolean).length;
          const headline = ov.item?.prompt !== undefined
            ? `${ov.item.emoji !== undefined ? `${ov.item.emoji} ` : ''}${pickL(ov.item.prompt, lang)}`
            : L('Tu préfères…', 'Would you rather…');
          const instruction = submitted
            ? L(`VERROUILLÉ — ${waitingCount}/${state.players.length} ONT VOTÉ`, `LOCKED IN — ${waitingCount}/${state.players.length} VOTED`)
            : predicting
              ? L('ET LA SALLE, ELLE CHOISIT QUOI ?', 'NOW — WHAT DOES THE ROOM PICK?')
              : isTuPreferes
                ? L('TAPE TON CHOIX', 'TAP YOUR PICK')
                : L('VOTE !', 'CAST YOUR VOTE!');
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
                <AppText role="titleM" style={{ textAlign: 'center' }}>{headline}</AppText>
              </View>
              <AppText role="label" color={predicting ? 'brand' : 'textSecondary'} style={{ textAlign: 'center' }}>
                {instruction}
              </AppText>
              {(['A', 'B'] as const).map((opt) => {
                const label = pickL(opt === 'A' ? ov.item?.optionA : ov.item?.optionB, lang);
                const myPick = submitted ? ov.myBallot?.pick : pick;
                return (
                  <OptionCard
                    key={opt}
                    label={label}
                    selected={myPick === opt}
                    dimmed={predicting && pick !== opt}
                    disabled={submitted}
                    accent={opt === 'A' ? theme.truth : theme.dare}
                    onPress={() => {
                      if (!isTuPreferes) { submitBallot(opt); return; }
                      if (pick === null) { setPick(opt); return; }
                      submitBallot(pick, opt); // second tap = the prediction, auto-submits
                    }}
                  />
                );
              })}
              {predicting && (
                <SecondaryButton label={L('↩︎ Changer mon choix', '↩︎ Change my pick')} onPress={() => setPick(null)} />
              )}
            </View>
          );
        })()}

        {(ov.phase === 'reveal' || ov.phase === 'debate') && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>
              {L('Les votes sont tombés !', 'The votes are in!')}
            </AppText>
            {ov.item?.prompt !== undefined && (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {ov.item.emoji !== undefined ? `${ov.item.emoji} ` : ''}{pickL(ov.item.prompt, lang)}
              </AppText>
            )}
            <Split result={ov.result} item={ov.item} players={state.players} lang={lang} />
            {ov.phase === 'debate' && (
              <View style={{ gap: tokens.spacing.md }}>
                {ov.item?.debateStarter !== undefined && (
                  <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }}>
                    <AppText role="body" style={{ textAlign: 'center', fontStyle: 'italic' }}>
                      💬 {pickL(ov.item.debateStarter, lang)}
                    </AppText>
                  </View>
                )}
                <PrimaryButton
                  label={ov.mySkip
                    ? L(`On attend les autres… ${ov.skipCount}/${ov.skipNeeded}`, `Waiting for the others… ${ov.skipCount}/${ov.skipNeeded}`)
                    : L(`On passe → ${ov.skipCount}/${ov.skipNeeded}`, `Next → ${ov.skipCount}/${ov.skipNeeded}`)}
                  onPress={() => sendAction({ kind: 'skip' })}
                  disabled={ov.mySkip}
                />
              </View>
            )}
          </View>
        )}

        {ov.phase === 'over' && (() => {
          const contrarian = ov.scoring === 'majority-herd'
            ? ranked(ov.minorityCount).filter(([, n]) => n > 0)[0]
            : undefined;
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <AppText role="displayL" style={{ textAlign: 'center' }}>{L('Fini ! 🎉', 'Game over! 🎉')}</AppText>
              {ov.scoring === 'predict-majority' && ranked(ov.scores)[0] !== undefined && (
                <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                  {L("🔮 Oracle du groupe : ", '🔮 Oracle of the group: ')}{player(ranked(ov.scores)[0]![0]).profile.nickname}
                </AppText>
              )}
              {ranked(ov.scores).map(([id, pts], i) => (
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
              {contrarian !== undefined && (
                <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                  {L(`🐐 L'esprit contraire : ${player(contrarian[0]).profile.nickname} (${contrarian[1]}× minoritaire)`,
                    `🐐 The Contrarian: ${player(contrarian[0]).profile.nickname} (${contrarian[1]}× in the minority)`)}
                </AppText>
              )}
              <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
            </View>
          );
        })()}

        {ov.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
