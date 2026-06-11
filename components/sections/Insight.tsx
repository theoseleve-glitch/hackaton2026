import { Fragment } from "react";
import { Section, Container } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Stat } from "@/components/ui/Stat";
import { Reveal } from "@/components/motion/Reveal";
import { insight } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * INSIGHT — the gut-punch. An oversized editorial manifesto:
 * massive headline → lead paragraph → an indented pull-quote with the
 * cause emphasised in volt-lime → a single connected delta-bar of readouts.
 * The pain, set in type the size of a pit-board.
 */
export function Insight() {
  return (
    <Section id="insight" className="bg-paper">
      {/* faint pit-board gridlines, masked to the right margin */}
      <div
        aria-hidden
        className="gridlines pointer-events-none absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(110%_80%_at_85%_15%,#000_0%,transparent_70%)]"
      />

      <Container className="relative">
        <SectionHeader
          index="01"
          eyebrow={insight.eyebrow}
          title={insight.headline}
          titleClassName="max-w-[14ch] text-display-lg sm:text-display-xl md:text-display-2xl leading-[0.86] tracking-[-0.045em]"
        />

        {/* lead paragraph — the diagnosis, tight measure */}
        <Reveal delay={0.1} className="mt-10 md:mt-12">
          <p className="max-w-[48ch] text-pretty text-body text-ink-dim">{insight.body}</p>
        </Reveal>

        {/* the pull-quote — oversized, indented, cause in volt-lime */}
        <Reveal delay={0.04} y={36} className="mt-16 md:mt-24">
          <blockquote className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute -left-1 -top-10 select-none font-display text-display-2xl leading-none text-border md:-left-4 md:-top-16"
            >
              &ldquo;
            </span>
            <span className="telemetry mb-5 block text-mute">DIAGNOSIS · ROOT CAUSE</span>
            <p className="max-w-[20ch] text-balance font-display text-h1 font-bold leading-[1.04] tracking-[-0.025em] text-ink sm:max-w-[24ch] sm:text-display md:text-display-lg">
              <Highlighted
                text={insight.keyline}
                emphasise={["lack of funding", "amateur sponsor pitches"]}
              />
            </p>
          </blockquote>
        </Reveal>

        {/* the delta-bar — three readouts on one hairline rail, not a card grid */}
        <Reveal delay={0.08} className="mt-16 md:mt-24">
          <DeltaBar />
        </Reveal>
      </Container>
    </Section>
  );
}

/**
 * The connected readout rail: three <Stat>s welded by vertical hairlines,
 * each capped with a mono index and an accent tick — a pit-wall delta bar.
 */
function DeltaBar() {
  return (
    <dl className="grid grid-cols-1 border-y border-border sm:grid-cols-3">
      {insight.stats.map((stat, i) => (
        <div
          key={stat.label}
          className={cn(
            "group relative flex flex-col gap-5 py-7 sm:py-9",
            // vertical hairlines weld the cells together on wider viewports
            i > 0 && "border-t border-border sm:border-l sm:border-t-0",
            // breathing room between welded cells without breaking the rail
            "sm:px-7 first:sm:pl-0 last:sm:pr-0",
          )}
        >
          {/* readout index + accent tick — the pit-board marker */}
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-2 w-2 shrink-0 bg-accent" />
            <span className="font-mono text-caption uppercase tracking-[0.16em] text-mute">
              {String(i + 1).padStart(2, "0")} / {String(insight.stats.length).padStart(2, "0")}
            </span>
          </div>

          <Stat
            value={stat.value}
            label={stat.label}
            valueClassName="text-display md:text-display-lg"
          />
        </div>
      ))}
    </dl>
  );
}

/**
 * Renders `text`, wrapping any verbatim phrase in `emphasise` with the
 * volt-lime accent. Phrases are matched in order; non-matched runs pass through.
 */
function Highlighted({ text, emphasise }: { text: string; emphasise: string[] }) {
  // Build an ordered list of [start, end] match ranges for the given phrases.
  const ranges = emphasise
    .map((phrase) => {
      const start = text.indexOf(phrase);
      return start === -1 ? null : { start, end: start + phrase.length };
    })
    .filter((r): r is { start: number; end: number } => r !== null)
    .sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, i) => {
    if (range.start > cursor) {
      nodes.push(<Fragment key={`t-${i}`}>{text.slice(cursor, range.start)}</Fragment>);
    }
    nodes.push(
      <span key={`e-${i}`} className="text-accent">
        {text.slice(range.start, range.end)}
      </span>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    nodes.push(<Fragment key="t-last">{text.slice(cursor)}</Fragment>);
  }

  return <>{nodes}</>;
}
