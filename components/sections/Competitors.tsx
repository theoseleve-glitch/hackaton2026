import { ArrowRight } from "lucide-react";
import { Section, Container } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { competitors } from "@/lib/content";

export function Competitors() {
  return (
    <Section id="competitors" className="bg-paper">
      <Container>
        <SectionHeader
          index="05"
          eyebrow={competitors.eyebrow}
          title={
            <>
              Every alternative solves the{" "}
              <span className="text-accent">wrong layer.</span>
            </>
          }
        />

        {/* The ledger: each alternative audited against the layer it can't reach. */}
        <Stagger className="mt-14 md:mt-20" gap={0.08} amount={0.2}>
          {/* Column legend — pit-wall readout headers */}
          <StaggerItem>
            <div className="flex items-baseline justify-between gap-6 border-b border-border pb-3">
              <span className="telemetry">Alternative</span>
              <span className="telemetry text-right">Wrong layer</span>
            </div>
          </StaggerItem>

          <dl>
            {competitors.rows.map((row, i) => (
              <StaggerItem key={row.k}>
                <div className="group grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 gap-y-1 border-b border-border py-7 sm:grid-cols-[3.5rem_1.1fr_1fr] sm:gap-x-8 sm:py-8">
                  <span className="font-mono text-caption tabular text-mute">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <dt className="font-display text-h1 leading-[1.05] text-ink-dim transition-colors duration-[var(--duration-base)] ease-[var(--ease-out-expo)] group-hover:text-ink sm:text-display">
                    {row.k}
                  </dt>
                  <dd className="col-start-2 max-w-[36ch] text-balance text-body text-mute sm:col-start-3 sm:text-right">
                    {row.v}
                  </dd>
                </div>
              </StaggerItem>
            ))}
          </dl>

          {/* The verdict — the only row that closes the loop. */}
          <StaggerItem>
            <dl className="mt-5 grid grid-cols-[2.5rem_1fr] items-center gap-x-4 gap-y-3 rounded-md border border-accent bg-accent/[0.04] px-5 py-7 sm:mt-6 sm:grid-cols-[3.5rem_1.1fr_1fr] sm:gap-x-8 sm:px-8 sm:py-9">
              <ArrowRight
                aria-hidden
                strokeWidth={2}
                className="h-6 w-6 text-accent"
              />
              <dt className="font-display text-display text-accent sm:text-display-lg">
                {competitors.us.k}
              </dt>
              <dd className="col-start-2 max-w-[36ch] text-balance text-h3 font-medium text-ink sm:col-start-3 sm:text-right">
                {competitors.us.v}
              </dd>
            </dl>
          </StaggerItem>
        </Stagger>

        {/* Standalone statement — the contrast, said plainly. */}
        <Reveal className="mt-20 md:mt-28" delay={0.05}>
          <p className="max-w-[24ch] font-display text-display leading-[1.04] text-ink-dim sm:text-display-lg">
            Templates make you look better.{" "}
            <span className="text-accent">Fuel the Season helps you ask better.</span>
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
