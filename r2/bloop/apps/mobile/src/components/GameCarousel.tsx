import { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import { GAME_CATALOG, type GameCard } from '../games/catalog';
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
            onPlay={onPlay}
            onSoon={onSoon}
          />
        ))}
      </ScrollView>

      {/* Page dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: tokens.spacing.md }}>
        {GAME_CATALOG.map((card, i) => (
          <Pressable
            key={card.id}
            onPress={() => { setActiveIndex(i); scrollTo(i); pauseUntilRef.current = Date.now() + PAUSE_ON_SWIPE_MS; }}
            accessibilityLabel={`Go to ${card.name}`}
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

function GameCardItem({ card, onPlay, onSoon }: { card: GameCard; onPlay: (id: string) => void; onSoon: (id: string) => void }) {
  const { tokens } = useTheme();
  const isPlay = card.badge === 'PLAY';

  return (
    <Pressable
      onPress={() => { isPlay ? onPlay(card.id) : onSoon(card.id); }}
      accessibilityLabel={`${card.name} — ${isPlay ? 'Play now' : 'Coming soon'}`}
      style={{ width: CARD_WIDTH }}
    >
      <View style={{
        width: CARD_WIDTH,
        height: 200,
        borderRadius: tokens.radii.xl,
        backgroundColor: card.color,
        padding: tokens.spacing.xl,
        justifyContent: 'flex-end',
        overflow: 'hidden',
      }}>
        {/* Badge top-right */}
        <View style={{
          position: 'absolute',
          top: tokens.spacing.lg,
          right: tokens.spacing.lg,
          backgroundColor: isPlay ? '#6FD66B' : '#10142A',
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
            {card.badge}
          </Text>
        </View>

        {/* Big emoji */}
        <Text style={{ fontSize: 56, lineHeight: 64, textAlign: 'center', marginBottom: tokens.spacing.sm }}>
          {card.emoji}
        </Text>

        {/* Name */}
        <Text style={{
          color: '#FFFFFF',
          fontSize: 22,
          lineHeight: 28,
          fontWeight: '800',
          textAlign: 'center',
        }}>
          {card.name}
        </Text>

        {/* Tagline */}
        <Text style={{
          color: 'rgba(255,255,255,0.85)',
          fontSize: 14,
          lineHeight: 18,
          fontWeight: '500',
          textAlign: 'center',
          marginTop: tokens.spacing.xs,
        }}>
          {card.tagline}
        </Text>
      </View>
    </Pressable>
  );
}
