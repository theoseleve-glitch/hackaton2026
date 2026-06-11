import { Section, Container } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { roadmap } from "@/lib/content";
import { cn } from "@/lib/utils";

export function Roadmap() {
  const last = roadmap.timeline.length - 1;

  return (
    <Section id="roadmap" className="bg-paper">
      <Container>
        <SectionHeader
          index="07"
          eyebrow={roadmap.eyebrow}
          title={
            <>
              Manual first. <span className="text-accent">SaaS second.</span>
            </>
          }
        />

        {/* PIT-STOP SCHEDULE — vertical timeline with a volt-lime progress rail */}
        <div className="mt-16 md:mt-20">
          {/* schedule readout header: mono column labels, like a pit-wall sheet */}
          <Reveal>
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              <span className="telemetry">PHASE</span>
              <span className="telemetry">06 STOPS · MANUAL → SAAS</span>
            </div>
          </Reveal>

          <Stagger className="relative" gap={0.1} amount={0.2}>
            {/* the rail: faint full-length track + lit accent progress overlay */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-8 left-[7px] top-3 w-px bg-border md:left-[9px]"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-[7px] top-3 h-[78%] w-px bg-gradient-to-b from-accent via-accent/60 to-transparent md:left-[9px]"
            />

            {roadmap.timeline.map((stop, i) => (
              <StaggerItem key={stop.k}>
                <article
                  className={cn(
                    "group relative grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 border-b border-line py-6 md:grid-cols-[auto_14rem_1fr] md:items-baseline md:gap-x-8",
                    i === 0 && "pt-3",
                  )}
                >
                  {/* node on the rail — lap counter inside a lit marker */}
                  <div className="relative row-span-2 flex w-4 justify-center md:row-span-1 md:self-start md:pt-1">
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 transition-colors",
                        i === last
                          ? "border-accent bg-accent"
                          : "border-accent bg-paper group-hover:bg-accent/20",
                      )}
                    />
                  </div>

                  {/* phase label — mono time-stamp, accent */}
                  <h3 className="self-baseline font-mono text-h3 font-medium uppercase tracking-[0.04em] text-accent tabular">
                    <span className="mr-3 align-baseline text-caption text-mute">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {stop.k}
                  </h3>

                  {/* description — the work shipped in that window */}
                  <p className="col-start-2 max-w-[46ch] text-body text-ink-dim md:col-start-3">
                    {stop.v}
                  </p>
                </article>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        {/* THE STACK — parts list of mono chips, reached via the → conversion */}
        <Reveal delay={0.05}>
          <div className="mt-14 border-t border-border pt-8 md:mt-20">
            <div className="mb-6 flex items-center gap-3">
              <TelemetryLabel marker={false}>THE STACK</TelemetryLabel>
              <span aria-hidden className="font-mono text-caption text-accent">
                →
              </span>
              <span className="telemetry text-mute">07 PARTS</span>
            </div>

            <ul className="flex flex-wrap gap-2.5">
              {roadmap.stack.map((part) => (
                <li key={part}>
                  <span
                    className="inline-flex min-h-[44px] items-center rounded-sm border border-border bg-surface/40 px-3.5 font-mono text-small text-mute transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-expo)] hover:border-accent/60 hover:text-accent"
                  >
                    {part}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
