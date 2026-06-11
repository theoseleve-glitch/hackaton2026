import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, ImageBackground, Pressable, ScrollView, Text, View } from 'react-native';
import { GAME_CATALOG, type GameCard } from '../games/catalog';
import { deviceLang, pickL, type Lang } from '../i18n';
import { useTheme } from '../theme/useTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.78);
const CARD_MARGIN = Math.round((SCREEN_WIDTH - CARD_WIDTH) / 2);
const SNAP_INTERVAL = CARD_WIDTH + 12; // card width + gap between cards

const AUTO_ADVANCE_MS = 3_500;
const PAUSE_ON_SWIPE_MS = 10_000;

interface GameCarouselProps {
  onPlay: (id: string) => void;
  onSoon: (id: string) => void;
}

export function GameCarousel({ onPlay, onSoon }: GameCarouselProps) {
  const { theme, tokens } = useTheme();
  const lang = deviceLang();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const pauseUntilRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollTo = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SNAP_INTERVAL, animated: true });
  };

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      setActiveIndex((prev) => {
        const next = (prev + 1) % GAME_CATALOG.length;
        scrollTo(next);
        return next;
      });
    }, AUTO_ADVANCE_MS);

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  const handleScrollEnd = (offsetX: number) => {
    const idx = Math.round(offsetX / SNAP_INTERVAL);
    const clamped = Math.max(0, Math.min(idx, GAME_CATALOG.length - 1));
    setActiveIndex(clamped);
    // pause auto-advance for PAUSE_ON_SWIPE_MS after manual swipe
    pauseUntilRef.current = Date.now() + PAUSE_ON_SWIPE_MS;
  };

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={SNAP_INTERVAL}
        snapToAlignment="center"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: CARD_MARGIN, gap: 12 }}
        onMomentumScrollEnd={(e) => handleScrollEnd(e.nativeEvent.contentOffset.x)}
      >
        {GAME_CATALOG.map((card) => (
          <GameCardItem
            key={card.id}
            card={card}
            lang={lang}
            onPlay={onPlay}
            onSoon={onSoon}
          />
        ))}
      </ScrollView>

      {/* Page dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: tokens.spacing.md, flexWrap: 'wrap' }}>
        {GAME_CATALOG.map((card, i) => (
          <Pressable
            key={card.id}
            onPress={() => { setActiveIndex(i); scrollTo(i); pauseUntilRef.current = Date.now() + PAUSE_ON_SWIPE_MS; }}
            accessibilityLabel={`Go to ${pickL(card.name, lang)}`}
            hitSlop={8}
          >
            <View style={{
              width: i === activeIndex ? 20 : 6,
              height: 6,
              borderRadius: tokens.radii.pill,
              backgroundColor: i === activeIndex ? theme.brand : theme.border,
            }} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CardBadge({ badge, tokens }: { badge: GameCard['badge']; tokens: ReturnType<typeof useTheme>['tokens'] }) {
  return (
    <View style={{
      position: 'absolute',
      top: tokens.spacing.lg,
      right: tokens.spacing.lg,
      backgroundColor: badge === 'PLAY' ? '#6FD66B' : '#10142A',
      borderRadius: tokens.radii.pill,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.xs,
    }}>
      <Text style={{
        color: '#FFFFFF',
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '700',
        letterSpacing: 1.2,
      }}>
        {badge}
      </Text>
    </View>
  );
}

function GameCardItem({ card, lang, onPlay, onSoon }: {
  card: GameCard; lang: Lang; onPlay: (id: string) => void; onSoon: (id: string) => void;
}) {
  const { tokens } = useTheme();
  const isPlay = card.badge === 'PLAY';
  const name = pickL(card.name, lang);
  const thumb = card.video?.thumbnailUrl;

  const content = (
    <>
      <CardBadge badge={card.badge} tokens={tokens} />

      {thumb === undefined && (
        <Text style={{ fontSize: 56, lineHeight: 64, textAlign: 'center', marginBottom: tokens.spacing.sm }}>
          {card.emoji}
        </Text>
      )}

      <Text style={{
        color: '#FFFFFF',
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '800',
        textAlign: 'center',
      }}>
        {thumb !== undefined ? `${card.emoji} ${name}` : name}
      </Text>

      <Text style={{
        color: 'rgba(255,255,255,0.85)',
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '500',
        textAlign: 'center',
        marginTop: tokens.spacing.xs,
      }}>
        {pickL(card.tagline, lang)}
      </Text>

      {/* Creator credit — taps through to the original video, never embedded. */}
      {card.video !== undefined && (
        <Pressable
          onPress={() => { void Linking.openURL(card.video!.url); }}
          accessibilityLabel={`Inspired by ${card.video.creator} — opens the original`}
          hitSlop={8}
          style={{
            alignSelf: 'center',
            marginTop: tokens.spacing.sm,
            backgroundColor: 'rgba(15,22,51,0.55)',
            borderRadius: tokens.radii.pill,
            paddingHorizontal: tokens.spacing.md,
            paddingVertical: 3,
          }}>
          <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 11, lineHeight: 14, fontWeight: '600' }}>
            📺 {lang === 'fr' ? 'inspiré de' : 'inspired by'} {card.video.creator} ↗
          </Text>
        </Pressable>
      )}
    </>
  );

  const frame = {
    width: CARD_WIDTH,
    height: 200,
    borderRadius: tokens.radii.xl,
    overflow: 'hidden' as const,
  };
  const inner = {
    flex: 1,
    padding: tokens.spacing.xl,
    justifyContent: 'flex-end' as const,
  };

  return (
    <Pressable
      onPress={() => { isPlay ? onPlay(card.id) : onSoon(card.id); }}
      accessibilityLabel={`${name} — ${isPlay ? 'Play now' : 'Coming soon'}`}
      style={{ width: CARD_WIDTH }}
    >
      {thumb !== undefined ? (
        <ImageBackground source={{ uri: thumb }} style={[frame, { backgroundColor: card.color }]} resizeMode="cover">
          {/* ink veil for text legibility over the thumbnail */}
          <View style={[inner, { backgroundColor: 'rgba(15,22,51,0.45)' }]}>{content}</View>
        </ImageBackground>
      ) : (
        <View style={[frame, inner, { backgroundColor: card.color }]}>{content}</View>
      )}
    </Pressable>
  );
}
