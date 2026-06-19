import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useT } from "../i18n";
import type { Phrase } from "../i18n";
import { colors, radius, shadow } from "../theme";

/**
 * First-run interactive coach-mark tour (D-tour). A tab-aware spotlight that
 * walks a new racer through the core loop (car → track → setup → run →
 * analysis) so they understand how RaceLab makes them faster.
 *
 * Design contract — ROBUST ABOVE ALL: the tour must NEVER trap the user.
 *   - Skip is reachable at every step.
 *   - If a target rect hasn't been measured yet, the bubble shows centered
 *     with the copy — we never block on a missing measurement.
 *   - Tapping the dim scrim does nothing destructive; only the explicit
 *     Next / Skip / Got it buttons move or end the tour.
 *   - Ending (finish OR skip) always lands the user on the Garage tab and
 *     persists a flag so the tour shows exactly once.
 */

export const TOUR_DONE_KEY = "racelab:tour:v1:done";

/** The five MVP tabs the tour can drive to. Kept loose (string) so App owns the
 *  authoritative Tab union; the tour only needs to name them. */
export type TourTab = "garage" | "sheet" | "tracks" | "runs" | "engineer";

export interface TourStep {
  /** id of a registered target to spotlight; omitted → centered modal. */
  targetId?: string;
  /** tab to switch to as this step shows (so the spotlight lands right). */
  tab?: TourTab;
  title: Phrase;
  body: Phrase;
}

/** A measured on-screen rectangle (window coordinates). */
export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TourContextValue {
  /** register/update a target's rect, keyed by id (call from onLayout/measure). */
  setTarget: (id: string, rect: TargetRect | null) => void;
  /** the active step's targetId, so targets can re-measure when spotlighted. */
  activeTargetId: string | undefined;
  active: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

/* ------------------------------------------------------------------ steps -- */

/** The loop, in order. Welcome (0) and Finale (6) are centered modals. */
export const TOUR_STEPS: TourStep[] = [
  {
    title: { en: "Welcome to RaceLab 🏁", fr: "Bienvenue sur RaceLab 🏁" },
    body: {
      en: "A 60-second tour of how it gets you faster?",
      fr: "Un tour de 60 secondes pour voir comment ça te rend plus rapide ?",
    },
  },
  {
    tab: "garage",
    targetId: "add-car",
    title: { en: "Add your car", fr: "Ajoute ta voiture" },
    body: {
      en: "Start with your car — it tailors the setup sheet to your exact chassis and class.",
      fr: "Commence par ta voiture — elle adapte la fiche de réglages à ton châssis et ta catégorie exacts.",
    },
  },
  {
    tab: "tracks",
    targetId: "tab-tracks",
    title: { en: "Your track", fr: "Ta piste" },
    body: {
      en: "Add the track you're running. Surface, grip and conditions are exactly what the engineer reasons about.",
      fr: "Ajoute la piste où tu roules. Surface, grip et conditions sont exactement ce sur quoi l’ingénieur raisonne.",
    },
  },
  {
    tab: "sheet",
    targetId: "tab-sheet",
    title: { en: "Your setup", fr: "Tes réglages" },
    body: {
      en: "Your setup sheet — every setting, in immutable versions, so you always know precisely what changed.",
      fr: "Ta fiche de réglages — chaque réglage, en versions figées, pour toujours savoir précisément ce qui a changé.",
    },
  },
  {
    tab: "runs",
    targetId: "tab-runs",
    title: { en: "Log a run", fr: "Enregistre une session" },
    body: {
      en: "After a heat, log a run in seconds: the setup, the conditions, and how it felt (e.g. 'understeer on entry').",
      fr: "Après une manche, enregistre une session en quelques secondes : les réglages, les conditions, et le ressenti (ex. « sous-virage à l’entrée »).",
    },
  },
  {
    tab: "engineer",
    targetId: "tab-engineer",
    title: { en: "Get the analysis", fr: "Reçois l’analyse" },
    body: {
      en: "The payoff: one grounded setup change to try, the why, and what to expect — your race engineer in your pocket.",
      fr: "La récompense : un changement de réglage fondé à essayer, le pourquoi, et ce à quoi t’attendre — ton ingénieur de course dans la poche.",
    },
  },
  {
    title: { en: "That's the loop 🏁", fr: "Voilà la boucle 🏁" },
    body: {
      en: "Every run you log makes the next one faster. Now add your first car.",
      fr: "Chaque session enregistrée rend la suivante plus rapide. Ajoute ta première voiture.",
    },
  },
];

export const TOUR_STEP_COUNT = TOUR_STEPS.length;

/* --------------------------------------------------------------- provider -- */

interface TourProviderProps {
  /** current step index, or null when the tour is inactive. App owns this. */
  step: number | null;
  /** advance/skip; App reacts (switches tab, persists flag, lands on garage). */
  onNext: () => void;
  onSkip: () => void;
  children: React.ReactNode;
}

/**
 * Provider owns the registry of measured target rects. The active step index
 * is driven from App (which also owns the active tab), so the tour and the
 * visible screen never disagree about which tab is showing.
 */
export function TourProvider({ step, onNext, onSkip, children }: TourProviderProps) {
  const rectsRef = useRef<Map<string, TargetRect>>(new Map());
  // bump to force the overlay to re-read rects when a measurement lands
  const [, forceRender] = useState(0);

  const setTarget = useCallback((id: string, rect: TargetRect | null) => {
    const map = rectsRef.current;
    if (rect === null) {
      if (map.delete(id)) forceRender((n) => n + 1);
      return;
    }
    const prev = map.get(id);
    if (
      prev &&
      prev.x === rect.x &&
      prev.y === rect.y &&
      prev.width === rect.width &&
      prev.height === rect.height
    ) {
      return; // no change — avoid a render storm from repeated onLayout
    }
    map.set(id, rect);
    forceRender((n) => n + 1);
  }, []);

  const active = step !== null;
  const activeStep = active ? TOUR_STEPS[step] : undefined;
  const activeTargetId = activeStep?.targetId;

  const ctx = useMemo<TourContextValue>(
    () => ({ setTarget, activeTargetId, active }),
    [setTarget, activeTargetId, active],
  );

  return (
    <TourContext.Provider value={ctx}>
      {children}
      {active && step !== null && (
        <TourOverlay
          stepIndex={step}
          rect={activeTargetId ? rectsRef.current.get(activeTargetId) : undefined}
          onNext={onNext}
          onSkip={onSkip}
        />
      )}
    </TourContext.Provider>
  );
}

/* ------------------------------------------------------------------- hook -- */

/**
 * Register an element as a tour target. Spread the returned props onto the
 * element (a View/Pressable). It measures itself on layout and re-measures
 * when it becomes the active spotlight (after a tab switch the element may
 * have just mounted, so its first onLayout is the real one).
 *
 * Returns `{ ref, onLayout }` — both must be applied for a reliable rect.
 */
export function useTourTarget(id: string) {
  const ctx = useContext(TourContext);
  const ref = useRef<View | null>(null);

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node || !ctx) return;
    node.measureInWindow((x, y, width, height) => {
      // measureInWindow can yield 0/NaN before layout — ignore those
      if (
        width > 0 &&
        height > 0 &&
        Number.isFinite(x) &&
        Number.isFinite(y)
      ) {
        ctx.setTarget(id, { x, y, width, height });
      }
    });
  }, [ctx, id]);

  const onLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      // measureInWindow needs a committed layout; defer a tick so the window
      // coords are final (onLayout fires with local coords only).
      requestAnimationFrame(measure);
    },
    [measure],
  );

  // Re-measure when this target becomes the active spotlight. After a tab/screen
  // switch the element may have just mounted, so its first rect can be stale or
  // pre-layout (this caused the ring to frame the element ABOVE the real target).
  // Belt-and-suspenders: measure on the next frame AND again after a short delay,
  // once layout has settled. setTarget ignores no-op rects, so the extra pass is
  // free when nothing moved and corrects the rect when it did.
  useEffect(() => {
    if (ctx?.active && ctx.activeTargetId === id) {
      const h = requestAnimationFrame(measure);
      const t = setTimeout(measure, 120);
      return () => {
        cancelAnimationFrame(h);
        clearTimeout(t);
      };
    }
    return undefined;
  }, [ctx?.active, ctx?.activeTargetId, id, measure]);

  return { ref, onLayout };
}

/* ---------------------------------------------------------------- overlay -- */

const RING_PAD = 10; // generous breathing room: pads the measured rect by ~10px
//                      on each side so minor measurement offsets still look
//                      intentional (the ring frames the whole region, not a
//                      pixel-exact box). Robustness over pixel-precision.
const BUBBLE_MARGIN = 16; // min gap from screen edges
const BUBBLE_MAX_WIDTH = 340;

function TourOverlay({
  stepIndex,
  rect,
  onNext,
  onSkip,
}: {
  stepIndex: number;
  rect: TargetRect | undefined;
  onNext: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const step = TOUR_STEPS[stepIndex];
  const { width: screenW, height: screenH } = Dimensions.get("window");
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEP_COUNT - 1;

  // measured bubble height → so we can place it fully on-screen relative to target
  const [bubbleH, setBubbleH] = useState(0);
  const onBubbleLayout = useCallback((e: LayoutChangeEvent) => {
    setBubbleH(e.nativeEvent.layout.height);
  }, []);

  // a usable ring needs a measured rect that actually sits on screen
  const r =
    rect !== undefined &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.y < screenH &&
    rect.y + rect.height > 0
      ? rect
      : null;

  const ring = r
    ? {
        left: Math.max(0, r.x - RING_PAD),
        top: Math.max(0, r.y - RING_PAD),
        width: r.width + RING_PAD * 2,
        height: r.height + RING_PAD * 2,
      }
    : null;

  // bubble placement: centered when no ring; otherwise the bubble must NEVER
  // cover the target. Target in the top ~55% of the screen → bubble BELOW the
  // ring; target in the bottom ~45% (e.g. the tab bar) → bubble ABOVE it.
  // Then clamp into the safe band so it always stays fully on-screen.
  const bubbleWidth = Math.min(BUBBLE_MAX_WIDTH, screenW - BUBBLE_MARGIN * 2);
  let bubbleTop = 0; // ignored when centered (centered uses justifyContent)
  let bubbleLeft = Math.max(BUBBLE_MARGIN, screenW / 2 - bubbleWidth / 2);
  const centered = r === null || ring === null;
  if (r && ring) {
    const targetCenterY = r.y + r.height / 2;
    const placeAbove = targetCenterY > screenH * 0.55;
    const estH = bubbleH || 180;
    bubbleTop = placeAbove ? ring.top - estH - 14 : ring.top + ring.height + 14;
    // clamp vertically into the safe band
    bubbleTop = Math.max(
      BUBBLE_MARGIN,
      Math.min(bubbleTop, screenH - estH - BUBBLE_MARGIN),
    );
    bubbleLeft = Math.max(
      BUBBLE_MARGIN,
      Math.min(
        r.x + r.width / 2 - bubbleWidth / 2,
        screenW - bubbleWidth - BUBBLE_MARGIN,
      ),
    );
  }

  const counter = t({
    en: `Step ${stepIndex + 1} of ${TOUR_STEP_COUNT}`,
    fr: `Étape ${stepIndex + 1} sur ${TOUR_STEP_COUNT}`,
  });
  const nextLabel = isFirst
    ? t({ en: "Start tour", fr: "Commencer" })
    : isLast
      ? t({ en: "Got it", fr: "Compris" })
      : t({ en: "Next", fr: "Suivant" });
  const skipLabel = t({ en: "Skip tour", fr: "Passer le tutoriel" });

  const bubble = (
    <View
      onLayout={onBubbleLayout}
      style={[styles.bubble, { width: bubbleWidth }]}
      accessibilityViewIsModal
    >
      <Text style={styles.counter}>{counter}</Text>
      <Text style={styles.title}>{t(step.title)}</Text>
      <Text style={styles.body}>{t(step.body)}</Text>
      <View style={styles.actions}>
        {!isLast && (
          <Pressable
            onPress={onSkip}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={skipLabel}
            style={styles.skipBtn}
          >
            <Text style={styles.skipText}>{skipLabel}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          style={[styles.nextBtn, isLast && styles.nextBtnWide]}
        >
          <Text style={styles.nextText}>{nextLabel}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    // Render in a transparent, status-bar-translucent Modal so the overlay lives
    // in TRUE full-window coordinates — the same space `measureInWindow` reports
    // in. The app's root container is padded down by StatusBar.currentHeight on
    // Android; rendering inline there would shift the overlay's origin below the
    // window top and mis-place the ring/bubble by exactly the status-bar height.
    // The Modal is immune to that parent padding (and guarantees top stacking).
    <Modal
      transparent
      statusBarTranslucent
      animationType="none"
      visible
      onRequestClose={onSkip}
    >
      <View style={styles.fill} pointerEvents="box-none">
        {/* Dim scrim. Tapping it is intentionally inert (no onPress) so the user
            can't accidentally dismiss/advance the tour — only explicit buttons do. */}
        <View style={styles.scrim} pointerEvents="auto" />

        {ring && (
          <View pointerEvents="none" style={[styles.ring, ring]} />
        )}

        {centered ? (
          <View style={styles.centeredWrap} pointerEvents="box-none">
            {bubble}
          </View>
        ) : (
          <View
            pointerEvents="box-none"
            style={[styles.anchoredWrap, { top: bubbleTop, left: bubbleLeft }]}
          >
            {bubble}
          </View>
        )}
      </View>
    </Modal>
  );
}

/* ----------------------------------------------------------- persistence -- */

/** Whether the one-time tour has already been shown. Safe (false) on error. */
export async function hasSeenTour(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(TOUR_DONE_KEY)) === "1";
  } catch {
    return false;
  }
}

/** Persist that the tour is done (called on finish OR skip). */
export async function markTourDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(TOUR_DONE_KEY, "1");
  } catch {
    // a failed write only means the tour may show again — never a crash
  }
}

/** Clear the flag so the tour replays (Settings → Replay tour). */
export async function resetTour(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOUR_DONE_KEY);
  } catch {
    // ignore
  }
}

const ABS_FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  fill: { ...ABS_FILL, zIndex: 50 },
  scrim: {
    ...ABS_FILL,
    backgroundColor: "rgba(11,12,14,0.82)",
  },
  ring: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  centeredWrap: {
    ...ABS_FILL,
    alignItems: "center",
    justifyContent: "center",
    padding: BUBBLE_MARGIN,
  },
  anchoredWrap: { position: "absolute" },
  bubble: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    ...shadow.pop,
  },
  counter: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  body: { color: colors.sub, fontSize: 14, lineHeight: 20 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    gap: 10,
  },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  skipText: { color: colors.sub, fontSize: 13, fontWeight: "700" },
  nextBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 22,
    alignItems: "center",
  },
  nextBtnWide: { flex: 1 },
  nextText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
});
