"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Section, Container } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/motion/Reveal";
import { exampleKit, kit } from "@/lib/content";
import { cn } from "@/lib/utils";

export function ExampleKit() {
  return (
    <Section id="example-kit" className="bg-paper-2">
      {/* faint engineering grid under the window — keeps the "war room" feel */}
      <div
        aria-hidden
        className="gridlines pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(120%_80%_at_50%_40%,#000_15%,transparent_70%)]"
      />

      <Container className="relative">
        <SectionHeader
          index="04"
          eyebrow={exampleKit.eyebrow}
          title={
            <>
              This is what a <span className="text-accent">sponsor receives.</span>
            </>
          }
        />

        <div className="mt-14 grid gap-14 md:mt-20 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
          {/* THE LIVE WINDOW — tilts toward the cursor */}
          <KitWindow />

          {/* The argument + the primary conversion */}
          <div className="flex flex-col gap-8">
            <Reveal>
              <p className="max-w-[44ch] text-balance text-body text-ink-dim">
                {exampleKit.body}
              </p>
            </Reveal>

            <Reveal delay={0.08}>
              <ul className="overflow-hidden rounded-md border border-border">
                {kit.packages.tiers.map((tier, i) => (
                  <li
                    key={tier.name}
                    className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3.5 last:border-0"
                  >
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-caption tabular text-mute">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-small text-ink">{tier.name}</span>
                    </span>
                    <span className="font-mono text-small tabular text-accent">{tier.price}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.16}>
              <div className="flex flex-col items-start gap-4">
                <Button href={exampleKit.cta.href}>{exampleKit.cta.label}</Button>
                <span className="flex items-center gap-2.5 font-mono text-caption uppercase tracking-[0.16em] text-mute">
                  <span aria-hidden className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                  Opens the real page · not a mockup
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ── The framed browser/kit preview with mouse-driven 3D tilt ───────────────── */

function KitWindow() {
  const ref = useRef<HTMLDivElement>(null);

  // Normalised pointer position, -0.5 → 0.5, spring-smoothed.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 150, damping: 18, mass: 0.4 });
  const sy = useSpring(py, { stiffness: 150, damping: 18, mass: 0.4 });

  const rotateX = useTransform(sy, [-0.5, 0.5], ["7deg", "-7deg"]);
  const rotateY = useTransform(sx, [-0.5, 0.5], ["-9deg", "9deg"]);
  // Specular glow follows the cursor across the glass.
  const glareX = useTransform(sx, [-0.5, 0.5], ["18%", "82%"]);
  const glareY = useTransform(sy, [-0.5, 0.5], ["12%", "88%"]);
  const glare = useTransform(
    [glareX, glareY],
    ([gx, gy]: string[]) =>
      `radial-gradient(420px circle at ${gx} ${gy}, rgba(255,90,31,0.16), transparent 60%)`,
  );

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onLeave() {
    px.set(0);
    py.set(0);
  }

  return (
    <motion.figure
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="relative [perspective:1400px]"
    >
      {/* volt halo behind the glass */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-lg bg-accent/10 blur-[90px]"
      />

      <motion.div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="group relative overflow-hidden rounded-lg border border-accent/40 bg-surface shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] [will-change:transform]"
      >
        {/* cursor-tracked specular sheen */}
        <motion.div
          aria-hidden
          style={{ background: glare }}
          className="pointer-events-none absolute inset-0 z-20 opacity-60 transition-opacity duration-500 group-hover:opacity-100"
        />

        {/* ── chrome bar ── */}
        <div className="flex items-center gap-3 border-b border-border bg-paper-2/80 px-4 py-3">
          <div aria-hidden className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-mute/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <span className="inline-flex max-w-full items-center gap-2 truncate rounded-full border border-border bg-surface px-3 py-1 font-mono text-caption tracking-[0.04em] text-ink-dim">
              <LockGlyph />
              fueltheseason.com/kit/jules
            </span>
          </div>
          <span className="hidden shrink-0 font-mono text-caption uppercase tracking-[0.14em] text-mute sm:inline">
            LIVE
          </span>
        </div>

        {/* ── miniature sponsor page ── */}
        <div className="relative isolate p-6 md:p-8">
          {/* athlete masthead */}
          <div className="flex items-end justify-between gap-4 border-b border-border pb-5">
            <div className="flex flex-col gap-2">
              <TelemetryLabel marker={false} className="text-mute">
                {kit.athlete.discipline}
              </TelemetryLabel>
              <h3 className="font-display text-h1 leading-[0.95] tracking-[-0.02em] text-ink">
                {kit.athlete.name}{" "}
                <span className="text-accent">· #{kit.athlete.number}</span>
              </h3>
            </div>
            {/* faux conversion chip */}
            <span
              aria-hidden
              className="hidden shrink-0 items-center gap-2 rounded-full border border-accent/50 px-3.5 py-2 font-mono text-caption font-semibold uppercase tracking-[0.12em] text-accent sm:inline-flex"
            >
              Back Jules
              <span aria-hidden>→</span>
            </span>
          </div>

          {/* mono readouts row — the previewStats as a telemetry strip */}
          <dl className="mt-5 grid grid-cols-3 divide-x divide-border border border-border">
            {exampleKit.previewStats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col gap-1 px-3 py-3.5"
              >
                <dd className="font-mono text-h2 font-medium leading-none text-ink tabular">
                  {s.value}
                </dd>
                <dt className="text-caption leading-tight text-mute">{s.label}</dt>
              </motion.div>
            ))}
          </dl>

          {/* one-line package teaser */}
          <div className="mt-5 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-4 py-3.5">
            <span className="flex items-center gap-2.5 text-small text-ink-dim">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-accent" />
              {kit.packages.headline}
            </span>
            <span className="shrink-0 font-mono text-caption uppercase tracking-[0.12em] text-accent">
              from {kit.packages.tiers[0].price}
            </span>
          </div>

          {/* faux scroll seam — sells "there's more below the fold" */}
          <div
            aria-hidden
            className="mt-5 h-16 rounded-md border border-dashed border-border [mask-image:linear-gradient(to_bottom,#000,transparent)]"
          >
            <div className="gridlines h-full w-full opacity-40" />
          </div>
        </div>
      </motion.div>

      <figcaption className="sr-only">
        A live preview of Jules Pirzadeh&apos;s sponsor page at fueltheseason.com/kit/jules.
      </figcaption>
    </motion.figure>
  );
}

function LockGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3 w-3 shrink-0 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
