import { cn } from "@/lib/utils";

/** Fuel-gauge mark: three ascending bars, empty → full, in fuel orange. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-5 w-auto text-accent", className)}
      fill="currentColor"
      aria-hidden
    >
      <rect x="2" y="15" width="4" height="7" rx="0.5" />
      <rect x="10" y="9" width="4" height="13" rx="0.5" />
      <rect x="18" y="3" width="4" height="19" rx="0.5" />
    </svg>
  );
}

/** Full wordmark: fuel-gauge mark + "Fuel the Season". */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-h3 font-extrabold tracking-[-0.02em] text-ink">
        Fuel<span className="text-mute"> the </span>Season
      </span>
    </span>
  );
}
