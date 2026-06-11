"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Crosshair } from "lucide-react";
import { Section, Container } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { Reveal } from "@/components/motion/Reveal";
import { gtm } from "@/lib/content";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

export function Gtm() {
  return (
    <Section id="gtm" className="bg-paper">
      <Container>
        <SectionHeader
          index="09"
          eyebrow={gtm.eyebrow}
          title={
            <>
              Acquisition starts in the <span className="text-accent">paddock.</span>
            </>
          }
        />

        <div className="mt-16 grid grid-cols-1 gap-x-12 gap-y-14 md:mt-20 md:grid-cols-2">
          <Channels />
          <Targets />
        </div>

        <Comms />
      </Container>
    </Section>
  );
}

/* ── Left: channels as a numbered telemetry list ─────────────────────────── */

function Channels() {
  return (
    <section aria-labelledby="gtm-channels" className="flex flex-col gap-6">
      <Reveal>
        <header className="flex items-baseline justify-between border-b border-border pb-4">
          <h3 id="gtm-channels" className="telemetry text-ink-dim">
            Channels
          </h3>
          <span className="tabular font-mono text-caption text-mute">
            {String(gtm.channels.length).padStart(2, "0")} live
          </span>
        </header>
      </Reveal>

      <ol className="flex flex-col">
        {gtm.channels.map((channel, i) => (
          <motion.li
            key={channel}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: i * 0.06, duration: 0.6, ease }}
            className="group flex items-baseline gap-4 border-b border-border/60 py-4 last:border-0"
          >
            <span className="tabular w-7 shrink-0 font-mono text-caption text-mute transition-colors group-hover:text-accent">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-body text-ink">{channel}</span>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

/* ── Right: hitlist as locked TARGETS with a crosshair vibe ──────────────── */

function Targets() {
  return (
    <section aria-labelledby="gtm-targets" className="flex flex-col gap-6">
      <Reveal>
        <header className="flex items-center justify-between border-b border-border pb-4">
          <h3 id="gtm-targets" className="telemetry inline-flex items-center gap-2 text-accent">
            <Crosshair className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Targets
          </h3>
          <span className="tabular font-mono text-caption text-mute">
            {String(gtm.hitlist.length).padStart(2, "0")} locked
          </span>
        </header>
      </Reveal>

      <ul className="flex flex-col">
        {gtm.hitlist.map((target, i) => (
          <motion.li
            key={target}
            initial={{ opacity: 0, x: 12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: i * 0.06, duration: 0.6, ease }}
            className="group flex items-center gap-4 border-b border-border/60 py-4 last:border-0"
          >
            {/* corner-bracket reticle that snaps shut on hover */}
            <span
              aria-hidden
              className="relative grid h-6 w-6 shrink-0 place-items-center"
            >
              <span className="absolute left-0 top-0 h-2 w-2 border-l border-t border-mute transition-all duration-[var(--duration-base)] group-hover:border-accent" />
              <span className="absolute right-0 top-0 h-2 w-2 border-r border-t border-mute transition-all duration-[var(--duration-base)] group-hover:border-accent" />
              <span className="absolute bottom-0 left-0 h-2 w-2 border-b border-l border-mute transition-all duration-[var(--duration-base)] group-hover:border-accent" />
              <span className="absolute bottom-0 right-0 h-2 w-2 border-b border-r border-mute transition-all duration-[var(--duration-base)] group-hover:border-accent" />
              <span className="h-1 w-1 rounded-full bg-mute transition-colors duration-[var(--duration-base)] group-hover:bg-accent" />
            </span>
            <span className="text-body text-ink-dim transition-colors group-hover:text-ink">
              {target}
            </span>
            <span className="tabular ml-auto shrink-0 font-mono text-caption text-mute">
              T-{String(i + 1).padStart(2, "0")}
            </span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

/* ── Full-width comms terminal: the outreach script is the gold ──────────── */

function Comms() {
  return (
    <Reveal delay={0.05} className="mt-16 md:mt-20">
      <figure className="overflow-hidden rounded-md border border-border bg-surface">
        {/* terminal chrome */}
        <figcaption className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-3 sm:px-6">
          <TelemetryLabel marker={false} className="text-mute">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              COMMS · OUTREACH
            </span>
          </TelemetryLabel>
          <span className="tabular hidden font-mono text-caption text-mute sm:inline">
            DRAFTED · READY TO SEND
          </span>
        </figcaption>

        <div className="flex flex-col divide-y divide-border">
          <CommsLine
            tag="THE SCRIPT"
            handle="you → driver"
            text={gtm.outreachScript}
            featured
          />
          <CommsLine tag="HOT LEAD" handle="you → warm reply" text={gtm.hotLead} />
        </div>
      </figure>
    </Reveal>
  );
}

function CommsLine({
  tag,
  handle,
  text,
  featured = false,
}: {
  tag: string;
  handle: string;
  text: string;
  featured?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => {
        /* clipboard unavailable — fail quietly */
      },
    );
  }

  return (
    <div
      className={cn(
        "relative px-4 py-6 sm:px-6 sm:py-8",
        featured && "bg-accent/[0.035]",
      )}
    >
      {featured && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-accent" />
      )}

      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="font-mono text-caption uppercase tracking-[0.16em]">
          <span className={featured ? "text-accent" : "text-mute"}>{tag}</span>
          <span className="ml-3 text-mute">{handle}</span>
        </span>

        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied to clipboard" : `Copy the ${tag.toLowerCase()}`}
          className={cn(
            "inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-sm border px-3 font-mono text-caption uppercase tracking-[0.14em] transition-colors duration-[var(--duration-base)] focus-visible:outline-none",
            copied
              ? "border-accent text-accent"
              : "border-border text-ink-dim hover:border-accent hover:text-accent",
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <blockquote
        className={cn(
          "font-mono leading-relaxed",
          featured
            ? "text-body text-ink sm:text-h3"
            : "text-small text-ink-dim",
        )}
      >
        <span aria-hidden className="mr-1 select-none text-accent">
          {"›"}
        </span>
        {text}
      </blockquote>
    </div>
  );
}
