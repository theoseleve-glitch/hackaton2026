import { Section, Container } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <Section className="flex min-h-[100svh] items-center overflow-hidden">
      {/* atmospheric gridlines + volt glow */}
      <div
        aria-hidden
        className="gridlines pointer-events-none absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(120%_90%_at_50%_30%,#000_30%,transparent_75%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[20%] h-[420px] w-[820px] max-w-[120vw] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]"
      />

      <Container className="relative">
        <div className="flex flex-col items-start gap-8">
          {/* telemetry: status line */}
          <div className="flex items-center gap-3 font-mono text-caption uppercase tracking-[0.16em] text-mute">
            <span className="text-danger">ERR 404</span>
            <span aria-hidden className="h-px w-10 bg-border" />
            <span>NO TELEMETRY ON THIS LAP</span>
          </div>

          <h1 className="font-display text-display-lg leading-[0.9] tracking-[-0.04em] text-ink sm:text-display-xl">
            <span className="block">Off the track.</span>
            <span className="block text-ink-dim">This page never made the grid.</span>
          </h1>

          <p className="max-w-[48ch] text-body text-ink-dim">
            The route you were chasing doesn&apos;t exist — or it got pulled before the green
            flag. Head back to the pit lane and pick a clean line.
          </p>

          {/* the → conversion: gone → home */}
          <div className="flex w-full max-w-[420px] items-center gap-4 border-t border-border pt-6 font-mono text-caption uppercase tracking-[0.14em]">
            <span className="text-mute line-through decoration-mute/50">Lost lap</span>
            <span aria-hidden className="text-accent">
              →
            </span>
            <span className="text-ink">Back on pace</span>
          </div>

          <Button href="/">Back to the pit lane</Button>
        </div>
      </Container>
    </Section>
  );
}
