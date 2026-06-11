/*
 * /kit/jules — the LIVE example sponsor page.
 *
 * This is the real product a brand receives: not the Backed marketing pitch, but
 * Jules' own sponsor-ready page. Same design system (carbon + volt + Archivo +
 * JetBrains Mono telemetry), its own world. Engineer's-budget data-sheets, a
 * sponsor-package ladder, and a single way to say yes.
 */

import { Button } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Section";
import { Stat } from "@/components/ui/Stat";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { LogoMark } from "@/components/icons/Logo";
import { KitContactForm } from "@/components/sections/KitContactForm";
import { kit } from "@/lib/content";
import { cn } from "@/lib/utils";

const { athlete, hero, stats, goal, audience, story, packages, contact, disclaimer, poweredBy } = kit;

export const metadata = {
  title: "Jules Pirzadeh — sponsor a driver",
  description: kit.hero.sub,
};

export default function JulesKitPage() {
  return (
    <div className="min-h-screen bg-paper">
      <KitHeader />
      <main id="main">
        <Hero />
        <StatsBar />
        <Goal />
        <Audience />
        <Story />
        <Packages />
        <Contact />
      </main>
      <KitFooter />
    </div>
  );
}

/* ───────────────────────── header ───────────────────────── */

function KitHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-paper/85 backdrop-blur-md">
      <Container className="flex items-center justify-between gap-4 py-3.5">
        <div className="flex items-center gap-3.5 sm:gap-4">
          <span className="font-mono text-h3 font-medium tabular leading-none text-accent">
            #{athlete.number}
          </span>
          <span aria-hidden className="h-7 w-px bg-border" />
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-small font-bold leading-none tracking-tight text-ink">
              {athlete.name}
            </span>
            <span className="font-mono text-caption uppercase tracking-[0.14em] text-mute">
              {athlete.discipline} · {athlete.region}
            </span>
          </div>
        </div>
        <a
          href={poweredBy.href}
          aria-label={poweredBy.label}
          className="group inline-flex items-center gap-2 font-mono text-caption uppercase tracking-[0.14em] text-mute transition-colors hover:text-ink"
        >
          <LogoMark className="h-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-0.5" />
          <span className="hidden sm:inline">{poweredBy.label}</span>
        </a>
      </Container>
    </header>
  );
}

/* ───────────────────────── hero ───────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-16 md:pb-24 md:pt-24">
      <div
        aria-hidden
        className="gridlines pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(120%_80%_at_70%_0%,#000_25%,transparent_72%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-[-20%] h-[460px] w-[680px] max-w-[120vw] rounded-full bg-accent/10 blur-[130px]"
      />

      {/* oversized graphic race number — the signature accent */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-6 select-none font-mono font-extrabold leading-none tracking-tighter text-ink/[0.04] text-[22vw] sm:right-8 sm:text-[20vw] md:text-[18vw] lg:text-[18rem]"
      >
        {athlete.number}
      </span>

      <Container className="relative">
        <div className="flex max-w-[60ch] flex-col items-start gap-7">
          <Reveal>
            <TelemetryLabel>{athlete.eyebrow}</TelemetryLabel>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="max-w-[18ch] text-balance font-display text-display-lg leading-[0.92] tracking-[-0.035em] text-ink md:text-display-xl">
              {hero.headline}
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="max-w-[46ch] text-balance font-display text-h2 font-medium text-ink-dim">
              {hero.sub}
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="flex flex-col items-start gap-4 pt-2 sm:flex-row sm:items-center">
              <Button href={hero.primaryCta.href}>{hero.primaryCta.label}</Button>
              <Button href={hero.secondaryCta.href} variant="secondary" arrow={false}>
                {hero.secondaryCta.label}
              </Button>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ───────────────────────── stats readout ───────────────────────── */

function StatsBar() {
  return (
    <section aria-label="Season telemetry" className="border-y border-border bg-paper-2">
      <Container>
        <Stagger className="grid grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <StaggerItem
              key={s.label}
              className={cn(
                "flex flex-col gap-2 border-border py-8 sm:py-10",
                // hairline grid between readouts
                i % 2 === 0 ? "pr-6" : "border-l pl-6",
                i < 2 ? "border-b lg:border-b-0" : "",
                "lg:border-l lg:pl-6 lg:pr-0 lg:first:border-l-0",
              )}
            >
              <span className="font-mono text-caption uppercase tracking-[0.16em] text-mute">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Stat value={s.value} label={s.label} valueClassName="text-display md:text-display-lg" />
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}

/* ───────────────────────── goal — engineer's budget sheet ───────────────────────── */

function Goal() {
  return (
    <Section id="goal" className="border-b border-border">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1fr] lg:gap-16">
          <div className="flex flex-col gap-6">
            <Reveal>
              <TelemetryLabel index="01">{goal.eyebrow}</TelemetryLabel>
            </Reveal>
            <Reveal delay={0.06}>
              <h2 className="max-w-[14ch] text-balance font-display text-display text-ink md:text-display-lg">
                {goal.headline}
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="max-w-[42ch] text-body text-ink-dim">{goal.body}</p>
            </Reveal>
          </div>

          {/* the datasheet */}
          <Reveal delay={0.1}>
            <figure className="rounded-md border border-border bg-surface/60">
              <figcaption className="flex items-center justify-between border-b border-border px-5 py-3 sm:px-6">
                <span className="telemetry">SEASON BUDGET · 2026</span>
                <span className="font-mono text-caption uppercase tracking-[0.14em] text-mute">EUR</span>
              </figcaption>
              <dl className="px-5 sm:px-6">
                {goal.breakdown.map((row, i) => (
                  <div
                    key={row.k}
                    className="flex items-baseline justify-between gap-4 border-b border-border/70 py-4"
                  >
                    <dt className="flex items-baseline gap-3 text-small text-ink-dim">
                      <span className="font-mono text-caption text-mute">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {row.k}
                    </dt>
                    <dd className="font-mono text-body tabular text-ink">{row.v}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4 py-5">
                  <dt className="telemetry text-ink-dim">{goal.total.k}</dt>
                  <dd className="font-mono text-h1 font-medium tabular leading-none text-accent">
                    {goal.total.v}
                  </dd>
                </div>
              </dl>
            </figure>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/* ───────────────────────── audience — what a brand gets ───────────────────────── */

function Audience() {
  return (
    <Section id="audience" className="border-b border-border">
      <Container>
        <div className="flex max-w-[56ch] flex-col gap-6">
          <Reveal>
            <TelemetryLabel index="02">{audience.eyebrow}</TelemetryLabel>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="max-w-[16ch] text-balance font-display text-display text-ink md:text-display-lg">
              {audience.headline}
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="text-body text-ink-dim">{audience.body}</p>
          </Reveal>
        </div>

        <Stagger className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {audience.stats.map((s, i) => (
            <StaggerItem
              key={s.label}
              className="flex flex-col justify-between gap-8 bg-surface px-5 py-7 sm:px-6"
            >
              <span className="font-mono text-caption uppercase tracking-[0.16em] text-mute">
                R{String(i + 1).padStart(2, "0")}
              </span>
              <Stat value={s.value} label={s.label} valueClassName="text-display" />
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}

/* ───────────────────────── story — editorial prose ───────────────────────── */

function Story() {
  return (
    <Section id="story" className="border-b border-border">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[0.5fr_1fr] lg:gap-16">
          <div className="flex flex-col gap-6">
            <Reveal>
              <TelemetryLabel index="03">{story.eyebrow}</TelemetryLabel>
            </Reveal>
            <Reveal delay={0.06}>
              <h2 className="text-balance font-display text-display text-ink md:text-display-lg">
                {story.headline}
              </h2>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="max-w-[60ch] border-l border-border pl-6 sm:pl-8">
              {story.paragraphs.map((p, i) => (
                <p
                  key={i}
                  className={cn(
                    "text-ink-dim",
                    i === 0
                      ? "font-display text-h2 font-medium leading-snug text-ink [&::first-letter]:text-accent"
                      : "mt-6 text-body",
                  )}
                >
                  {p}
                </p>
              ))}
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/* ───────────────────────── packages — sponsor ladder ───────────────────────── */

function Packages() {
  return (
    <Section id="packages" className="border-b border-border">
      <Container>
        <div className="flex max-w-[40ch] flex-col gap-6">
          <Reveal>
            <TelemetryLabel index="04">{packages.eyebrow}</TelemetryLabel>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="text-balance font-display text-display text-ink md:text-display-lg">
              {packages.headline}
            </h2>
          </Reveal>
        </div>

        <Stagger
          gap={0.11}
          className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-3"
        >
          {packages.tiers.map((tier, i) => (
            <StaggerItem key={tier.name} className="h-full">
              <article
                className={cn(
                  "flex h-full flex-col gap-7 bg-surface p-6 sm:p-7",
                  tier.featured && "relative z-10 bg-accent/[0.04] ring-1 ring-inset ring-accent",
                )}
              >
                <header className="flex items-start justify-between gap-3 border-b border-border pb-5">
                  <div className="flex flex-col gap-3">
                    <span className="font-mono text-caption uppercase tracking-[0.16em] text-mute">
                      TIER {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display text-h1 font-bold tracking-tight text-ink">
                      {tier.name}
                    </h3>
                  </div>
                  {tier.featured && (
                    <span aria-hidden className="mt-2 h-2 w-2 shrink-0 bg-accent" />
                  )}
                </header>

                <p className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "font-mono text-display-lg font-medium leading-none tabular tracking-tight",
                      tier.featured ? "text-accent" : "text-ink",
                    )}
                  >
                    {tier.price}
                  </span>
                  {tier.note && (
                    <span className="font-mono text-caption uppercase tracking-[0.14em] text-mute">
                      / {tier.note}
                    </span>
                  )}
                </p>

                <ul className="flex flex-1 flex-col gap-3.5">
                  {tier.lines.map((line, j) => (
                    <li
                      key={line}
                      className="flex items-start gap-3 border-b border-border/50 pb-3.5 text-small text-ink-dim last:border-0 last:pb-0"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-px font-mono text-caption tabular",
                          tier.featured ? "text-accent" : "text-mute",
                        )}
                      >
                        {String(j + 1).padStart(2, "0")}
                      </span>
                      <span className="text-ink">{line}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  href="#contact"
                  variant={tier.featured ? "primary" : "secondary"}
                  className="w-full"
                >
                  Choose {tier.name}
                </Button>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}

/* ───────────────────────── contact ───────────────────────── */

function Contact() {
  return (
    <Section id="contact" className="border-b border-border">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div className="flex flex-col gap-6">
            <Reveal>
              <TelemetryLabel index="05">{contact.eyebrow}</TelemetryLabel>
            </Reveal>
            <Reveal delay={0.06}>
              <h2 className="max-w-[14ch] text-balance font-display text-display text-ink md:text-display-lg">
                {contact.headline}
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="max-w-[40ch] text-body text-ink-dim">{contact.body}</p>
            </Reveal>
            <Reveal delay={0.18}>
              <div className="mt-2 inline-flex items-center gap-3 font-mono text-caption uppercase tracking-[0.14em] text-mute">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                Driver {athlete.name} · #{athlete.number} · open to partners
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <KitContactForm />
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/* ───────────────────────── footer ───────────────────────── */

function KitFooter() {
  return (
    <footer className="bg-paper-2">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[60ch] text-small text-mute">{disclaimer}</p>
        <a
          href={poweredBy.href}
          className="group inline-flex shrink-0 items-center gap-2 font-mono text-caption uppercase tracking-[0.14em] text-mute transition-colors hover:text-ink"
        >
          <LogoMark className="h-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-0.5" />
          {poweredBy.label}
        </a>
      </Container>
    </footer>
  );
}
