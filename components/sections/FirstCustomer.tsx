import { Section, Container } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { Reveal } from "@/components/motion/Reveal";
import { firstCustomer } from "@/lib/content";

/**
 * CUSTOMER 001 — the "meet a real person" beat.
 * Treatment: a driver dossier. Left = dossier brief + a stamped registration card.
 * Right = a race-licence datasheet (<dl>), mono keys → ink values, hairline rows.
 */
export function FirstCustomer() {
  return (
    <Section id="first-customer" className="bg-paper-2">
      {/* faint top hairline to seat the section in the war-room grid */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-border" />

      <Container>
        <div className="grid grid-cols-1 gap-x-12 gap-y-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          {/* ── LEFT: the brief ───────────────────────────────────────── */}
          <div className="flex flex-col gap-9">
            <SectionHeader
              index="02"
              eyebrow={firstCustomer.eyebrow}
              title={
                <>
                  Start with <span className="text-accent">Jules.</span>
                </>
              }
            />

            <Reveal delay={0.08}>
              <p className="max-w-[46ch] text-body text-ink-dim">{firstCustomer.body}</p>
            </Reveal>

            {/* registration stamp — a mono "filed" record, rotated like an ink stamp */}
            <Reveal delay={0.14}>
              <figure className="relative inline-flex w-fit -rotate-[1.4deg] flex-col gap-2 border border-accent/45 bg-accent/[0.04] px-5 py-4">
                <span aria-hidden className="absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-accent" />
                <span aria-hidden className="absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-accent" />
                <figcaption className="flex items-center gap-3 font-mono text-caption uppercase tracking-[0.16em] text-accent">
                  <span aria-hidden className="h-2 w-2 shrink-0 bg-accent" />
                  Registered
                </figcaption>
                <span className="font-mono text-h3 tabular tracking-[0.04em] text-ink">
                  CUSTOMER&nbsp;<span className="text-accent">001</span>
                </span>
                <span className="font-mono text-caption uppercase tracking-[0.16em] text-mute">
                  Jules Pirzadeh
                </span>
              </figure>
            </Reveal>
          </div>

          {/* ── RIGHT: the licence datasheet ──────────────────────────── */}
          <Reveal delay={0.1} y={34}>
            <article className="border border-border bg-surface/40">
              {/* card header bar — pit-wall readout */}
              <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <TelemetryLabel marker={false}>Driver dossier</TelemetryLabel>
                <span className="font-mono text-caption uppercase tracking-[0.16em] text-mute">
                  REF · KRT-001
                </span>
              </header>

              {/* spec rows: mono uppercase key (mute) → value (ink), hairline between */}
              <dl className="px-5">
                {firstCustomer.spec.map((row, i) => (
                  <Reveal
                    key={row.k}
                    delay={0.16 + i * 0.08}
                    y={16}
                    className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-b border-border py-4 last:border-0 sm:grid-cols-[8.5rem_1fr] sm:items-baseline"
                  >
                    <dt className="flex items-center gap-2 font-mono text-caption uppercase tracking-[0.16em] text-mute">
                      <span aria-hidden className="tabular text-accent/70">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {row.k}
                    </dt>
                    <dd className="text-balance text-small text-ink sm:text-body">{row.v}</dd>
                  </Reveal>
                ))}
              </dl>

              {/* footer readout — the conversion motif, the verdict on the file */}
              <footer className="flex items-center gap-3 border-t border-border bg-surface-2/60 px-5 py-3.5">
                <span className="font-mono text-caption uppercase tracking-[0.16em] text-mute">
                  Today
                </span>
                <span aria-hidden className="text-accent">→</span>
                <span className="font-mono text-caption uppercase tracking-[0.16em] text-ink-dim">
                  Sponsor-ready
                </span>
              </footer>
            </article>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
