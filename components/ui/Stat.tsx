import { cn } from "@/lib/utils";

/** A big telemetry readout: oversized mono value + a quiet label. */
export function Stat({
  value,
  label,
  className,
  valueClassName,
}: {
  value: React.ReactNode;
  label: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span
        className={cn(
          "font-mono text-display-lg font-medium leading-none tracking-tight text-ink tabular",
          valueClassName,
        )}
      >
        {value}
      </span>
      <span className="text-small text-mute">{label}</span>
    </div>
  );
}
