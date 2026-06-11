"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Section, Container } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";
import { economics } from "@/lib/content";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Year-one revenue math, laid out as a pit-wall data sheet. */
const ledger: { k: string; v: string; accent?: boolean }[] = [
  { k: "Pricing", v: economics.medium.pricing },
  { k: "Revenue / customer", v: economics.medium.revenuePerCustomer, accent: true },
  { k: "Cost / customer", v: economics.medium.costPerCustomer },
];

/** Three escalating throughput readouts — the scale story as live counters. */
const counters = [
  { to: 27.9, prefix: "€", suffix: "k", decimals: 1, label: economics.scale[0].label },
  { to: 279, prefix: "€", suffix: "k", decimals: 0, label: economics.scale[1].label },
  { to: 1.4, prefix: "€", suffix: "M", decimals: 1, label: economics.scale[2].label },
];

export function Economics() {
  return (
    <Section id="economics" className="overflow-hidden bg-paper-2">
      {/* war-room data grid */}
      <div
        aria-hidden
        className="gridlines pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(120%_80%_at_50%_30%,#000_20%,transparent_80%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-[-6%] h-[360px] w-[640px] max-w-[110vw] rounded-full bg-accent/[0.07] blur-[130px]"
      />

      <Container className="relative">
        <SectionHeader
          index="08"
          eyebrow={economics.eyebrow}
          title={
            <>
              The unit economics are <span className="text-accent">almost rude.</span>
            </>
          }
        />

        {/* TOP READOUT: the margin-now headline number as a hero gauge */}
        <div className="mt-14 grid gap-px overflow-hidden rounded-md border border-border bg-border md:mt-20 lg:grid-cols-[1.1fr_1fr]">
          {/* huge margin readout */}
          <Reveal className="bg-paper" y={32}>
            <article className="relative flex h-full flex-col justify-between gap-10 p-7 sm:p-10">
              <div className="flex items-center justify-between">
                <TelemetryLabel marker>MARGIN · NOW</TelemetryLabel>
                <span className="flex items-center gap-2 font-mono text-caption uppercase tracking-[0.14em] text-accent">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                  Live
                </span>
              </div>

              <div>
                <span className="block font-mono text-[clamp(2.75rem,14vw,6rem)] font-medium leading-[0.82] tracking-tight text-accent tabular sm:text-display-2xl">
                  {economics.marginNow.value}
                </span>
                <p className="mt-5 max-w-[28ch] text-small text-ink-dim">
                  {economics.marginNow.label}
                </p>
              </div>

              <p className="border-t border-border pt-6 text-small leading-relaxed text-ink-dim">
                {economics.cogsLine}
              </p>
            </article>
          </Reveal>

          {/* year-one ledger → the €279 conversion */}
          <Reveal className="bg-paper" delay={0.08} y={32}>
            <article className="flex h-full flex-col p-7 sm:p-10">
              <div className="mb-7 flex items-center justify-between">
                <TelemetryLabel marker={false}>YEAR-ONE MATH · MEDIUM TERM</TelemetryLabel>
                <span className="telemetry text-mute">EUR</span>
              </div>

              <dl className="flex flex-col">
                {ledger.map((row) => (
                  <div
                    key={row.k}
                    className="flex items-baseline justify-between gap-4 border-b border-border py-4 first:pt-0"
                  >
                    <dt className="font-mono text-caption uppercase tracking-[0.14em] text-mute">
                      {row.k}
                    </dt>
                    <dd
                      className={
                        row.accent
                          ? "text-right font-mono text-body font-medium tabular text-accent"
                          : "text-right font-mono text-body tabular text-ink"
                      }
                    >
                      {row.v}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* margin-at-scale, set apart as the bottom-line readout */}
              <div className="mt-auto flex items-end justify-between gap-6 pt-8">
                <div className="flex items-center gap-3 text-mute">
                  <ArrowRight aria-hidden strokeWidth={1.75} className="h-5 w-5 text-accent" />
                  <span className="max-w-[18ch] text-small text-ink-dim">
                    {economics.medium.marginScale.label}
                  </span>
                </div>
                <span className="font-mono text-display font-medium leading-none tracking-tight text-ink tabular">
                  {economics.medium.marginScale.value}
                </span>
              </div>
            </article>
          </Reveal>
        </div>

        {/* SCALE: three escalating counters as a throughput rail */}
        <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
          {counters.map((c, i) => (
            <Reveal key={c.label} className="bg-paper" delay={i * 0.1} y={28}>
              <figure className="group relative flex h-full flex-col gap-4 p-7 sm:p-8">
                {/* faint scaling rail marker */}
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full w-[2px] origin-top bg-accent/30"
                  style={{ height: `${[34, 64, 100][i]}%` }}
                />
                <figcaption className="flex items-center gap-3 font-mono text-caption uppercase tracking-[0.14em] text-mute">
                  <span className="text-ink-dim">{String(i + 1).padStart(2, "0")}</span>
                  <span aria-hidden>/</span>
                  <span>ARR</span>
                </figcaption>
                <CountUp
                  to={c.to}
                  prefix={c.prefix}
                  suffix={c.suffix}
                  decimals={c.decimals}
                  className="font-mono text-display-lg font-medium leading-none tracking-tight text-ink"
                />
                <span className="text-small text-mute">{c.label}</span>
              </figure>
            </Reveal>
          ))}
        </div>

        {/* CAVEAT: honesty as a feature — quiet bordered note */}
        <motion.aside
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="mt-5 flex flex-col gap-3 rounded-md border border-border bg-surface/30 p-6 sm:flex-row sm:items-start sm:gap-5"
        >
          <span className="shrink-0 font-mono text-caption uppercase tracking-[0.16em] text-mute">
            KNOWN UNKNOWNS
          </span>
          <p className="max-w-[68ch] text-small leading-relaxed text-mute">
            {economics.caveat}
          </p>
        </motion.aside>
      </Container>
    </Section>
  );
}
