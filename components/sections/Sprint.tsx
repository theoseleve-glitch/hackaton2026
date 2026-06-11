import { Section, Container } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { Stat } from "@/components/ui/Stat";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { sprint } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * 06 / THIS WEEKEND — money can move now.
 * Price LADDER (Full dominant, no badge) → ops checklist → conversion funnel → CTA.
 * Server component: all motion lives in the imported client primitives.
 */
export function Sprint() {
  return (
    <Section id="sprint" className="bg-paper-2">
      <Container>
        <SectionHeader
          index="06"
          eyebrow={sprint.eyebrow}
          title={
            <>
              Right now it isn&apos;t SaaS.{" "}
              <span className="text-accent">It&apos;s a productized service.</span>
            </>
          }
        />

        {/* ── PRICE LADDER ─────────────────────────────────────────────── */}
        <Stagger
          gap={0.1}
          className="mt-16 grid grid-cols-1 items-stretch gap-px overflow-hidden rounded-md border border-border bg-border md:mt-20 md:grid-cols-3"
        >
          {sprint.tiers.map((tier, i) => (
            <StaggerItem key={tier.name} className="h-full">
              <PriceRung tier={tier} step={i + 1} count={sprint.tiers.length} />
            </StaggerItem>
          ))}
        </Stagger>

        {/* ── OPS CHECKLIST ────────────────────────────────────────────── */}
        <div className="mt-20 grid grid-cols-1 gap-x-16 gap-y-10 md:mt-28 lg:grid-cols-[auto_1fr]">
          <Reveal className="lg:max-w-[18ch]">
            <TelemetryLabel>THE 48-HOUR OPS LIST</TelemetryLabel>
            <p className="mt-5 font-display text-h2 text-ink">
              Five moves. One weekend. Cash in the account.
            </p>
          </Reveal>

          <Stagger gap={0.07} className="flex flex-col border-t border-border">
            {sprint.execution.map((step, i) => (
              <StaggerItem key={step}>
                <article className="group flex items-baseline gap-5 border-b border-border py-4 sm:gap-7">
                  <span className="font-mono text-small font-medium tabular text-mute transition-colors group-hover:text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="h-px flex-1 translate-y-[-0.35em] bg-border" aria-hidden />
                  <span className="max-w-[34ch] text-right text-body text-ink sm:text-left">
                    {step}
                  </span>
                </article>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        {/* ── CONVERSION FUNNEL ────────────────────────────────────────── */}
        <Reveal className="mt-20 md:mt-28">
          <figure className="rounded-md border border-border bg-surface/40 p-6 sm:p-8">
            <figcaption className="flex flex-col gap-2 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
              <TelemetryLabel>THE WEEKEND FUNNEL</TelemetryLabel>
              <span className="font-mono text-caption uppercase tracking-[0.14em] text-mute">
                {sprint.target.line}
              </span>
            </figcaption>

            <ol className="mt-8 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-0">
              {sprint.target.steps.map((s, i) => {
                const last = i === sprint.target.steps.length - 1;
                return (
                  <li
                    key={s.label}
                    className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center"
                  >
                    <Stat
                      value={s.value}
                      label={s.label}
                      className="flex-1"
                      valueClassName={cn(
                        "text-display tabular",
                        last ? "text-accent" : "text-ink",
                      )}
                    />
                    {!last && (
                      <span
                        aria-hidden
                        className="select-none self-start font-mono text-h2 leading-none text-accent sm:self-center sm:px-4"
                      >
                        →
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </figure>
        </Reveal>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <Reveal className="mt-14 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[28ch] font-display text-h2 text-ink">
            Pick a tier. We build it this weekend.
          </p>
          <Button href={sprint.cta.href} variant="primary" magnetic>
            {sprint.cta.label}
          </Button>
        </Reveal>
      </Container>
    </Section>
  );
}

/**
 * One rung of the price ladder. The featured tier (Full) is visually dominant —
 * accent border, lifted surface, slight scale — others stay quieter. No badge.
 */
function PriceRung({
  tier,
  step,
  count,
}: {
  tier: (typeof sprint.tiers)[number];
  step: number;
  count: number;
}) {
  const featured = Boolean(tier.featured);
  return (
    <div
      className={cn(
        "relative flex h-full flex-col gap-7 p-7 transition-colors sm:p-8",
        featured
          ? "bg-surface ring-1 ring-inset ring-accent md:z-10 md:scale-[1.03]"
          : "bg-paper hover:bg-surface/50",
      )}
    >
      {/* mono name label + ladder position */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "font-mono text-small font-medium uppercase tracking-[0.16em]",
            featured ? "text-accent" : "text-ink-dim",
          )}
        >
          {tier.name}
        </span>
        <span className="font-mono text-caption uppercase tracking-[0.16em] tabular text-mute">
          {String(step).padStart(2, "0")}/{String(count).padStart(2, "0")}
        </span>
      </div>

      {/* the price — big mono, tabular */}
      <p className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-mono text-display-lg font-medium leading-none tracking-tight tabular",
            featured ? "text-ink" : "text-ink-dim",
          )}
        >
          {tier.price}
        </span>
        <span className="font-mono text-caption uppercase tracking-[0.14em] text-mute">
          once
        </span>
      </p>

      <span className="h-px w-full bg-border" aria-hidden />

      {/* tight checklist */}
      <ul className="flex flex-1 flex-col gap-3">
        {tier.lines.map((line) => (
          <li key={line} className="flex items-start gap-3 text-small text-ink">
            <span
              aria-hidden
              className={cn(
                "mt-[0.45em] h-1.5 w-1.5 shrink-0",
                featured ? "bg-accent" : "bg-mute",
              )}
            />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
