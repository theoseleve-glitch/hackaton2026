import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { ClosestRoundResult, CrowdCardRevealed, CrowdRoundResult } from '@bloop/game-input-guess';
import { asInputGuessView, deviceLang, pickL, type Lang } from '../games/input-guess-view';
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

function fmt(n: number, lang: Lang, isYear: boolean): string {
  if (isYear) return String(n);
  try {
    return n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');
  } catch {
    return String(n);
  }
}

/** Who-has-answered strip: every roster avatar, dimmed until their secret entry lands. */
function SubmittedStrip({ hasSubmitted, players, lang }: {
  hasSubmitted: Record<string, boolean>; players: readonly RoomPlayer[]; lang: Lang;
}) {
  const { tokens } = useTheme();
  const done = Object.values(hasSubmitted).filter(Boolean).length;
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
        {lang === 'fr' ? `${done}/${players.length} ONT RÉPONDU` : `${done}/${players.length} ANSWERED`}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, justifyContent: 'center' }}>
        {players.map((p) => (
          <View key={p.id} style={{ opacity: hasSubmitted[p.id] === true ? 1 : 0.35, alignItems: 'center' }}>
            <Avatar name={p.profile.nickname} size="sm" />
            {hasSubmitted[p.id] === true && <AppText role="caption" color="success">✓</AppText>}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Big-button digits keypad — integers only, hard maxDigits clamp (design §2.4). */
function Keypad({ draft, setDraft, maxDigits, onSubmit, lang }: {
  draft: string; setDraft: (s: string) => void; maxDigits: number; onSubmit: () => void; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const keys: ReadonlyArray<readonly string[]> = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['⌫', '0', 'OK']];
  const press = (k: string) => {
    if (k === '⌫') { setDraft(draft.slice(0, -1)); return; }
    if (k === 'OK') { onSubmit(); return; }
    if (draft.length >= maxDigits) return;
    setDraft(draft === '0' ? k : draft + k);
  };
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {keys.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          {row.map((k) => {
            const isOk = k === 'OK';
            const okDisabled = isOk && draft.length === 0;
            return (
              <Pressable
                key={k}
                onPress={() => press(k)}
                disabled={okDisabled}
                accessibilityLabel={k === '⌫' ? (lang === 'fr' ? 'Effacer' : 'Backspace') : isOk ? (lang === 'fr' ? 'Valider ma réponse' : 'Submit my answer') : k}
                style={{
                  flex: 1, minHeight: 56, borderRadius: tokens.radii.lg, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isOk ? (okDisabled ? theme.surfaceAlt : theme.brand) : theme.surface,
                  borderWidth: 2, borderColor: isOk ? theme.stickerOutline : theme.border,
                  ...tokens.elevation.e1,
                }}>
                <AppText role="titleM" color={isOk ? (okDisabled ? 'textMuted' : 'textOnBrand') : 'textPrimary'}>{k}</AppText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Reveal list (closest-number): ranked guesses around the slammed-in answer. */
function NumberReveal({ result, isYear, players, lang }: {
  result: ClosestRoundResult; isYear: boolean; players: readonly RoomPlayer[]; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const rows = [...result.ranking, ...result.busted];
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {rows.map((id, i) => {
        const guessed = result.guesses[id];
        const pts = result.pointsEarned[id] ?? 0;
        const exact = result.exact.includes(id);
        const busted = result.busted.includes(id);
        return (
          <View key={id} style={{
            flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
            borderRadius: tokens.radii.lg, padding: tokens.spacing.lg,
            borderWidth: i === 0 && !busted ? 3 : 0, borderColor: theme.xp, ...tokens.elevation.e1,
          }}>
            <AppText role="titleM" color="textMuted">{busted ? '✕' : i + 1}</AppText>
            <Avatar name={nick(id)} size="sm" />
            <View style={{ flex: 1 }}>
              <AppText role="bodyStrong">{nick(id)}</AppText>
              <AppText role="caption" color="textSecondary">
                {guessed !== undefined ? fmt(guessed, lang, isYear) : '—'}
                {exact ? (lang === 'fr' ? '  🎯 PILE !' : '  🎯 NAILED IT!') : ''}
                {busted ? (lang === 'fr' ? '  💥 AU-DESSUS !' : '  💥 OVER!') : ''}
              </AppText>
            </View>
            <AppText role="headline" color={pts > 0 ? 'success' : 'textMuted'}>+{pts}</AppText>
          </View>
        );
      })}
      {rows.length === 0 && (
        <AppText role="body" color="textMuted" style={{ textAlign: 'center' }}>
          {lang === 'fr' ? 'Personne n’a répondu cette manche !' : 'Nobody answered this round!'}
        </AppText>
      )}
    </View>
  );
}

/** Reveal grid (crowd-target): cards flip to their crowd %, avatars land on picks. */
function CrowdReveal({ cards, result, players, lang }: {
  cards: readonly CrowdCardRevealed[]; result: CrowdRoundResult; players: readonly RoomPlayer[]; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {cards.map((card, idx) => {
        const isWin = result.winningCards.includes(idx);
        const isSecond = result.secondCards.includes(idx);
        const pickers = Object.entries(result.picks).filter(([, c]) => c === idx).map(([id]) => id);
        return (
          <View key={card.id} style={{
            backgroundColor: isWin ? theme.surface : theme.surfaceAlt, borderRadius: tokens.radii.lg,
            padding: tokens.spacing.lg, gap: tokens.spacing.sm,
            borderWidth: isWin ? 3 : isSecond ? 2 : 0, borderColor: isWin ? theme.xp : theme.truth,
            ...(isWin ? tokens.elevation.e2 : {}),
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: tokens.spacing.md }}>
              <AppText role="bodyStrong" style={{ flex: 1 }}>{isWin ? '👑 ' : ''}{pickL(card.text, lang)}</AppText>
              <AppText role="headline" color={isWin ? 'brand' : 'textSecondary'}>{card.crowdYesPct}%</AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, flexWrap: 'wrap' }}>
              <AppText role="caption" color="textMuted">
                {lang === 'fr' ? `écart ${card.distance}` : `off by ${card.distance}`}
              </AppText>
              {pickers.map((id) => (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Avatar name={nick(id)} size="sm" />
                  <AppText role="caption" color={(result.pointsEarned[id] ?? 0) > 0 ? 'success' : 'textMuted'}>
                    +{result.pointsEarned[id] ?? 0}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function InputGuessPlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const ig = asInputGuessView(state.view);
  const now = useNow(ig !== null && ig.phase !== 'over');
  const [draft, setDraft] = useState('');

  // Reset the keypad draft whenever a new guess phase begins.
  const guessKey = ig !== null && ig.phase === 'guess' ? ig.round : -1;
  useEffect(() => { setDraft(''); }, [guessKey]);

  useEffect(() => {
    if (ig === null) router.replace(`/room/${code}/lobby`); // no game running → back to the lobby
  }, [ig === null]);
  if (ig === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const player = (id: string): RoomPlayer => byId.get(id) ?? { id, ...UNKNOWN };
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);
  // askKind drives the crowd copy (design §2.5): how the fictional 1,000-person panel was asked.
  const askCopy = (k: 'didYou' | 'agree' | 'wouldYou') =>
    k === 'agree'
      ? L('« Vous êtes d’accord ? »', '“Do you agree?”')
      : k === 'wouldYou'
        ? L('« Vous seriez cap ? »', '“Would you do it?”')
        : L('« Ça vous est déjà arrivé ? »', '“Have you ever?”');

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {ig.phase !== 'over' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText role="overline" color="textSecondary">
              {L(`MANCHE ${ig.round + 1} SUR ${ig.totalRounds}`, `ROUND ${ig.round + 1} OF ${ig.totalRounds}`)}
            </AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            )}
          </View>
        )}

        {/* ——— GUESS · closest-number (Au Pif !) ——— */}
        {ig.phase === 'guess' && ig.mode === 'closest-number' && (() => {
          const submitted = ig.mySubmission !== null;
          const isYear = ig.format === 'year';
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              {ig.finalRound && (
                <View style={{ backgroundColor: theme.xp, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
                  <AppText role="label" style={{ textAlign: 'center' }}>
                    {L('🔥 DERNIÈRE MANCHE — POINTS ×2 !', '🔥 FINAL ROUND — DOUBLE POINTS!')}
                  </AppText>
                </View>
              )}
              <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
                <AppText role="titleM" style={{ textAlign: 'center' }}>{pickL(ig.question, lang)}</AppText>
                {ig.unit !== null && (
                  <AppText role="caption" color="textSecondary" style={{ textAlign: 'center' }}>
                    {L(`Réponse en ${pickL(ig.unit, lang)}`, `Answer in ${pickL(ig.unit, lang)}`)}
                  </AppText>
                )}
              </View>
              {submitted ? (
                <View style={{ gap: tokens.spacing.md }}>
                  <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl }}>
                    <AppText role="displayL" style={{ textAlign: 'center' }}>
                      {fmt(ig.mySubmission ?? 0, lang, isYear)}
                    </AppText>
                    <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                      {L('VERROUILLÉ — ON ATTEND LES AUTRES', 'LOCKED IN — WAITING FOR THE OTHERS')}
                    </AppText>
                  </View>
                  <SubmittedStrip hasSubmitted={ig.hasSubmitted} players={state.players} lang={lang} />
                </View>
              ) : (
                <View style={{ gap: tokens.spacing.md }}>
                  <View
                    accessibilityLabel={L('Ta réponse', 'Your answer')}
                    style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, minHeight: 72, justifyContent: 'center' }}>
                    <AppText role="displayL" color={draft === '' ? 'textMuted' : 'textPrimary'} style={{ textAlign: 'center' }}>
                      {draft === '' ? L('Au pif…', 'Ballpark it…') : fmt(Number(draft), lang, isYear)}
                    </AppText>
                  </View>
                  <Keypad
                    draft={draft} setDraft={setDraft} maxDigits={ig.maxInputDigits} lang={lang}
                    onSubmit={() => {
                      const value = Number(draft);
                      if (draft === '' || !Number.isSafeInteger(value)) return;
                      sendAction({ kind: 'guess', value });
                    }}
                  />
                  <SubmittedStrip hasSubmitted={ig.hasSubmitted} players={state.players} lang={lang} />
                </View>
              )}
            </View>
          );
        })()}

        {/* ——— PICK · crowd-target (Cinquante-Cinquante) ——— */}
        {ig.phase === 'guess' && ig.mode === 'crowd-target' && (() => {
          const submitted = ig.mySubmission !== null;
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <View style={{ backgroundColor: theme.xp, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
                <AppText role="titleM" style={{ textAlign: 'center' }}>
                  {L(`VISE ${ig.targetYesPct}% OUI`, `AIM FOR ${ig.targetYesPct}% YES`)}
                </AppText>
                <AppText role="caption" style={{ textAlign: 'center' }}>
                  {L('On a sondé 1 000 personnes : ', 'We polled 1,000 people: ')}{askCopy(ig.askKind)}
                </AppText>
              </View>
              <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
                <AppText role="titleM" style={{ textAlign: 'center' }}>{pickL(ig.stem, lang)}</AppText>
              </View>
              <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                {submitted
                  ? L('VERROUILLÉ — ON ATTEND LES AUTRES', 'LOCKED IN — WAITING FOR THE OTHERS')
                  : L('TAPE LA CARTE LA PLUS PROCHE DE LA CIBLE', 'TAP THE CARD CLOSEST TO THE TARGET')}
              </AppText>
              {ig.cards.map((card, idx) => {
                const selected = ig.mySubmission === idx;
                return (
                  <Pressable
                    key={card.id}
                    onPress={() => sendAction({ kind: 'pick', cardIndex: idx })}
                    disabled={submitted}
                    accessibilityLabel={`${pickL(card.text, lang)}${selected ? L(', sélectionnée', ', selected') : ''}`}
                    style={{
                      backgroundColor: selected ? theme.brand : theme.surface,
                      borderRadius: tokens.radii.xl, borderWidth: 3,
                      borderColor: selected ? theme.stickerOutline : theme.border,
                      padding: tokens.layout.cardPadding,
                      opacity: submitted && !selected ? 0.55 : 1,
                      ...tokens.elevation.e2,
                    }}>
                    <AppText role="bodyStrong" style={{ textAlign: 'center', color: selected ? '#FFFFFF' : undefined }}>
                      {pickL(card.text, lang)}
                    </AppText>
                  </Pressable>
                );
              })}
              <SubmittedStrip hasSubmitted={ig.hasSubmitted} players={state.players} lang={lang} />
            </View>
          );
        })()}

        {/* ——— REVEAL · closest-number ——— */}
        {ig.phase === 'reveal' && ig.mode === 'closest-number' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>{pickL(ig.question, lang)}</AppText>
            <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, ...tokens.elevation.e2 }}>
              <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
                {L('LA RÉPONSE', 'THE ANSWER')}
              </AppText>
              <AppText role="displayL" color="brand" style={{ textAlign: 'center' }}>
                {fmt(ig.result.answer, lang, ig.format === 'year')}
                {ig.unit !== null ? ` ${pickL(ig.unit, lang)}` : ''}
              </AppText>
              {ig.result.multiplier > 1 && (
                <AppText role="label" color="xp" style={{ textAlign: 'center' }}>
                  {L(`POINTS ×${ig.result.multiplier} !`, `POINTS ×${ig.result.multiplier}!`)}
                </AppText>
              )}
            </View>
            <NumberReveal result={ig.result} isYear={ig.format === 'year'} players={state.players} lang={lang} />
            <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }}>
              <AppText role="body" style={{ textAlign: 'center', fontStyle: 'italic' }}>
                💡 {pickL(ig.funFact, lang)}
              </AppText>
            </View>
          </View>
        )}

        {/* ——— REVEAL · crowd-target ——— */}
        {ig.phase === 'reveal' && ig.mode === 'crowd-target' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>{pickL(ig.stem, lang)}</AppText>
            <View style={{ backgroundColor: theme.xp, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
              <AppText role="titleM" style={{ textAlign: 'center' }}>
                {L(`CIBLE : ${ig.targetYesPct}% OUI`, `TARGET: ${ig.targetYesPct}% YES`)}
              </AppText>
              <AppText role="caption" style={{ textAlign: 'center' }}>
                {askCopy(ig.askKind)} {L('— le % de OUI de la foule s’affiche sur chaque carte', '— each card flips to the crowd’s YES %')}
              </AppText>
              {ig.result.bullseye && (
                <AppText role="label" style={{ textAlign: 'center' }}>
                  {L('🎯 DANS LE MILLE — BONUS +2 !', '🎯 BULLSEYE — +2 BONUS!')}
                </AppText>
              )}
            </View>
            <CrowdReveal cards={ig.cards} result={ig.result} players={state.players} lang={lang} />
          </View>
        )}

        {/* ——— OVER ——— */}
        {ig.phase === 'over' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="displayL" style={{ textAlign: 'center' }}>{L('Fini ! 🎉', 'Game over! 🎉')}</AppText>
            {ranked(ig.scores)[0] !== undefined && (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {ig.mode === 'closest-number'
                  ? `${L('🔮 Œil de lynx : ', '🔮 Sharpest eye: ')}${player(ranked(ig.scores)[0]![0]).profile.nickname}`
                  : `${L('📊 Lecteur de foule : ', '📊 Crowd whisperer: ')}${player(ranked(ig.scores)[0]![0]).profile.nickname}`}
              </AppText>
            )}
            {ranked(ig.scores).map(([id, pts], i) => (
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
            <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
          </View>
        )}

        {/* Mid-game there is no "back to lobby" — leaving mid-game is a real leave. */}
        {ig.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
