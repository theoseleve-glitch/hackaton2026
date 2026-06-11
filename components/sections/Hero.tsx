"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Section";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { SplitText } from "@/components/motion/SplitText";
import { hero } from "@/lib/content";
import { cn } from "@/lib/utils";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // Scroll-scrubbed parallax on the atmospheric grid + a gentle headline lift.
  const gridY = useTransform(scrollYProgress, [0, 1], ["0%", "26%"]);
  const headY = useTransform(scrollYProgress, [0, 1], ["0%", "-14%"]);
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section ref={ref} id="top" className="relative min-h-[100svh] overflow-hidden pb-20 pt-28">
      {/* atmospheric gridlines + volt glow */}
      <motion.div
        aria-hidden
        style={{ y: gridY }}
        className="gridlines pointer-events-none absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(120%_90%_at_50%_0%,#000_30%,transparent_75%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-12%] h-[420px] w-[820px] max-w-[120vw] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]"
      />

      <Container className="relative">
        <motion.div style={{ y: headY }} className="flex flex-col items-start gap-7 pt-10 md:pt-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <TelemetryLabel>{hero.eyebrow}</TelemetryLabel>
          </motion.div>

          <h1 className="font-display text-display-lg leading-[0.9] tracking-[-0.04em] text-ink sm:text-display-xl md:text-display-2xl">
            {hero.headlineLines.map((line, i) => (
              <span key={line} className="block">
                <SplitText text={line} start={0.1 + i * 0.18} gap={0.045} />
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[40ch] text-balance font-display text-h2 font-medium text-ink"
          >
            {hero.subhead}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.84, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[52ch] text-body text-ink-dim"
          >
            {hero.support}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.96, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-start gap-4 sm:flex-row sm:items-center"
          >
            <Button href={hero.primaryCta.href}>{hero.primaryCta.label}</Button>
            <Button href={hero.secondaryCta.href} variant="secondary" arrow={false}>
              {hero.secondaryCta.label}
            </Button>
          </motion.div>

          <motion.p
            style={{ opacity: fade }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.6 }}
            className="flex items-center gap-3 font-mono text-caption uppercase tracking-[0.16em] text-mute"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            {hero.proofLine}
          </motion.p>
        </motion.div>

        {/* The signature: before → after conversion */}
        <Transformation />
      </Container>
    </section>
  );
}

function Panel({
  label,
  items,
  state,
}: {
  label: string;
  items: string[];
  state: "before" | "after";
}) {
  const after = state === "after";
  return (
    <div
      className={cn(
        "relative flex-1 rounded-md border p-6",
        after
          ? "border-accent/60 bg-accent/[0.04]"
          : "border-border bg-surface/40 [filter:grayscale(0.4)]",
      )}
    >
      <div className="mb-5 flex items-center justify-between">
        <span className="telemetry">{label}</span>
        {after ? (
          <span className="flex items-center gap-1.5 font-mono text-caption uppercase tracking-[0.14em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Live
          </span>
        ) : (
          <span className="font-mono text-caption uppercase tracking-[0.14em] text-mute">Amateur</span>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((item, i) => (
          <motion.li
            key={item}
            initial={{ opacity: 0, x: after ? 16 : 0, y: after ? 0 : 8 }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "flex items-center gap-3 border-b border-border/60 pb-3 text-small last:border-0 last:pb-0",
              after ? "text-ink" : "text-ink-dim line-through decoration-mute/50",
            )}
          >
            <span
              className={cn(
                "font-mono text-caption",
                after ? "text-accent" : "text-mute",
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            {item}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function Transformation() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="mt-16 flex flex-col items-stretch gap-4 md:mt-24 md:flex-row md:items-center"
    >
      <Panel label={hero.before.label} items={hero.before.items} state="before" />
      <div className="flex items-center justify-center md:flex-col">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 14 }}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-accent bg-paper text-accent"
        >
          <ArrowRight strokeWidth={1.75} className="rotate-90 md:rotate-0" />
        </motion.div>
      </div>
      <Panel label={hero.after.label} items={hero.after.items} state="after" />
    </motion.div>
  );
}
