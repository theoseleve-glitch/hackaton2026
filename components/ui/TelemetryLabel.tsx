import { cn } from "@/lib/utils";

/**
 * The recurring motif: a pit-wall readout label. A volt-lime marker + mono
 * uppercase text, optionally prefixed by a two-digit section index.
 */
export function TelemetryLabel({
  children,
  index,
  className,
  marker = true,
}: {
  children: React.ReactNode;
  index?: string;
  className?: string;
  marker?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-3 telemetry", className)}>
      {marker && <span aria-hidden className="h-2 w-2 shrink-0 bg-accent" />}
      {index && <span className="text-ink-dim">{index}</span>}
      {index && <span aria-hidden className="text-mute">/</span>}
      <span>{children}</span>
    </span>
  );
}
