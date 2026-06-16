import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type {
  RoundResult, WhoSaidThatAttributeView, WhoSaidThatConfessView,
  WhoSaidThatOverView, WhoSaidThatRevealView, WhoSaidThatStatement,
} from '../games/who-said-that-view';
import { asWhoSaidThatView, deviceLang, pickL, type Lang } from '../games/who-said-that-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import {
  EpilogueCard, ScoreClimb, haptics,
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

/** A statement card flows through AS-IS — a plain string or a {fr,en} pair; pick the locale. */
function statementText(s: WhoSaidThatStatement, lang: Lang): string {
  return typeof s === 'string' ? s : pickL(s, lang);
}

/** The confession card — the spicy "I've done X" line every player secretly answers. */
function StatementCard({ statement, lang }: { statement: WhoSaidThatStatement; lang: Lang }) {
  const { theme, tokens } = useTheme();
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
      <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>👀 {lang === 'fr' ? 'QUI A DÉJÀ…' : 'WHO HAS EVER…'}</AppText>
      <AppText role="titleM" style={{ textAlign: 'center', marginTop: tokens.spacing.sm }}>
        {`"${statementText(statement, lang)}"`}
      </AppText>
    </View>
  );
}

/**
 * CONFESS phase — the secret double-tap. Each player answers MOI (true) / PAS MOI
 * (false). The choice is a value-secret: nobody (not even the count) is exposed
 * until the phase flips. Once tapped, the buttons lock and we wait on the room.
 */
function Confess({ cv, playerCount, lang, onConfess }: {
  cv: WhoSaidThatConfessView; playerCount: number; lang: Lang; onConfess: (value: boolean) => void;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const locked = cv.myConfession !== null;
  const confessedCount = Object.values(cv.hasConfessed).filter(Boolean).length;

  const tap = (value: boolean) => {
    if (locked) return;
    haptics.impact('medium');
    onConfess(value);
  };

  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <StatementCard statement={cv.statement} lang={lang} />

      <AppText role="label" color={locked ? 'textSecondary' : 'brand'} style={{ textAlign: 'center' }}>
        {locked
          ? L(`VERROUILLÉ — ${confessedCount}/${playerCount} ONT RÉPONDU`, `LOCKED IN — ${confessedCount}/${playerCount} ANSWERED`)
          : L('AVOUE EN SECRET — PERSONNE NE VERRA…', 'CONFESS IN SECRET — NOBODY SEES…')}
      </AppText>

      <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
        <Pressable
          onPress={() => tap(true)}
          disabled={locked}
          accessibilityLabel={L('Moi', 'Me')}
          style={{
            flex: 1, alignItems: 'center', gap: tokens.spacing.xs,
            backgroundColor: cv.myConfession === true ? theme.brand : theme.surface,
            borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding,
            borderWidth: 3, borderColor: cv.myConfession === true ? theme.stickerOutline : theme.border,
            opacity: locked && cv.myConfession !== true ? 0.4 : 1, ...tokens.elevation.e1,
          }}>
          <AppText role="displayL" style={{ textAlign: 'center' }}>🙋</AppText>
          <AppText role="titleM" style={{ color: cv.myConfession === true ? '#FFFFFF' : undefined }}>{L('MOI', 'ME')}</AppText>
        </Pressable>
        <Pressable
          onPress={() => tap(false)}
          disabled={locked}
          accessibilityLabel={L('Pas moi', 'Not me')}
          style={{
            flex: 1, alignItems: 'center', gap: tokens.spacing.xs,
            backgroundColor: cv.myConfession === false ? theme.brand : theme.surface,
            borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding,
            borderWidth: 3, borderColor: cv.myConfession === false ? theme.stickerOutline : theme.border,
            opacity: locked && cv.myConfession !== false ? 0.4 : 1, ...tokens.elevation.e1,
          }}>
          <AppText role="displayL" style={{ textAlign: 'center' }}>🙅</AppText>
          <AppText role="titleM" style={{ color: cv.myConfession === false ? '#FFFFFF' : undefined }}>{L('PAS MOI', 'NOT ME')}</AppText>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * ATTRIBUTE phase — THE CLUE drops: the room learns HOW MANY confessed (never
 * who), then every player points a single finger at who they think it was. The
 * accusation is a value-secret too: only the owner's own echo + acted bools show
 * until the reveal. One tap locks it.
 */
function Attribute({ av, players, myId, lang, onAccuse }: {
  av: WhoSaidThatAttributeView; players: readonly RoomPlayer[]; myId: string | null;
  lang: Lang; onAccuse: (target: string) => void;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const locked = av.myAccusation !== null;
  const accusedCount = Object.values(av.hasAccused).filter(Boolean).length;

  const tap = (target: string) => {
    if (locked) return;
    haptics.impact('medium');
    onAccuse(target);
  };

  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <StatementCard statement={av.statement} lang={lang} />

      {/* THE CLUE — the public confessor count (never WHO). The whole game pivots on this. */}
      <View style={{
        backgroundColor: theme.brand, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg,
        alignItems: 'center', gap: tokens.spacing.xs, borderWidth: 3, borderColor: theme.stickerOutline,
        ...tokens.elevation.sticker,
      }}>
        <AppText role="displayL" style={{ textAlign: 'center', color: '#FFFFFF' }}>{av.confessorCount}</AppText>
        <AppText role="label" style={{ textAlign: 'center', color: '#FFFFFF' }}>
          {av.confessorCount <= 1
            ? L(`${av.confessorCount} PERSONNE A AVOUÉ`, `${av.confessorCount} PERSON CONFESSED`)
            : L(`${av.confessorCount} PERSONNES ONT AVOUÉ`, `${av.confessorCount} PEOPLE CONFESSED`)}
        </AppText>
      </View>

      <AppText role="label" color={locked ? 'textSecondary' : 'brand'} style={{ textAlign: 'center' }}>
        {locked
          ? L(`VERROUILLÉ — ${accusedCount}/${players.length} ONT ACCUSÉ`, `LOCKED IN — ${accusedCount}/${players.length} ACCUSED`)
          : L('TAPE QUI TU SOUPÇONNES', 'TAP WHO YOU SUSPECT')}
      </AppText>

      <View style={{ gap: tokens.spacing.sm }}>
        {players.filter((p) => p.id !== myId).map((p) => {
          const picked = av.myAccusation === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => tap(p.id)}
              disabled={locked}
              accessibilityLabel={`${L('Accuser', 'Accuse')} ${p.profile.nickname}`}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
                backgroundColor: picked ? theme.brand : theme.surface,
                borderRadius: tokens.radii.lg, padding: tokens.spacing.md,
                borderWidth: 3, borderColor: picked ? theme.stickerOutline : theme.border,
                opacity: locked && !picked ? 0.4 : 1, ...tokens.elevation.e1,
              }}>
              <Avatar name={p.profile.nickname} size="sm" ring={picked ? 'you' : null} connected={p.connected} />
              <AppText role="bodyStrong" style={{ flex: 1, color: picked ? '#FFFFFF' : undefined }}>
                {picked ? '👉 ' : ''}{p.profile.nickname}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * REVEAL — the atomic flip. The confessors are named for the first time, the
 * accusers who LANDED a hit light up, and the confessors NOBODY caught (the
 * ghosts) cash their bonus. The +points climb in via the shared juice ScoreClimb.
 */
function Reveal({ rv, players, lang }: {
  rv: WhoSaidThatRevealView; players: readonly RoomPlayer[]; lang: Lang;
}) {
  const { theme, tokens } = useTheme();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const result: RoundResult = rv.result;

  useEffect(() => { haptics.impact('medium'); }, [rv.round]);

  const hitSet = new Set(result.hits);
  const ghostSet = new Set(result.ghosts);
  const confessorNames = result.confessors.map(nick).join(', ');
  // Everyone who scored this round, biggest gain first — the climb board.
  const climbers = players
    .map((p) => [p.id, result.delta[p.id] ?? 0] as const)
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <View style={{ gap: tokens.spacing.lg }}>
      <AppText role="titleL" style={{ textAlign: 'center' }}>
        {L("C'était… 🎭", 'It was… 🎭')}
      </AppText>

      {/* THE CONFESSORS — named for the first time. */}
      <View style={{ backgroundColor: theme.brand, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg, gap: tokens.spacing.sm, borderWidth: 3, borderColor: theme.stickerOutline, ...tokens.elevation.sticker }}>
        <AppText role="overline" style={{ textAlign: 'center', color: '#FFFFFF' }}>
          {result.confessors.length === 0
            ? L('PERSONNE NE S\'EST DÉNONCÉ', 'NOBODY OWNED UP')
            : result.confessors.length === 1
              ? L('LE COUPABLE', 'THE GUILTY ONE')
              : L('LES COUPABLES', 'THE GUILTY ONES')}
        </AppText>
        <AppText role="titleL" style={{ textAlign: 'center', color: '#FFFFFF' }}>
          {result.confessors.length === 0 ? '🤷' : confessorNames}
        </AppText>
      </View>

      {/* WHO SCORED — confessors, hits, and ghosts, with the +points climbing in. */}
      <View style={{ gap: tokens.spacing.sm }}>
        {result.confessors.map((id) => {
          const isGhost = ghostSet.has(id);
          const gained = result.delta[id] ?? 0;
          return (
            <View key={`c-${id}`} style={{
              flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
              backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.md,
              borderWidth: isGhost ? 2 : 0, borderColor: theme.success, ...tokens.elevation.e1,
            }}>
              <Avatar name={nick(id)} size="sm" />
              <View style={{ flex: 1 }}>
                <AppText role="bodyStrong">🙋 {nick(id)}</AppText>
                <AppText role="caption" color="textMuted">
                  {isGhost ? L('Fantôme — personne ne l\'a démasqué·e', 'Ghost — nobody caught them') : L('A avoué', 'Confessed')}
                </AppText>
              </View>
              {gained > 0
                ? <ScoreClimb value={gained} role="headline" color="success" signed />
                : <AppText role="caption" color="textMuted">+0</AppText>}
            </View>
          );
        })}

        {result.hits.length > 0 && (
          <>
            <AppText role="overline" color="brand" style={{ marginTop: tokens.spacing.sm }}>
              🎯 {L('ONT VISÉ JUSTE', 'NAILED IT')}
            </AppText>
            {result.hits.map((id) => {
              const gained = result.delta[id] ?? 0;
              return (
                <View key={`h-${id}`} style={{
                  flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
                  backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.md, ...tokens.elevation.e1,
                }}>
                  <Avatar name={nick(id)} size="sm" />
                  <AppText role="bodyStrong" style={{ flex: 1 }}>🎯 {nick(id)}</AppText>
                  {gained > 0
                    ? <ScoreClimb value={gained} role="headline" color="success" signed />
                    : <AppText role="caption" color="textMuted">+0</AppText>}
                </View>
              );
            })}
          </>
        )}

        {/* Anyone who scored but isn't a confessor/hit above (defensive — keeps the climb complete). */}
        {climbers.filter(([id]) => !result.confessors.includes(id) && !hitSet.has(id)).map(([id, gained]) => (
          <View key={`x-${id}`} style={{
            flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md,
            backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.md, ...tokens.elevation.e1,
          }}>
            <Avatar name={nick(id)} size="sm" />
            <AppText role="bodyStrong" style={{ flex: 1 }}>{nick(id)}</AppText>
            <ScoreClimb value={gained} role="headline" color="success" signed />
          </View>
        ))}
      </View>

      <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
        {L('Manche suivante dans un instant…', 'Next round in a moment…')}
      </AppText>
    </View>
  );
}

/**
 * OVER — the cliffhanger epilogue, derived server-side from PUBLIC final scores.
 * Mapped onto the juice-kit EpilogueCard: climbing standings, the crowned MVP,
 * and a photo-finish call-out when the top-2 gap was a nailbiter.
 */
function WhoSaidThatEpilogue({ ov, players, lang, footer }: {
  ov: WhoSaidThatOverView; players: readonly RoomPlayer[]; lang: Lang; footer: React.ReactNode;
}) {
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => (byId.get(id) ?? { id, ...UNKNOWN }).profile.nickname;
  const ep = ov.cliffhanger;
  const standings: EpilogueStanding[] = Object.entries(ov.scores)
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, name: nick(id), score }));

  const supers: EpilogueSuperlative[] = [];
  if (ep.mvp !== null) {
    supers.push({
      key: 'mvp', icon: '👑', label: L('MEILLEUR·E LIMIER·E', 'TOP DETECTIVE'),
      names: nick(ep.mvp),
      detail: ep.closeFinish
        ? L(`Au finish — ${ep.topGap} pt d'écart !`, `Down to the wire — won by ${ep.topGap}!`)
        : undefined,
      tone: 'win',
    });
  } else if (ep.closeFinish) {
    supers.push({
      key: 'tie-crown', icon: '🤝', label: L('COURONNE PARTAGÉE', 'SHARED CROWN'),
      names: standings.filter((s) => s.score === standings[0]?.score).map((s) => s.name).join(' & '),
      detail: L('Ex æquo — personne ne lâche !', 'Dead heat — nobody backed down!'),
      tone: 'spice',
    });
  }
  if (ep.closeFinish && ep.mvp !== null) {
    supers.push({
      key: 'photo-finish', icon: '🤏', label: L('FINISH SERRÉ', 'PHOTO FINISH'),
      names: L(`${ep.topGap} pt d'écart`, `${ep.topGap} pt apart`),
      detail: L('Ça s\'est joué à rien !', 'Down to the wire!'),
      tone: 'spice',
    });
  }

  return (
    <EpilogueCard
      title={L('Fini ! 🎉', 'Game over! 🎉')}
      standings={standings}
      superlatives={supers}
      footer={footer}
    />
  );
}

export function WhoSaidThatPlay({ code }: { code: string }) {
  const { tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const wv = asWhoSaidThatView(state.view);
  const now = useNow(wv !== null && wv.phase !== 'over');

  useEffect(() => {
    if (wv === null) router.replace(`/room/${code}/lobby`);
  }, [wv === null]);
  if (wv === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const sendConfess = (value: boolean) => sendAction({ kind: 'confess', value });
  const sendAccuse = (target: string) => sendAction({ kind: 'accuse', target });

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {wv.phase !== 'over' && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText role="overline" color="textSecondary">
              {L(`MANCHE ${wv.round + 1} SUR ${wv.totalRounds}`, `ROUND ${wv.round + 1} OF ${wv.totalRounds}`)}
            </AppText>
            {left !== null && (
              <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
            )}
          </View>
        )}

        {wv.phase === 'confess' && (
          <Confess cv={wv} playerCount={state.players.length} lang={lang} onConfess={sendConfess} />
        )}

        {wv.phase === 'attribute' && (
          <Attribute av={wv} players={state.players} myId={state.playerId} lang={lang} onAccuse={sendAccuse} />
        )}

        {wv.phase === 'reveal' && <Reveal rv={wv} players={state.players} lang={lang} />}

        {wv.phase === 'over' && (
          <WhoSaidThatEpilogue
            ov={wv}
            players={state.players}
            lang={lang}
            footer={
              <PrimaryButton
                label={L('Retour au salon', 'Back to Lobby')}
                onPress={() => router.replace(`/room/${code}/lobby`)}
              />
            }
          />
        )}

        {wv.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
