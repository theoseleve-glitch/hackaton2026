import { Marquee } from "@/components/motion/Marquee";
import { Reveal } from "@/components/motion/Reveal";
import { Container } from "@/components/ui/Section";
import { TelemetryLabel } from "@/components/ui/TelemetryLabel";
import { LogoMark } from "@/components/icons/Logo";
import { footer, site } from "@/lib/content";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-paper-2 pt-20">
      {/* mic-drop marquee */}
      <div className="border-y border-border py-5">
        <Marquee duration={24}>
          <span className="px-8 font-display text-h2 font-extrabold tracking-tight text-ink">
            {footer.micDrop}
          </span>
          <span aria-hidden className="px-8 text-accent">
            <LogoMark className="inline-block h-5" />
          </span>
        </Marquee>
      </div>

      <Container className="py-16">
        <div className="flex flex-col justify-between gap-12 md:flex-row md:items-end">
          <div className="flex max-w-md flex-col gap-5">
            <TelemetryLabel>{footer.tagline}</TelemetryLabel>
            <p className="text-small text-mute">{footer.disclaimer}</p>
          </div>
          <nav className="flex flex-col gap-3" aria-label="Footer">
            {footer.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="font-mono text-caption uppercase tracking-[0.12em] text-ink-dim transition-colors hover:text-accent"
              >
                {l.label}
              </a>
            ))}
            <a
              href={`mailto:${footer.email}`}
              className="mt-2 font-mono text-caption uppercase tracking-[0.12em] text-accent"
            >
              {footer.email}
            </a>
          </nav>
        </div>
      </Container>

      {/* oversized wordmark */}
      <Reveal className="select-none px-4">
        <div className="flex flex-col items-center leading-[0.74]">
          <span className="bg-gradient-to-b from-ink/25 to-ink/5 bg-clip-text font-display text-[22vw] font-extrabold tracking-[-0.05em] text-transparent">
            Fuel
          </span>
          <span className="bg-gradient-to-b from-ink/20 to-ink/[0.04] bg-clip-text font-display text-[10.5vw] font-extrabold uppercase tracking-[0.06em] text-transparent">
            The Season
          </span>
        </div>
      </Reveal>

      <Container className="flex flex-col items-center justify-between gap-3 border-t border-border py-6 font-mono text-caption uppercase tracking-[0.12em] text-mute sm:flex-row">
        <span>{footer.built}</span>
        <span>{footer.colophon}</span>
        <span>© {new Date().getFullYear()} {site.name}</span>
      </Container>
    </footer>
  );
}
