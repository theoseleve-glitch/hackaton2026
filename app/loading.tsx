export default function Loading() {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-paper">
      {/* keyframes scoped here; honours prefers-reduced-motion via the media query below */}
      <style>{`
        @keyframes backed-stage {
          0%   { width: 4%; }
          55%  { width: 72%; }
          80%  { width: 88%; }
          100% { width: 96%; }
        }
        @keyframes backed-sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(280%); }
        }
        .backed-bar { animation: backed-stage var(--duration-cinematic, 1100ms) var(--ease-out-expo, cubic-bezier(0.16,1,0.3,1)) forwards; }
        .backed-sweep { animation: backed-sweep 1.1s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .backed-bar { animation: none; width: 96%; }
          .backed-sweep { animation: none; opacity: 0; }
        }
      `}</style>

      {/* faint engineering gridlines */}
      <div
        aria-hidden
        className="gridlines pointer-events-none absolute inset-0 opacity-[0.4] [mask-image:radial-gradient(120%_90%_at_50%_50%,#000_20%,transparent_70%)]"
      />

      <div
        role="status"
        aria-live="polite"
        className="relative flex w-[min(420px,82vw)] flex-col items-start gap-5"
      >
        <div className="flex w-full items-center justify-between font-mono text-caption uppercase tracking-[0.16em] text-mute">
          <span className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Warming the engine…
          </span>
          <span className="tabular text-mute">FUEL THE SEASON</span>
        </div>

        {/* volt-lime progress bar with a moving sweep */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface">
          <div className="backed-bar relative h-full rounded-full bg-accent">
            <span
              aria-hidden
              className="backed-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-paper/60 to-transparent"
            />
          </div>
        </div>

        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
