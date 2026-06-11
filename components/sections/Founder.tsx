import { Section, Container } from "@/components/ui/Section";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { Reveal } from "@/components/motion/Reveal";
import { founder } from "@/lib/content";

// The pull-quote's two halves: the agency's flat read, then the founder's.
// We split on the emphasised tail so the volt-lime lands on the real insight —
// never rewriting copy, only marking it up.
const EMPHASIS = "the exact reason the sponsor pitch fails";
// Emphasis is the TAIL of the line, so split yields [lead, ""]. Render the
// accent from the constant — never from the (empty) split tail.
const [quoteLead] = founder.line.split(EMPHASIS);

export function Founder() {
  return (
    <Section id="founder" className="bg-paper-2">
      <Container>
        <div className="grid gap-y-16 lg:grid-cols-12 lg:gap-x-12">
          {/* Left rail: the readout, kept narrow against deliberate negative space. */}
          <div className="lg:col-span-4">
            <Reveal>
              <TelemetryLabel index="10">{founder.eyebrow}</TelemetryLabel>
            </Reveal>
            <Reveal delay={0.08} className="mt-10">
              <dl className="grid grid-cols-3 gap-4 border-t border-border pt-6 font-mono text-caption uppercase tracking-[0.16em] lg:grid-cols-1 lg:space-y-4">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-mute">PADDOCK</dt>
                  <dd className="tabular text-ink-dim">INSIDER</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-mute">BUDGET</dt>
                  <dd className="tabular text-ink-dim">CHASING</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-mute">PITCH</dt>
                  <dd className="tabular text-accent">DIAGNOSED</dd>
                </div>
              </dl>
            </Reveal>
          </div>

          {/* Right: the statement. First-person, left-aligned, oversized. */}
          <div className="lg:col-span-8">
            <Reveal delay={0.04}>
              <h2 className="font-display text-display-lg leading-[0.9] tracking-[-0.04em] text-ink sm:text-display-xl">
                {founder.headline}
              </h2>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="mt-8 max-w-[54ch] text-balance text-h3 font-normal leading-relaxed text-ink-dim">
                {founder.body}
              </p>
            </Reveal>

            {/* The conversion motif: agency read → founder read, as a hairline-framed quote. */}
            <Reveal delay={0.2}>
              <figure className="mt-16 border-t border-border pt-10 md:mt-20 md:pt-12">
                <blockquote className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -left-1 -top-12 select-none font-display text-display-xl leading-none text-border md:-top-16"
                  >
                    &ldquo;
                  </span>
                  <p className="font-display text-h1 leading-[1.04] tracking-[-0.025em] text-ink sm:text-display">
                    {quoteLead ?? founder.line}
                    <span className="text-accent">{EMPHASIS}</span>
                  </p>
                </blockquote>

                <figcaption className="mt-8 flex items-center gap-4">
                  <span aria-hidden className="text-accent" >
                    &rarr;
                  </span>
                  <span className="telemetry">FOUNDER &middot; THE CUSTOMER</span>
                </figcaption>
              </figure>
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  );
}
