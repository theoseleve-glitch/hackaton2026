import Counter from "@/components/ui/Counter";

// TODO: confirm final stat figures with product

const STATS = [
  {
    id: "haltes",
    counter: <Counter to={560} suffix="+" />,
    label: "haltes référencées en France",
    ariaLabel: "560+ haltes référencées en France",
  },
  {
    id: "horaires",
    counter: null, // non-numeric — rendered as Fraunces text below
    label: "marchés & producteurs, pas des suppositions",
    ariaLabel: "Horaires réels — marchés & producteurs, pas des suppositions",
  },
  {
    id: "peages",
    counter: <Counter to={100} suffix=" %" />,
    label: "des péages calculés, France entière",
    ariaLabel: "100 % des péages calculés, France entière",
  },
  {
    id: "pub",
    counter: <Counter to={0} suffix="" />,
    label: "pub déguisée en reco. Le sponsorisé est toujours dit.",
    ariaLabel: "0 pub déguisée en reco. Le sponsorisé est toujours dit.",
  },
] as const;

export default function Stats() {
  return (
    <section
      aria-label="Chiffres clés"
      style={{
        background: "var(--cream-deep)",
        padding: "clamp(64px, 10vw, 112px) clamp(24px, 5vw, 80px)",
      }}
    >
      {/* Header */}
      <span className="eyebrow">CE QU&rsquo;IL Y A SOUS LE CAPOT</span>
      <h2
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: "clamp(28px, 5vw, 56px)",
          color: "var(--brown)",
          lineHeight: 1.15,
          marginTop: "0.5em",
          marginBottom: "clamp(40px, 6vw, 72px)",
          maxWidth: "26ch",
        }}
      >
        Du sérieux sous la douceur.
      </h2>

      {/* Stats grid */}
      <div className="stats-grid">
        {STATS.map((stat) => (
          <div key={stat.id} className="stat-item" aria-label={stat.ariaLabel}>
            {/* Number / text — hidden from screen readers; aria-label on container conveys the full fact */}
            <div className="stat-number" aria-hidden="true">
              {stat.id === "horaires" ? (
                <span
                  style={{
                    fontFamily: "Fraunces, serif",
                    fontSize: "clamp(40px, 7vw, 84px)",
                    color: "var(--clay)",
                    lineHeight: 1,
                    fontWeight: 400,
                  }}
                >
                  Réels
                </span>
              ) : (
                stat.counter
              )}
            </div>
            {/* Label */}
            <p className="stat-label" aria-hidden="true">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Scoped styles */}
      <style>{`
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: clamp(24px, 4vw, 56px);
          align-items: start;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .stat-number {
          font-family: Fraunces, serif;
          font-size: clamp(40px, 7vw, 84px);
          color: var(--clay);
          line-height: 1;
          font-weight: 400;
        }

        .stat-label {
          font-family: Inter, sans-serif;
          font-size: clamp(13px, 1.2vw, 15px);
          color: var(--taupe);
          line-height: 1.55;
          margin: 0;
          max-width: 20ch;
        }

        /* Tablet: 2 columns */
        @media (max-width: 900px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        /* Mobile: 1 column */
        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Reduced motion: counters already handle their own behavior;
           no transform/opacity animations on the grid items themselves */
        @media (prefers-reduced-motion: reduce) {
          .stat-item {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}
