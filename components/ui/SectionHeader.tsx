import { Reveal } from "@/components/motion/Reveal";
import { TelemetryLabel } from "./TelemetryLabel";
import { cn } from "@/lib/utils";

/** Eyebrow (telemetry) + display headline, consistent across sections. */
export function SectionHeader({
  index,
  eyebrow,
  title,
  className,
  titleClassName,
}: {
  index?: string;
  eyebrow: string;
  title: React.ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <Reveal>
        <TelemetryLabel index={index}>{eyebrow}</TelemetryLabel>
      </Reveal>
      <Reveal delay={0.06}>
        <h2
          className={cn(
            "max-w-[16ch] text-balance font-display text-display-lg text-ink",
            titleClassName,
          )}
        >
          {title}
        </h2>
      </Reveal>
    </div>
  );
}
