import { Section, Container } from "@/components/ui/Section";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/motion/Reveal";
import { closing } from "@/lib/content";

/**
 * THE ASK — the resolve / send-off. A tall, high-contrast finale that bookends
 * the Hero: same volt glow, same gridlines, same pulsing proof line. The
 * headline splits "talented but invisible" → "sponsor-ready", the page's
 * recurring conversion made literal one last time.
 */
export function Closing() {
  // closing.headline === "Raise your season."
  // Split on "season." so the campaign line lands in the accent.
  const ACCENT = "season.";
  const cut = closing.headline.lastIndexOf(ACCENT);
  const head = closing.headline.slice(0, cut);
  const tail = closing.headline.slice(cut + ACCENT.length);

  return (
    <Section
      id="closing"
      className="relative isolate min-h-[88svh] overflow-hidden bg-paper py-32 md:py-40"
    >
      {/* atmospheric gridlines — echo the Hero, masked to fade outward */}
      <div
        aria-hidden
        className="gridlines pointer-events-none absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(120%_85%_at_50%_45%,#000_25%,transparent_72%)]"
      />
      {/* volt glow behind the headline */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[860px] max-w-[130vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[140px]"
      />
      {/* top + bottom hairlines bracket the finale like a pit-wall readout */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-border" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-border" />

      <Container className="relative flex min-h-[inherit] flex-col items-start justify-center">
        <Reveal>
          <TelemetryLabel index="11">{closing.eyebrow}</TelemetryLabel>
        </Reveal>

        <Reveal delay={0.08} className="mt-8">
          <h2 className="max-w-[18ch] text-balance font-display text-display-lg leading-[0.9] tracking-[-0.04em] text-ink sm:text-display-xl">
            {head}
            <span className="text-accent">{ACCENT}</span>
            {tail}
          </h2>
        </Reveal>

        <Reveal delay={0.16} className="mt-8">
          <p className="max-w-[58ch] text-balance font-display text-h2 font-medium text-ink-dim">
            {closing.body}
          </p>
        </Reveal>

        <Reveal delay={0.24} className="mt-12">
          <div className="flex flex-col items-start gap-7">
            <Button href={closing.primaryCta.href} magnetic>
              {closing.primaryCta.label}
            </Button>

            <p className="flex items-center gap-3 font-mono text-caption uppercase tracking-[0.16em] text-mute">
              <span aria-hidden className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              {closing.proofLine}
            </p>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
