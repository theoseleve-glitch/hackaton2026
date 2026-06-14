import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RoomPlayer } from '@bloop/protocol';
import type { LText, Role, Seat } from '@bloop/game-night-day';
import { asNightDayView, deviceLang, pickL, type Lang } from '../games/night-day-view';
import { secondsLeft } from '../games/tracer-view';
import { useRoom } from '../net/context';
import { useTheme } from '../theme/useTheme';
import { haptics, SuperlativeRow, type EpilogueSuperlative } from './juice';
import { Avatar, VoteCard } from './players';
import { AppText, PrimaryButton, SecondaryButton } from './ui';

const UNKNOWN: Omit<RoomPlayer, 'id'> = { profile: { nickname: '???', avatar: '' }, connected: false, isHost: false };

const ROLE_LABEL: Record<Role, LText> = {
  wolf: { fr: '🐺 Loup-Garou', en: '🐺 Werewolf' },
  villager: { fr: '🧑‍🌾 Villageois', en: '🧑‍🌾 Villager' },
  seer: { fr: '🔮 Voyante', en: '🔮 Seer' },
  witch: { fr: '🧪 Sorcière', en: '🧪 Witch' },
};

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** {victim}/{target} narration tokens are substituted client-side with nicknames — the engine never sees names. */
function subst(text: string, names: string[]): string {
  return text.replace(/\{victim\}|\{target\}/g, names.join(', '));
}

/** Avatar strip with a ✓ for players who already acted (booleans only — never choices). */
function ProgressChips({ flags, ids, players }: {
  flags: Record<string, boolean>; ids: readonly string[]; players: readonly RoomPlayer[];
}) {
  const { tokens } = useTheme();
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md, justifyContent: 'center' }}>
      {ids.map((id) => {
        const p = byId.get(id) ?? { id, ...UNKNOWN };
        const done = flags[id] === true;
        return (
          <View key={id} style={{ alignItems: 'center', gap: 2, opacity: done ? 1 : 0.5 }}
            accessibilityLabel={`${p.profile.nickname}${done ? ', done' : ', waiting'}`}>
            <Avatar name={p.profile.nickname} size="sm" />
            <AppText role="caption" color={done ? 'success' : 'textMuted'}>{done ? '✓' : '…'}</AppText>
          </View>
        );
      })}
    </View>
  );
}

/** Atmospheric narration card (PUBLIC pack flavor, bilingual). */
function Narration({ text, names, lang }: { text: LText | null; names: string[]; lang: Lang }) {
  const { theme, tokens } = useTheme();
  if (text === null) return null;
  return (
    <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg }}>
      <AppText role="body" style={{ textAlign: 'center', fontStyle: 'italic' }}>
        {subst(pickL(text, lang), names)}
      </AppText>
    </View>
  );
}

export function NightDayPlay({ code }: { code: string }) {
  const { theme, tokens } = useTheme();
  const { state, sendAction, leave } = useRoom();
  const lang = deviceLang();
  const L = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const nv = asNightDayView(state.view);
  const now = useNow(nv !== null && nv.phase !== 'over');
  const [peeking, setPeeking] = useState(false);
  const [witchHeal, setWitchHeal] = useState(false);
  const [poisonArmed, setPoisonArmed] = useState(false);
  // CC-1 Night Read: non-actors arm a secret wolf-hunch before tapping a seat.
  const [readArmed, setReadArmed] = useState(false);

  // Reset the local witch drafts whenever the beat changes.
  const beatKey = nv === null ? '' : `${nv.phase}:${nv.phase === 'night' ? nv.step : ''}:${nv.round}`;
  useEffect(() => { setWitchHeal(false); setPoisonArmed(false); setReadArmed(false); }, [beatKey]);

  // Heavy haptic on the dawn death reveal — the gut-punch when the night took
  // someone. Keyed on the dawn beat so it fires once per reveal, only on a death
  // (a no-death dawn stays silent). haptics is a no-op under Reduce Motion.
  const dawnDeaths = nv !== null && nv.phase === 'dawn' ? nv.lastDawn.died.length : 0;
  useEffect(() => {
    if (nv !== null && nv.phase === 'dawn' && dawnDeaths > 0) haptics.impact('heavy');
  }, [beatKey]);

  useEffect(() => {
    if (nv === null) router.replace(`/room/${code}/lobby`); // no game running → back to the lobby
  }, [nv === null]);
  if (nv === null) return null;

  const left = secondsLeft(state.deadlineAt, now);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const player = (id: string): RoomPlayer => byId.get(id) ?? { id, ...UNKNOWN };
  const nick = (id: string) => player(id).profile.nickname;
  const me = state.playerId;
  const aliveSeats = nv.seats.filter((s) => s.alive);
  const aliveIds = aliveSeats.map((s) => s.id);
  const roleLabel = (r: Role) => pickL(ROLE_LABEL[r], lang);
  const ranked = (scores: Record<string, number>) => Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const isNight = nv.phase === 'night';

  const header = nv.phase === 'roleReveal'
    ? L('DISTRIBUTION DES RÔLES', 'ROLE ASSIGNMENT')
    : isNight
      ? L(`🌙 NUIT ${nv.round + 1}`, `🌙 NIGHT ${nv.round + 1}`)
      : nv.phase === 'over'
        ? ''
        : L(`☀️ JOUR ${nv.round + 1}`, `☀️ DAY ${nv.round + 1}`);

  const compositionLine = (['wolf', 'seer', 'witch', 'villager'] as const)
    .filter((r) => nv.composition[r] > 0)
    .map((r) => `${nv.composition[r]} ${roleLabel(r).split(' ')[0]}`)
    .join(' · ');

  /** Tappable list of living players: the actor's real pick OR the decoy sleep tap. */
  const seatList = (targets: readonly Seat[], onPick: (id: string) => void, disabled: boolean) =>
    targets.map((s) => (
      <VoteCard
        key={s.id} player={player(s.id)} selected={false} voted={nv.phase === 'night' && nv.acted[s.id] === true}
        disabled={disabled} onPress={() => onPick(s.id)}
      />
    ));

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.screenPadding, gap: tokens.spacing.lg }}>
        {nv.phase !== 'over' && (
          <View style={{ gap: tokens.spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText role="overline" color="textSecondary">{header}</AppText>
              {left !== null && (
                <AppText role="titleM" color={left <= 5 ? 'danger' : 'textSecondary'}>{left}s</AppText>
              )}
            </View>
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>{compositionLine}</AppText>
          </View>
        )}

        {nv.phase === 'roleReveal' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>{L('Ton rôle secret 🤫', 'Your secret role 🤫')}</AppText>
            <Pressable
              onPressIn={() => setPeeking(true)}
              onPressOut={() => setPeeking(false)}
              disabled={nv.myRole === null}
              accessibilityLabel={L('Maintiens pour voir ton rôle', 'Hold to peek at your role')}
              style={{
                backgroundColor: peeking ? theme.brand : theme.surface,
                borderRadius: tokens.radii.xl, borderWidth: 3, borderColor: theme.stickerOutline,
                padding: tokens.layout.cardPadding, minHeight: 150, justifyContent: 'center', gap: tokens.spacing.sm,
                ...tokens.elevation.e2,
              }}>
              {nv.myRole === null ? (
                <AppText role="titleM" style={{ textAlign: 'center' }}>
                  {L('Spectateur — pas de rôle pour toi', 'Spectator — no role for you')}
                </AppText>
              ) : peeking ? (
                <View style={{ gap: tokens.spacing.sm }}>
                  <AppText role="titleL" style={{ textAlign: 'center', color: '#FFFFFF' }}>
                    {nv.myRoleCard !== null ? pickL(nv.myRoleCard.name, lang) : roleLabel(nv.myRole)}
                  </AppText>
                  {nv.myRoleCard !== null && (
                    <AppText role="caption" style={{ textAlign: 'center', color: '#FFFFFF' }}>
                      {pickL(nv.myRoleCard.text, lang)}
                    </AppText>
                  )}
                  {nv.wolfPack !== null && (
                    <AppText role="bodyStrong" style={{ textAlign: 'center', color: '#FFFFFF' }}>
                      {L('Ta meute : ', 'Your pack: ')}{nv.wolfPack.map(nick).join(', ')}
                    </AppText>
                  )}
                </View>
              ) : (
                <AppText role="titleM" style={{ textAlign: 'center' }}>{L('👆 Maintiens pour voir', '👆 Hold to peek')}</AppText>
              )}
            </Pressable>
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {L('Écran contre toi. Personne ne doit voir ta carte.', 'Screen close to your chest. Nobody sees your card.')}
            </AppText>
            <ProgressChips flags={nv.acked} ids={aliveIds} players={state.players} />
            <PrimaryButton
              label={nv.myAck ? L('Mémorisé ✓ — on attend les autres', 'Memorized ✓ — waiting for the others') : L("C'est mémorisé !", 'Got it memorized!')}
              onPress={() => sendAction({ kind: 'ackRole' })}
              disabled={nv.myAck || nv.myRole === null}
            />
          </View>
        )}

        {nv.phase === 'night' && (() => {
          const stepTitle = nv.step === 'seer'
            ? L('La nuit — la voyante observe…', 'Night — the seer is watching…')
            : nv.step === 'wolves'
              ? L('La nuit — les loups rôdent…', 'Night — the wolves are prowling…')
              : L('La nuit — la sorcière hésite…', 'Night — the witch is deciding…');
          const targets = nv.amActor && nv.step === 'wolves' && nv.wolfPack !== null
            ? aliveSeats.filter((s) => !nv.wolfPack!.includes(s.id))
            : aliveSeats.filter((s) => s.id !== me);
          const onPick = (id: string) => {
            if (!nv.amActor) {
              // CC-1: a non-actor who armed a Night Read secretly marks a wolf;
              // otherwise the seat tap is the decoy sleep (no read).
              sendAction(readArmed ? { kind: 'nightRead', target: id } : { kind: 'nightAck' });
              return;
            }
            if (nv.step === 'seer') { sendAction({ kind: 'seerPeek', target: id }); return; }
            if (nv.step === 'wolves') { sendAction({ kind: 'wolfVote', target: id }); return; }
            if (poisonArmed) { sendAction({ kind: 'witchAct', heal: witchHeal, poisonTarget: id }); return; }
            sendAction({ kind: 'nightAck' });
          };
          const myPeek = nv.seerLog?.filter((e) => e.round === nv.round) ?? [];
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
                <AppText role="titleM" style={{ textAlign: 'center' }}>{stepTitle}</AppText>
              </View>
              <Narration text={nv.narration} names={[]} lang={lang} />

              {!nv.iAmAlive && (
                <AppText role="body" color="textMuted" style={{ textAlign: 'center' }}>
                  {L('💀 Tu es mort·e. Observe en silence — et garde tes secrets.', '💀 You are dead. Watch in silence — and keep your secrets.')}
                </AppText>
              )}

              {nv.iAmAlive && nv.myActed && (
                <View style={{ gap: tokens.spacing.sm }}>
                  <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                    {L('ENDORMI ✓ — ON ATTEND LES AUTRES', 'ASLEEP ✓ — WAITING FOR THE OTHERS')}
                  </AppText>
                  {/* CC-1 Night Read — owner-only echo of who I secretly marked this round. */}
                  {!nv.amActor && nv.myNightRead !== null && (
                    <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
                      <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
                        {L(`🔍 Ta lecture : ${nick(nv.myNightRead)} 🐺`, `🔍 Your read: ${nick(nv.myNightRead)} 🐺`)}
                      </AppText>
                      <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                        {L('Toi seul·e le sais. Justesse révélée à la fin.', 'Only you know. Accuracy revealed at the end.')}
                      </AppText>
                    </View>
                  )}
                </View>
              )}

              {nv.iAmAlive && !nv.myActed && (
                <View style={{ gap: tokens.spacing.md }}>
                  <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
                    {nv.amActor && nv.step === 'seer' && L('SONDE UN JOUEUR — LOUP OU PAS ?', 'PROBE A PLAYER — WOLF OR NOT?')}
                    {nv.amActor && nv.step === 'wolves' && L('CHOISIS LA VICTIME DE LA MEUTE', "PICK THE PACK'S VICTIM")}
                    {nv.amActor && nv.step === 'witch' && !poisonArmed && L('TES POTIONS, TES RÈGLES', 'YOUR POTIONS, YOUR RULES')}
                    {nv.amActor && nv.step === 'witch' && poisonArmed && L('TAPE QUI BOIRA LE POISON', 'TAP WHO DRINKS THE POISON')}
                    {!nv.amActor && (readArmed
                      ? L('TAPE LE LOUP QUE TU SOUPÇONNES 🐺', 'TAP THE WOLF YOU SUSPECT 🐺')
                      : L('LECTURE DE NUIT — MARQUE UN LOUP ?', 'NIGHT READ — MARK A WOLF?'))}
                  </AppText>

                  {/* CC-1 Night Read — living non-actors secretly mark a suspected wolf. */}
                  {!nv.amActor && (
                    <View style={{ gap: tokens.spacing.md }}>
                      <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, gap: 4 }}>
                        <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
                          {L('🔍 Lecture de nuit', '🔍 Night Read')}
                        </AppText>
                        <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                          {L('Marque en secret qui tu crois être un loup. Personne ne le voit — ta justesse est dévoilée à la fin.',
                            'Secretly mark who you think is a wolf. Nobody sees it — your accuracy is revealed at the end.')}
                        </AppText>
                      </View>
                      <SecondaryButton
                        label={readArmed
                          ? L('✕ Annuler — juste dormir', '✕ Cancel — just sleep')
                          : L('🐺 Marquer un loup', '🐺 Mark a wolf')}
                        onPress={() => setReadArmed(!readArmed)}
                      />
                      <PrimaryButton
                        label={L('😴 Passer — aucune lecture', '😴 Skip — no read')}
                        onPress={() => sendAction({ kind: 'nightAck' })}
                      />
                    </View>
                  )}

                  {nv.amActor && nv.step === 'wolves' && nv.wolfVotes !== null && (
                    <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.md, gap: 4 }}>
                      <AppText role="caption" color="textSecondary" style={{ textAlign: 'center' }}>
                        {L('Votes de la meute (en direct) :', 'Pack votes (live):')}
                      </AppText>
                      {Object.entries(nv.wolfVotes).map(([w, t]) => (
                        <AppText key={w} role="caption" style={{ textAlign: 'center' }}>🐺 {nick(w)} → {nick(t)}</AppText>
                      ))}
                      {Object.keys(nv.wolfVotes).length === 0 && (
                        <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>—</AppText>
                      )}
                    </View>
                  )}

                  {nv.amActor && nv.step === 'witch' && (
                    <View style={{ gap: tokens.spacing.md }}>
                      <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, ...tokens.elevation.e1 }}>
                        <AppText role="bodyStrong" style={{ textAlign: 'center' }}>
                          {nv.pendingKill !== null
                            ? L(`Les loups ont condamné ${nick(nv.pendingKill)}.`, `The wolves condemned ${nick(nv.pendingKill)}.`)
                            : L('Les loups ne tueront personne cette nuit.', 'The wolves kill nobody tonight.')}
                        </AppText>
                        <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                          {L(`Potion de vie ${nv.witchState?.healLeft === true ? 'disponible 💚' : 'épuisée'} · Poison ${nv.witchState?.poisonLeft === true ? 'disponible 🧪' : 'épuisé'}`,
                            `Healing potion ${nv.witchState?.healLeft === true ? 'ready 💚' : 'spent'} · Poison ${nv.witchState?.poisonLeft === true ? 'ready 🧪' : 'spent'}`)}
                        </AppText>
                      </View>
                      {nv.pendingKill !== null && nv.witchState?.healLeft === true && (
                        <SecondaryButton
                          label={witchHeal
                            ? L(`💚 Sauver ${nick(nv.pendingKill)} ✓`, `💚 Save ${nick(nv.pendingKill)} ✓`)
                            : L(`💚 Sauver ${nick(nv.pendingKill)}`, `💚 Save ${nick(nv.pendingKill)}`)}
                          onPress={() => setWitchHeal(!witchHeal)}
                        />
                      )}
                      {nv.witchState?.poisonLeft === true && (
                        <SecondaryButton
                          label={poisonArmed ? L('🧪 Poison armé — choisis en dessous', '🧪 Poison armed — pick below') : L('🧪 Empoisonner quelqu’un', '🧪 Poison someone')}
                          onPress={() => setPoisonArmed(!poisonArmed)}
                        />
                      )}
                      <PrimaryButton
                        label={witchHeal ? L('Valider et dormir', 'Confirm and sleep') : L('Dormir sans potion', 'Sleep, no potions')}
                        onPress={() => sendAction({ kind: 'witchAct', heal: witchHeal, poisonTarget: null })}
                      />
                    </View>
                  )}

                  {(nv.amActor
                    ? (nv.step === 'witch' ? poisonArmed : true)
                    : readArmed) && (
                    <View style={{ gap: tokens.spacing.md }}>{seatList(targets, onPick, false)}</View>
                  )}
                </View>
              )}

              {nv.amActor && nv.step === 'seer' && myPeek.length > 0 && (
                <View style={{ backgroundColor: theme.xp, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
                  {myPeek.map((e) => (
                    <AppText key={`${e.round}-${e.target}`} role="bodyStrong" style={{ textAlign: 'center' }}>
                      {e.isWolf
                        ? L(`🐺 ${nick(e.target)} est un LOUP !`, `🐺 ${nick(e.target)} is a WOLF!`)
                        : L(`🕊️ ${nick(e.target)} n'est pas un loup.`, `🕊️ ${nick(e.target)} is not a wolf.`)}
                    </AppText>
                  ))}
                </View>
              )}

              {nv.iAmAlive && <ProgressChips flags={nv.acted} ids={aliveIds} players={state.players} />}
            </View>
          );
        })()}

        {nv.phase === 'dawn' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>{L('Le soleil se lève ☀️', 'The sun rises ☀️')}</AppText>
            <Narration text={nv.narration} names={nv.lastDawn.died.map(nick)} lang={lang} />
            {/* P1-1 first-night shield — struck night 1 but survived; no role leak. */}
            {nv.lastDawn.marked !== null && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, borderWidth: 3, borderColor: theme.xp, ...tokens.elevation.e1,
              }}>
                <Avatar name={nick(nv.lastDawn.marked)} size="md" />
                <View style={{ flex: 1 }}>
                  <AppText role="bodyStrong">🛡️ {nick(nv.lastDawn.marked)}</AppText>
                  <AppText role="caption" color="textMuted">
                    {L('Attaqué·e la 1re nuit — mais a survécu.', 'Attacked night 1 — but survived.')}
                  </AppText>
                </View>
              </View>
            )}
            {nv.lastDawn.died.length === 0 ? (
              <AppText role="titleM" style={{ textAlign: 'center' }}>
                {L('Personne n’est mort cette nuit.', 'Nobody died last night.')}
              </AppText>
            ) : (
              nv.lastDawn.died.map((id) => (
                <View key={id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                  borderRadius: tokens.radii.lg, padding: tokens.spacing.lg, borderWidth: 3, borderColor: theme.danger, ...tokens.elevation.e1,
                }}>
                  <Avatar name={nick(id)} size="md" />
                  <AppText role="bodyStrong" style={{ flex: 1 }}>{nick(id)}</AppText>
                  <AppText role="label" color="danger">
                    {nv.lastDawn.revealedRoles !== null && nv.lastDawn.revealedRoles[id] !== undefined
                      ? roleLabel(nv.lastDawn.revealedRoles[id]!)
                      : '💀'}
                  </AppText>
                </View>
              ))
            )}
          </View>
        )}

        {nv.phase === 'debate' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>{L('Débattez ! 🗣️', 'Debate! 🗣️')}</AppText>
            <View style={{ backgroundColor: theme.surface, borderRadius: tokens.radii.xl, padding: tokens.layout.cardPadding, ...tokens.elevation.e2 }}>
              <AppText role="titleM" style={{ textAlign: 'center' }}>
                {L('Qui accuse qui ? Parlez maintenant — le vote arrive.', 'Who accuses whom? Talk now — the vote is coming.')}
              </AppText>
              {nv.lastDawn !== null && nv.lastDawn.died.length > 0 && (
                <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                  {L(`Mort·e·s cette nuit : ${nv.lastDawn.died.map(nick).join(', ')}`,
                    `Died last night: ${nv.lastDawn.died.map(nick).join(', ')}`)}
                </AppText>
              )}
            </View>
            {nv.seerLog !== null && nv.seerLog.length > 0 && (
              <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: tokens.radii.lg, padding: tokens.spacing.md }}>
                <AppText role="caption" color="textSecondary" style={{ textAlign: 'center' }}>
                  {L('🔮 Tes visions (toi seule les vois) :', '🔮 Your visions (only you see these):')}
                </AppText>
                {nv.seerLog.map((e) => (
                  <AppText key={`${e.round}-${e.target}`} role="caption" style={{ textAlign: 'center' }}>
                    {L(`Nuit ${e.round + 1} : ${nick(e.target)} ${e.isWolf ? 'est un LOUP 🐺' : 'est clean 🕊️'}`,
                      `Night ${e.round + 1}: ${nick(e.target)} ${e.isWolf ? 'is a WOLF 🐺' : 'is clean 🕊️'}`)}
                  </AppText>
                ))}
              </View>
            )}
            <ProgressChips flags={nv.ready} ids={aliveIds} players={state.players} />
            <PrimaryButton
              label={nv.myReady ? L('Prêt ✓ — on attend les autres', 'Ready ✓ — waiting for the others') : L('Prêt à voter', 'Ready to vote')}
              onPress={() => sendAction({ kind: 'readyToVote' })}
              disabled={nv.myReady || !nv.iAmAlive}
            />
          </View>
        )}

        {nv.phase === 'vote' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <AppText role="titleL" style={{ textAlign: 'center' }}>{L('Le village vote 🗳️', 'The village votes 🗳️')}</AppText>
            <AppText role="label" color="textSecondary" style={{ textAlign: 'center' }}>
              {!nv.iAmAlive
                ? L('LES VIVANTS DÉCIDENT…', 'THE LIVING DECIDE…')
                : nv.myVote === null
                  ? L('TAPE QUI TU VEUX ÉLIMINER', 'TAP WHO YOU WANT OUT')
                  : L('VOTE VERROUILLÉ — ON ATTEND LES AUTRES', 'VOTE LOCKED — WAITING FOR THE OTHERS')}
            </AppText>
            {nv.iAmAlive && aliveSeats.filter((s) => s.id !== me).map((s) => (
              <VoteCard
                key={s.id} player={player(s.id)} selected={nv.myVote === s.id} voted={nv.hasVoted[s.id] === true}
                disabled={nv.myVote !== null} onPress={() => sendAction({ kind: 'vote', target: s.id })}
              />
            ))}
            {!nv.iAmAlive && <ProgressChips flags={nv.hasVoted} ids={aliveIds} players={state.players} />}
            <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
              {L('Égalité = personne ne meurt. Choisissez bien.', 'A tie means nobody dies. Choose well.')}
            </AppText>
          </View>
        )}

        {nv.phase === 'lynchReveal' && (
          <View style={{ gap: tokens.spacing.lg }}>
            <View style={{ backgroundColor: nv.lastLynch.evicted !== null ? theme.dare : theme.surfaceAlt, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg }}>
              <AppText role="titleL" style={{ textAlign: 'center', color: nv.lastLynch.evicted !== null ? '#FFFFFF' : undefined }}>
                {nv.lastLynch.evicted !== null
                  ? L(`${nick(nv.lastLynch.evicted)} est éliminé·e !`, `${nick(nv.lastLynch.evicted)} is out!`)
                  : L('Égalité — personne n’est éliminé.', 'A tie — nobody is eliminated.')}
              </AppText>
              {nv.lastLynch.revealedRole !== null && (
                <AppText role="titleM" style={{ textAlign: 'center', color: '#FFFFFF' }}>
                  {roleLabel(nv.lastLynch.revealedRole)}
                </AppText>
              )}
            </View>
            <Narration text={nv.narration} names={nv.lastLynch.evicted !== null ? [nick(nv.lastLynch.evicted)] : []} lang={lang} />
            {Object.entries(nv.lastLynch.tally).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
              <View key={id} style={{
                flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                borderRadius: tokens.radii.lg, padding: tokens.spacing.md, ...tokens.elevation.e1,
              }}>
                <Avatar name={nick(id)} size="sm" />
                <AppText role="bodyStrong" style={{ flex: 1 }}>{nick(id)}</AppText>
                <AppText role="headline" color="brand">{n}</AppText>
              </View>
            ))}
            {nv.lastLynch.abstained.length > 0 && (
              <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                {L(`N'ont pas voté : ${nv.lastLynch.abstained.map(nick).join(', ')}`,
                  `Did not vote: ${nv.lastLynch.abstained.map(nick).join(', ')}`)}
              </AppText>
            )}
          </View>
        )}

        {nv.phase === 'over' && (() => {
          const wolvesWon = nv.winners === 'wolves';
          return (
            <View style={{ gap: tokens.spacing.lg }}>
              <View style={{ backgroundColor: wolvesWon ? theme.dare : theme.truth, borderRadius: tokens.radii.xl, padding: tokens.spacing.lg }}>
                <AppText role="titleL" style={{ textAlign: 'center', color: '#FFFFFF' }}>
                  {wolvesWon ? L('🐺 Les loups gagnent !', '🐺 The wolves win!') : L('🏡 Le village gagne !', '🏡 The village wins!')}
                </AppText>
                <AppText role="caption" style={{ textAlign: 'center', color: '#FFFFFF' }}>
                  {nv.endReason === 'roomCollapsed'
                    ? L('Trop de départs — partie interrompue.', 'Too many players left — match cut short.')
                    : nv.endReason === 'maxRounds'
                      ? L('Limite de nuits atteinte.', 'Night limit reached.')
                      : ''}
                </AppText>
              </View>
              <Narration text={nv.narration} names={[]} lang={lang} />
              <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
                {L('LES RÔLES RÉVÉLÉS', 'ALL ROLES REVEALED')}
              </AppText>
              {nv.seats.map((s) => {
                const role = nv.finalRoles[s.id];
                return (
                  <View key={s.id} style={{
                    flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                    borderRadius: tokens.radii.lg, padding: tokens.spacing.md, opacity: s.alive ? 1 : 0.6,
                    borderWidth: role === 'wolf' ? 3 : 0, borderColor: theme.dare, ...tokens.elevation.e1,
                  }}>
                    <Avatar name={nick(s.id)} size="sm" />
                    <AppText role="bodyStrong" style={{ flex: 1 }}>{nick(s.id)}{s.alive ? '' : ' 💀'}</AppText>
                    <AppText role="label">{role !== undefined ? roleLabel(role) : '—'}</AppText>
                    <AppText role="headline" color="xp">{nv.scores[s.id] ?? 0} pts</AppText>
                  </View>
                );
              })}
              {ranked(nv.scores)[0] !== undefined && (
                <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                  {L(`👑 ${nick(ranked(nv.scores)[0]![0])} finit en tête`, `👑 ${nick(ranked(nv.scores)[0]![0])} tops the board`)}
                </AppText>
              )}

              {/* CC-5 match epilogue — cosmetic superlative stickers (town MVP / best
                  seers / cleanest wolf / longest survivor). Empty-state gated: each
                  row only appears when the underlying field is populated. */}
              {(() => {
                const ep = nv.epilogue;
                const survivors = ranked(ep.survivedTo).filter(([, n]) => n > 0);
                const longest = survivors[0];
                const sups: EpilogueSuperlative[] = [];
                if (ep.townMvp !== null) {
                  sups.push({
                    key: 'mvp', icon: '🏆', tone: 'win',
                    label: L('MEILLEUR·E DU VILLAGE', 'TOWN MVP'),
                    names: nick(ep.townMvp),
                    detail: L(`A démasqué ${ep.bestReadAccuracy} loup·s`, `Clocked ${ep.bestReadAccuracy} wolf${ep.bestReadAccuracy > 1 ? 's' : ''}`),
                  });
                } else if (ep.bestSeers.length > 1 && ep.bestReadAccuracy > 0) {
                  // No sole MVP, but a contested top read — celebrate the tie.
                  sups.push({
                    key: 'seers', icon: '🔮', tone: 'neutral',
                    label: L('MEILLEURES LECTURES', 'BEST SEERS'),
                    names: ep.bestSeers.map(nick).join(' · '),
                    detail: L(`${ep.bestReadAccuracy} loup·s chacun·e`, `${ep.bestReadAccuracy} wolf${ep.bestReadAccuracy > 1 ? 's' : ''} each`),
                  });
                }
                if (ep.cleanestWolf !== null) {
                  sups.push({
                    key: 'wolf', icon: '🐺', tone: 'spice',
                    label: L('LOUP INSAISISSABLE', 'CLEANEST WOLF'),
                    names: nick(ep.cleanestWolf),
                    detail: L('A survécu le plus longtemps sans se faire repérer', 'Survived longest undetected'),
                  });
                }
                if (longest !== undefined) {
                  sups.push({
                    key: 'survivor', icon: '🌙', tone: 'neutral',
                    label: L('A TENU LE PLUS LONGTEMPS', 'LASTED THE LONGEST'),
                    names: nick(longest[0]),
                    detail: L(`${longest[1] + 1} nuit·s traversée·s`, `${longest[1] + 1} night${longest[1] + 1 > 1 ? 's' : ''} survived`),
                  });
                }
                if (sups.length === 0) return null;
                return (
                  <View style={{ gap: tokens.spacing.md }}>
                    <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
                      {L('🎬 LE PALMARÈS', '🎬 THE EPILOGUE')}
                    </AppText>
                    {sups.map(({ key, ...s }) => <SuperlativeRow key={key} {...s} />)}
                  </View>
                );
              })()}

              {/* CC-1 Night Read reveal — cosmetic accuracy, never folded into placement scores. */}
              {(() => {
                const acc = nv.nightReadAccuracy ?? {};
                const readers = ranked(acc).filter(([, n]) => n > 0);
                if (readers.length === 0) return null;
                return (
                  <View style={{ gap: tokens.spacing.md }}>
                    <AppText role="overline" color="textSecondary" style={{ textAlign: 'center' }}>
                      {L('🔍 LECTURES DE NUIT — JUSTESSE', '🔍 NIGHT READS — ACCURACY')}
                    </AppText>
                    {readers.map(([id, n]) => (
                      <View key={id} style={{
                        flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, backgroundColor: theme.surface,
                        borderRadius: tokens.radii.lg, padding: tokens.spacing.md, ...tokens.elevation.e1,
                      }}>
                        <Avatar name={nick(id)} size="sm" />
                        <AppText role="bodyStrong" style={{ flex: 1 }}>{nick(id)}</AppText>
                        <AppText role="headline" color="brand">
                          {L(`${n} loup·s démasqué·s 🐺`, `${n} wolf${n > 1 ? 's' : ''} spotted 🐺`)}
                        </AppText>
                      </View>
                    ))}
                    <AppText role="caption" color="textMuted" style={{ textAlign: 'center' }}>
                      {L(`🕵️ Meilleur flair : ${nick(readers[0]![0])}`, `🕵️ Sharpest read: ${nick(readers[0]![0])}`)}
                    </AppText>
                  </View>
                );
              })()}

              <PrimaryButton label={L('Retour au salon', 'Back to Lobby')} onPress={() => router.replace(`/room/${code}/lobby`)} />
            </View>
          );
        })()}

        {nv.phase !== 'over' && (
          <SecondaryButton label={L('Quitter la partie', 'Leave Game')} onPress={() => { leave(); router.replace('/'); }} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
