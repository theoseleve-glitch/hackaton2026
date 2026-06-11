import { Section, Container } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { product } from "@/lib/content";
import { cn } from "@/lib/utils";
import { pad2 } from "@/lib/utils";

/**
 * THE OUTPUT — a numbered datasheet / table of contents of everything Backed
 * ships. Not an icon-circle grid: full-bleed spec rows with a big mono index,
 * hairline rules, and a hover state that lights the index volt-lime and reveals
 * the "→" conversion. The list reads like a pit-wall manifest.
 */
export function Product() {
  const total = product.outputs.length;

  return (
    <Section id="product" className="bg-paper">
      <Container>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionHeader
            index="03"
            eyebrow={product.eyebrow}
            title={
              <>
                One intake. <span className="text-accent">One sponsor-ready campaign.</span>
              </>
            }
            className="md:max-w-[28ch]"
          />
          <Reveal delay={0.12} className="md:pb-2">
            <p className="max-w-[34ch] text-balance font-mono text-caption uppercase leading-[1.6] tracking-[0.12em] text-mute">
              <span className="text-ink-dim tabular">{pad2(total)}</span> deliverables · one athlete in{" "}
              <span className="text-accent">→</span> one campaign out
            </p>
          </Reveal>
        </div>

        {/* The line, set as a lead — the framing for the spec sheet below. */}
        <Reveal delay={0.06}>
          <p className="mt-10 max-w-[58ch] text-balance font-display text-h2 font-medium text-ink-dim md:mt-14">
            {product.line}
          </p>
        </Reveal>

        {/* The datasheet. A semantic ordered list; each row is a numbered entry. */}
        <Stagger className="mt-12 border-t border-border md:mt-16" gap={0.06} amount={0.15}>
          <ol>
            {product.outputs.map((output, i) => (
              <StaggerItem key={output.title}>
                <Row index={pad2(i + 1)} title={output.title} body={output.body} tag={output.tag} />
              </StaggerItem>
            ))}
          </ol>
        </Stagger>
      </Container>
    </Section>
  );
}

function Row({
  index,
  title,
  body,
  tag,
}: {
  index: string;
  title: string;
  body: string;
  tag?: string;
}) {
  return (
    <li
      className={cn(
        "group relative grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-2 border-b border-border",
        "px-1 py-6 transition-colors duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
        "hover:bg-surface/40 md:grid-cols-[5.5rem_minmax(0,18rem)_1fr] md:gap-x-8 md:py-7",
      )}
    >
      {/* Big mono index — turns volt-lime on row hover. */}
      <span
        aria-hidden
        className={cn(
          "tabular self-start font-mono text-h2 leading-none tracking-[-0.02em] text-mute",
          "transition-colors duration-[var(--duration-base)] ease-[var(--ease-out-expo)]",
          "group-hover:text-accent md:text-h1",
        )}
      >
        {index}
      </span>

      {/* Title — carries the deliverable, with the "Soon" chip when applicable. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:self-start">
        <h3 className="font-display text-h3 leading-tight text-ink transition-colors duration-[var(--duration-base)] ease-[var(--ease-out-expo)] md:text-h2">
          {title}
        </h3>
        {tag && (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-accent/40 bg-accent/[0.06] px-2 py-0.5 font-mono text-caption uppercase leading-none tracking-[0.14em] text-accent">
            <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
            {tag}
          </span>
        )}
      </div>

      {/* Body — the spec line. The "→" marker fades in on hover as the cue. */}
      <p className="col-start-2 max-w-[52ch] text-small text-ink-dim md:col-start-3 md:max-w-none">
        <span
          aria-hidden
          className="mr-2 inline-block font-mono text-accent opacity-0 transition-opacity duration-[var(--duration-base)] ease-[var(--ease-out-expo)] group-hover:opacity-100"
        >
          &rarr;
        </span>
        {body}
      </p>
    </li>
  );
}
