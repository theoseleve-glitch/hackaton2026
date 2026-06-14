import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { LText } from '@bloop/game-spotlight-guess';
import { asSpotlightGuessView, deviceLang, pickL, type Lang } from '../games/spotlight-guess-view';
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

/** Scale anchors: the labeled ends of the dial (1→10 or 0→100). */
function AnchorRow({ low, high, domain, lang }: {
  low: LText | undefined; high: LText | undefined; domain: 'scale10' | 'wheel100'; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const [lo, hi] = domain === 'scale10' ? ['1', '10'] : ['0', '100'];
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: tokens.spacing.md }}>
      <View style={{ flex: 1, backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
        <AppText role="caption" color="textSecondary">{lo} — {pickL(low, lang)}</AppText>
      </View>
      <View style={{ flex: 1, backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
        <AppText role="caption" color="textSecondary" style={{ textAlign: 'right' }}>{hi} — {pickL(high, lang)}</AppText>
      </View>
    </View>
  );
}

/** Who-has-acted strip: every non-spotlight avatar, dimmed until their hidden entry lands. */
function ActedStrip({ acted, players, spotlightId, lang }: {
  acted: Record<string, boolean>; players: readonly RoomPlayer[]; spotlightId: string; lang: Lang;
}) {
  const { tokens } = useTheme();
  const guessers = players.filter((p) => p.id !== spotlightId);
  const done = guessers.filter((p) => acted[p.id] === true).length;
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
        {lang === 'fr' ? `${done}/${guessers.length} ONT JOUÉ` : `${done}/${guessers.length} LOCKED IN`}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, justifyContent: 'center' }}>
        {guessers.map((p) => (
          <View key={p.id} style={{ opacity: acted[p.id] === true ? 1 : 0.35, alignItems: 'center' }}>
            <Avatar name={p.profile.nickname} size="sm" />
            {acted[p.id] === true && <AppText role="caption" color="success">✓</AppText>}
          </View>
        ))}
      </View>
    </View>
  );
}

/** The spotlight's secret card — only ever rendered on the spotlight's own phone. */
function SecretCard({ value, lang }: { value: number; lang: Lang }) {
  const { theme, tokens } = useTheme();
  return (
    <View style={{ backgroundColor: theme.brand, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, ...tokens.elevation.e2 }}>
      <AppText role="overline" color="textOnBrand" style={{ textAlign: 'center' }}>
        {lang === 'fr' ? '🤫 TON NOMBRE SECRET' : '🤫 YOUR SECRET NUMBER'}
      </AppText>
      <AppText role="displayL" color="textOnBrand" style={{ textAlign: 'center' }}>{value}</AppText>
    </View>
  );
}

/** scale10 dial: ten big tap targets; overwrites are allowed until the reveal. */
function Scale10Pad({ my, onPick, lang }: { my: number | null; onPick: (v: number) => void; lang: Lang }) {
  const { theme, tokens } = useTheme();
  const rows = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]];
  return (
    <View style={{ gap: tokens.spacing.sm }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
          {row.map((n) => {
            const selected = my === n;
            return (
              <Pressable
                key={n}
                onPress={() => onPick(n)}
                accessibilityLabel={`${lang === 'fr' ? 'Note' : 'Score'} ${n}${selected ? (lang === 'fr' ? ', choisie' : ', selected') : ''}`}
                style={{
                  flex: 1, minHeight: 56, borderRadius: tokens.radii.lg, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: selected ? theme.brand : theme.surface,
                  borderWidth: 2, borderColor: selected ? theme.stickerOutline : theme.border,
                  ...tokens.elevation.e1,
                }}>
                <AppText role="titleM" color={selected ? 'textOnBrand' : 'textPrimary'}>{n}</AppText>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** wheel100 dial: stepper with snap-5 jumps; tap the big button to (re)submit. */
function WheelStepper({ draft, setDraft, my, onSubmit, lang }: {
  draft: number; setDraft: (v: number) => void; my: number | null; onSubmit: (v: number) => void; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const steps: ReadonlyArray<readonly [string, number]> = [['−10', -10], ['−5', -5], ['−1', -1], ['+1', 1], ['+5', 5], ['+10', 10]];
  return (
    <View style={{ gap: tokens.spacing.md }}>
      <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl }}>
        <AppText role="displayL" style={{ textAlign: 'center' }}>{draft}</AppText>
        <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>/ 100</AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: tokens.spacing.sm }}>
        {steps.map(([label, delta]) => (
          <Pressable
            key={label}
            onPress={() => setDraft(Math.min(100, Math.max(0, draft + delta)))}
            accessibilityLabel={`${lang === 'fr' ? 'Ajuster de' : 'Adjust by'} ${label}`}
            style={{
              flex: 1, minHeight: 48, borderRadius: tokens.radii.lg, alignItems: 'center', justifyContent: 'center',
              backgroundColor: theme.surface, borderWidth: 2, borderColor: theme.border, ...tokens.elevation.e1,
            }}>
            <AppText role="bodyStrong">{label}</AppText>
          </Pressable>
        ))}
      </View>
      <PrimaryButton
        label={my === null
          ? (lang === 'fr' ? 'Valider ma position' : 'Lock my spot')
          : (lang === 'fr' ? `Posé sur ${my} — re-valider ?` : `Set at ${my} — move it?`)}
        onPress={() => onSubmit(draft)}
      />
    </View>
  );
}

export function SpotlightGuessPlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const sg = asSpotlightGuessView(state.view);
  const now = useNow(sg !== null && sg.phase !== 'over');
  const [wheelDraft, setWheelDraft] = useState(50);

  // Reset the wheel draft whenever a new guess phase begins.
  const guessKey = sg !== null && sg.phase === 'guess' ? sg.round : -1;
  useEffect(() => { setWheelDraft(50); }, [guessKey]);

  useEffect(() => {
    if (sg === null) router.replace(`/room/${code}/lobby`); // no game running → back to the lobby
  }, [sg === null]);
  if (sg === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const player = (id: string): RoomPlayer => byId.get(id) ?? { id, ...UNKNOWN };
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const spotName = sg.phase !== 'over' ? player(sg.spotlightId).profile.nickname : '';
  const iAmSpot = sg.phase !== 'over' && state.playerId === sg.spotlightId;

  const voidBanner = (
    <View style={{ backgroundColor: theme.danger, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
      <AppText role="label" color="textOnBrand" style={{ textAlign: 'center' }}>
        {L('⚠️ MANCHE ANNULÉE — LE PORTEUR DU SECRET A DISPARU', '⚠️ ROUND VOID — THE SECRET KEEPER VANISHED')}
      </AppText>
    </View>
  );

  const scoreRows = (scores: Record<string, number>, gained?: Record<string, number>) =>
    ranked(scores).map(([id, pts], i) => (
      <View key={id} style={{
        flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
        borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, ...tokens.elevation.e1,
      }}>
        <AppText role="titleM">{i === 0 ? '👑' : i + 1}</AppText>
        <Avatar name={player(id).profile.nickname} size="md" />
        <AppText role="bodyStrong" style={{ flex: 1 }}>{player(id).profile.nickname}</AppText>
        {gained !== undefined && (gained[id] ?? 0) > 0 && (
          <AppText role="caption" color="success">+{gained[id]}</AppText>
        )}
        <AppText role="headline" color="xp">{pts} pts</AppText>
      </View>
    ));

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {sg.phase !== 'over' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText role="overline" color="textSecondary">
              {L(`MANCHE ${sg.round + 1} SUR ${sg.totalRounds}`, `ROUND ${sg.round + 1} OF ${sg.totalRounds}`)}
            </AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            )}
          </View>
        )}

        {/* ——— SCALE · target + talk (jeu-de-la-note) ——— */}
        {sg.mode === 'scale' && (sg.phase === 'target' || sg.phase === 'talk') && (
          <View style={{ gap: tokens.spacing.lg }}>
            <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
              <AppText role="titleM" style={{ textAlign: 'center' }}>{pickL(sg.item?.prompt, lang)}</AppText>
            </View>
            <AnchorRow low={sg.item?.low} high={sg.item?.high} domain={sg.domain} lang={lang} />
            {sg.myTarget !== null ? (
              <View style={{ gap: tokens.spacing.md }}>
                <SecretCard value={sg.myTarget} lang={lang} />
                <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                  {sg.phase === 'target'
                    ? L('Mémorise-le. Personne d’autre ne le voit.', 'Memorize it. No one else can see it.')
                    : L('Réponds à voix haute, calibré pile sur ton nombre !', 'Answer out loud, calibrated exactly to your number!')}
                </AppText>
                {sg.phase === 'target' && (
                  <PrimaryButton label={L('Je suis prêt·e !', "I'm ready!")} onPress={() => sendAction({ kind: 'ready' })} />
                )}
                {sg.phase === 'talk' && sg.canEndTalk && (
                  <PrimaryButton label={L('Ouvrir les votes', 'Open the votes')} onPress={() => sendAction({ kind: 'openVotes' })} />
                )}
              </View>
            ) : sg.phase === 'talk' ? (
              // KEYSTONE (P0-A) — live first-impression dial during the 45s talk:
              // guessers set/adjust their current numeric guess while the spotlight
              // performs, overwritable until the timer locks it at talk-end.
              <View style={{ gap: tokens.spacing.md }}>
                <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, alignItems: 'center', gap: tokens.spacing.sm }}>
                  <Avatar name={spotName} size="md" />
                  <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
                    {L(`Écoute ${spotName} et cale ta note en direct !`, `Listen to ${spotName} and dial your score live!`)}
                  </AppText>
                  <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                    {sg.myGuess === null
                      ? L('Pose une première impression — tu pourras la bouger.', 'Drop a first impression — you can still move it.')
                      : L('Ajuste à volonté tant que le porteur parle.', 'Nudge it freely while the keeper talks.')}
                  </AppText>
                </View>
                {sg.domain === 'scale10'
                  ? <Scale10Pad my={sg.myGuess} onPick={(v) => sendAction({ kind: 'guess', value: v })} lang={lang} />
                  : <WheelStepper draft={wheelDraft} setDraft={setWheelDraft} my={sg.myGuess} onSubmit={(v) => sendAction({ kind: 'guess', value: v })} lang={lang} />}
                <ActedStrip acted={sg.hasGuessed} players={state.players} spotlightId={sg.spotlightId} lang={lang} />
              </View>
            ) : (
              <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, alignItems: 'center', gap: tokens.spacing.sm }}>
                <Avatar name={spotName} size="md" />
                <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
                  {L(`${spotName} reçoit son nombre secret…`, `${spotName} is getting their secret number…`)}
                </AppText>
              </View>
            )}
          </View>
        )}

        {/* ——— SCALE · guess ——— */}
        {sg.mode === 'scale' && sg.phase === 'guess' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
              <AppText role="titleM" style={{ textAlign: 'center' }}>{pickL(sg.item?.prompt, lang)}</AppText>
            </View>
            <AnchorRow low={sg.item?.low} high={sg.item?.high} domain={sg.domain} lang={lang} />
            {iAmSpot ? (
              <View style={{ gap: tokens.spacing.md }}>
                {sg.myTarget !== null && <SecretCard value={sg.myTarget} lang={lang} />}
                <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                  {L('ILS VOTENT… PAS UN MOT DE PLUS !', 'THEY’RE DIALING IN… NOT ANOTHER WORD!')}
                </AppText>
              </View>
            ) : (
              <View style={{ gap: tokens.spacing.md }}>
                <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                  {sg.myGuess === null
                    ? L(`À quel point ${spotName} a visé juste ? Place ta note !`, `Where did ${spotName} land? Set your dial!`)
                    : L('Tu peux encore ajuster avant la fin du chrono.', 'You can still adjust until the timer ends.')}
                </AppText>
                {sg.domain === 'scale10'
                  ? <Scale10Pad my={sg.myGuess} onPick={(v) => sendAction({ kind: 'guess', value: v })} lang={lang} />
                  : <WheelStepper draft={wheelDraft} setDraft={setWheelDraft} my={sg.myGuess} onSubmit={(v) => sendAction({ kind: 'guess', value: v })} lang={lang} />}
              </View>
            )}
            <ActedStrip acted={sg.hasGuessed} players={state.players} spotlightId={sg.spotlightId} lang={lang} />
          </View>
        )}

        {/* ——— SCALE · reveal ——— */}
        {sg.mode === 'scale' && sg.phase === 'reveal' && (
          <View style={{ gap: tokens.spacing.lg }}>
            {sg.voided ? voidBanner : (
              <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, ...tokens.elevation.e2 }}>
                <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
                  {L('LE NOMBRE SECRET ÉTAIT', 'THE SECRET NUMBER WAS')}
                </AppText>
                <AppText role="displayL" color="brand" style={{ textAlign: 'center' }}>{sg.target}</AppText>
              </View>
            )}
            {!sg.voided && (
              <View style={{ gap: tokens.spacing.sm }}>
                {state.players.filter((p) => p.id !== sg.spotlightId).map((p) => {
                  const g = sg.guesses[p.id];
                  const d = g !== undefined && sg.target !== null ? Math.abs(g - sg.target) : null;
                  const pts = sg.gained[p.id] ?? 0;
                  return (
                    <View key={p.id} style={{
                      flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                      borderRadius: tokens.radii.lg, padding: tokens.spacing.lg,
                      borderWidth: d === 0 ? 3 : 0, borderColor: theme.xp, ...tokens.elevation.e1,
                    }}>
                      <Avatar name={p.profile.nickname} size="sm" />
                      <View style={{ flex: 1 }}>
                        <AppText role="bodyStrong">{p.profile.nickname}</AppText>
                        <AppText role="caption" color="textSecondary">
                          {g !== undefined ? `${g}` : '—'}
                          {d === 0 ? L('  🎯 PILE !', '  🎯 NAILED IT!') : d !== null ? L(`  (écart ${d})`, `  (off by ${d})`) : ''}
                        </AppText>
                      </View>
                      <AppText role="headline" color={pts > 0 ? 'success' : 'textMuted'}>+{pts}</AppText>
                    </View>
                  );
                })}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }}>
                  <Avatar name={spotName} size="sm" />
                  <AppText role="bodyStrong" style={{ flex: 1 }}>
                    {L(`${spotName} (la voix du secret)`, `${spotName} (kept the secret)`)}
                  </AppText>
                  <AppText role="headline" color={(sg.gained[sg.spotlightId] ?? 0) > 0 ? 'success' : 'textMuted'}>
                    +{sg.gained[sg.spotlightId] ?? 0}
                  </AppText>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ——— REVERSE · answer (devine-la-question) ——— */}
        {sg.mode === 'reverse-question' && sg.phase === 'answer' && (
          iAmSpot && sg.question !== null ? (
            <View style={{ gap: tokens.spacing.lg }}>
              <View style={{ backgroundColor: theme.brand, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
                <AppText role="overline" color="textOnBrand" style={{ textAlign: 'center' }}>
                  {L('🤫 TA QUESTION SECRÈTE', '🤫 YOUR SECRET QUESTION')}
                </AppText>
                <AppText role="titleM" color="textOnBrand" style={{ textAlign: 'center' }}>{pickL(sg.question, lang)}</AppText>
              </View>
              <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                {L('RÉPONDS HONNÊTEMENT — ILS DEVRONT RETROUVER LA QUESTION', 'ANSWER HONESTLY — THEY’LL HUNT FOR THE QUESTION')}
              </AppText>
              {(sg.answers ?? []).map((a, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => sendAction({ kind: 'answer', answerIndex: idx })}
                  accessibilityLabel={pickL(a, lang)}
                  style={{
                    backgroundColor: theme.surface, borderRadius: tokens.radii.xl, borderWidth: 3,
                    borderColor: theme.border, padding: tokens.layout.cardPadding, ...tokens.elevation.e2,
                  }}>
                  <AppText role="bodyStrong" style={{ textAlign: 'center' }}>{pickL(a, lang)}</AppText>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.xl, padding: tokens.spacing.xl, alignItems: 'center', gap: tokens.spacing.md }}>
              <Avatar name={spotName} size="md" />
              <AppText role="titleM" style={{ textAlign: 'center' }}>
                {L(`${spotName} répond à une question secrète…`, `${spotName} is answering a secret question…`)}
              </AppText>
              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {L('Vous ne verrez que sa réponse. À vous de retrouver la question !', 'You’ll only see the answer. Your job: find the question!')}
              </AppText>
              {/* KEYSTONE (P0-B-lite) — content-free react tap: a single value-less
                  buzz so the blank wait isn't dead. Lights your avatar in the count. */}
              {iAmSpot ? null : sg.myReact ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm,
                  backgroundColor: theme.surface, borderRadius: tokens.radii.pill,
                  paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.xl,
                  borderWidth: 2, borderColor: theme.brand, ...tokens.elevation.e1,
                }}>
                  <Avatar name={player(state.playerId ?? '').profile.nickname} size="sm" />
                  <AppText role="bodyStrong" color="brand">
                    {L('⚡ Tu es chaud·e !', '⚡ You’re fired up!')}
                  </AppText>
                </View>
              ) : (
                <Pressable
                  onPress={() => sendAction({ kind: 'react' })}
                  accessibilityLabel={L('Montre que tu es prêt·e', "Show you're ready")}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm,
                    backgroundColor: theme.brand, borderRadius: tokens.radii.pill,
                    paddingVertical: tokens.spacing.md, paddingHorizontal: tokens.spacing.xxl,
                    ...tokens.elevation.sticker,
                  }}>
                  <AppText role="headline" color="textOnBrand">
                    {L('⚡ Je suis chaud·e !', '⚡ I’m fired up!')}
                  </AppText>
                </Pressable>
              )}
              <AppText role="overline" color="textSecondary">
                {lang === 'fr'
                  ? `${sg.reactCount} ${sg.reactCount === 1 ? 'JOUEUR·SE PRÊT·E' : 'PRÊT·E·S'}`
                  : `${sg.reactCount} FIRED UP`}
              </AppText>
            </View>
          )
        )}

        {/* ——— REVERSE · guess (tier ladder) ——— */}
        {sg.mode === 'reverse-question' && sg.phase === 'guess' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
              <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
                {L(`LA RÉPONSE DE ${spotName.toUpperCase()}`, `${spotName.toUpperCase()}'S ANSWER`)}
              </AppText>
              <AppText role="titleL" style={{ textAlign: 'center' }}>« {pickL(sg.chosenAnswer, lang)} »</AppText>
            </View>
            <View style={{ backgroundColor: theme.xp, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
              <AppText role="label" style={{ textAlign: 'center' }}>
                {L(`INDICE ${sg.hintTier}/${sg.hintTiers - 1} — BONNE PIOCHE = ${sg.tierPoints[sg.hintTier] ?? 0} PTS`,
                  `HINT ${sg.hintTier}/${sg.hintTiers - 1} — CORRECT LOCK = ${sg.tierPoints[sg.hintTier] ?? 0} PTS`)}
              </AppText>
            </View>
            {sg.hintsRevealed.map((h, i) => (
              <View key={i} style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }}>
                <AppText role="body" style={{ textAlign: 'center', fontStyle: 'italic' }}>💡 {pickL(h, lang)}</AppText>
              </View>
            ))}
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
              {iAmSpot
                ? L('ILS CHERCHENT TA QUESTION… GARDE TON AIR MYSTÉRIEUX', 'THEY’RE HUNTING YOUR QUESTION… KEEP THE POKER FACE')
                : sg.myGuess !== null
                  ? L('VERROUILLÉ — ON ATTEND LES AUTRES', 'LOCKED IN — WAITING FOR THE OTHERS')
                  : L('QUELLE ÉTAIT LA QUESTION ? UN SEUL ESSAI !', 'WHICH QUESTION WAS IT? ONE SHOT!')}
            </AppText>
            {sg.candidates.map((c, idx) => {
              const selected = sg.myGuess?.value === idx;
              const isMine = iAmSpot && sg.myRealIndex === idx;
              return (
                <Pressable
                  key={idx}
                  onPress={() => sendAction({ kind: 'guess', value: idx })}
                  disabled={iAmSpot || sg.myGuess !== null}
                  accessibilityLabel={`${pickL(c, lang)}${selected ? L(', verrouillée', ', locked') : ''}`}
                  style={{
                    backgroundColor: selected ? theme.brand : theme.surface,
                    borderRadius: tokens.radii.xl, borderWidth: 3,
                    borderColor: selected ? theme.stickerOutline : isMine ? theme.xp : theme.border,
                    padding: tokens.layout.cardPadding,
                    opacity: sg.myGuess !== null && !selected ? 0.55 : 1,
                    ...tokens.elevation.e2,
                  }}>
                  <AppText role="bodyStrong" style={{ textAlign: 'center', color: selected ? '#FFFFFF' : undefined }}>
                    {isMine ? '🤫 ' : ''}{pickL(c, lang)}
                  </AppText>
                </Pressable>
              );
            })}
            <ActedStrip acted={sg.locked} players={state.players} spotlightId={sg.spotlightId} lang={lang} />
          </View>
        )}

        {/* ——— REVERSE · reveal ——— */}
        {sg.mode === 'reverse-question' && sg.phase === 'reveal' && (
          <View style={{ gap: tokens.spacing.lg }}>
            {sg.voided ? voidBanner : (
              <AppText role="titleL" style={{ textAlign: 'center' }}>
                {L('Et la question était…', 'And the question was…')}
              </AppText>
            )}
            {sg.chosenAnswer !== null && (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {L(`Réponse de ${spotName} : « ${pickL(sg.chosenAnswer, lang)} »`, `${spotName}'s answer: “${pickL(sg.chosenAnswer, lang)}”`)}
              </AppText>
            )}
            {!sg.voided && sg.candidates.map((c, idx) => {
              const isReal = sg.realIndex === idx;
              const pickers = Object.entries(sg.picks).filter(([, e]) => e.value === idx);
              return (
                <View key={idx} style={{
                  backgroundColor: isReal ? theme.surface : theme.surfaceAlt, borderRadius: tokens.radii.lg,
                  padding: tokens.spacing.lg, gap: tokens.spacing.sm,
                  borderWidth: isReal ? 3 : 0, borderColor: theme.xp,
                  ...(isReal ? tokens.elevation.e2 : {}),
                }}>
                  <AppText role="bodyStrong">{isReal ? '✅ ' : ''}{pickL(c, lang)}</AppText>
                  {pickers.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm, alignItems: 'center' }}>
                      {pickers.map(([id, e]) => (
                        <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                          <Avatar name={player(id).profile.nickname} size="sm" />
                          <AppText role="caption" color={(sg.gained[id] ?? 0) > 0 ? 'success' : 'textMuted'}>
                            {isReal ? `+${sg.gained[id] ?? 0}` : L(`indice ${e.tier}`, `hint ${e.tier}`)}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
            {!sg.voided && (sg.gained[sg.spotlightId] ?? 0) > 0 && (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {L(`🔮 ${spotName} a été bien lu·e : +${sg.gained[sg.spotlightId]} pts`,
                  `🔮 ${spotName} got read like a book: +${sg.gained[sg.spotlightId]} pts`)}
              </AppText>
            )}
          </View>
        )}

        {/* ——— REVERSE · scoreboard (running totals beat) ——— */}
        {sg.mode === 'reverse-question' && sg.phase === 'scoreboard' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>{L('📊 Le classement', '📊 The standings')}</AppText>
            {scoreRows(sg.scores, sg.gained)}
          </View>
        )}

        {/* ——— OVER ——— */}
        {sg.phase === 'over' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="displayL" style={{ textAlign: 'center' }}>{L('Fini ! 🎉', 'Game over! 🎉')}</AppText>
            {ranked(sg.scores)[0] !== undefined && (
              <AppText role="body" color="textSecondary" style={{ textAlign: 'center' }}>
                {sg.mode === 'scale'
                  ? `${L('🔮 Télépathe du groupe : ', '🔮 Mind reader of the group: ')}${player(ranked(sg.scores)[0]![0]).profile.nickname}`
                  : `${L('🕵️ Fin limier : ', '🕵️ Sharpest sleuth: ')}${player(ranked(sg.scores)[0]![0]).profile.nickname}`}
              </AppText>
            )}
            {scoreRows(sg.scores)}
            <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
          </View>
        )}

        {/* Mid-game there is no "back to lobby" — leaving mid-game is a real leave. */}
        {sg.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
