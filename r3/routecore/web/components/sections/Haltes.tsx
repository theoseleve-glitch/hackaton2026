import Reveal from "@/components/ui/Reveal";

/* ─── Category data ──────────────────────────────────────────────────────── */

const CATEGORIES = [
  {
    id: "producteurs",
    title: "Producteurs",
    desc: "Fromages, miel, légumes — directement chez ceux qui les font.",
    color: "var(--olive)",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M14 4C14 4 8 8 8 14a6 6 0 0012 0c0-6-6-10-6-10z" fill="var(--olive)" opacity=".18" />
        <path d="M14 4C14 4 8 8 8 14a6 6 0 0012 0c0-6-6-10-6-10z" stroke="var(--olive)" strokeWidth="1.5" fill="none" />
        <line x1="14" y1="14" x2="14" y2="24" stroke="var(--olive)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="10" y1="18" x2="14" y2="16" stroke="var(--olive)" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
    // asymmetry: slight upward offset on desktop
    offset: "-24px",
  },
  {
    id: "marches",
    title: "Marchés",
    desc: "Les vrais, ceux du matin, avec les horaires qui vont avec.",
    color: "var(--gold)",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="6" y="14" width="16" height="9" rx="2" fill="var(--gold)" opacity=".18" />
        <rect x="6" y="14" width="16" height="9" rx="2" stroke="var(--gold)" strokeWidth="1.5" />
        <path d="M4 14h20M10 14V9a4 4 0 018 0v5" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    offset: "0px",
  },
  {
    id: "villages",
    title: "Villages",
    desc: "Les beaux détours de pierre, à dix minutes de ta route.",
    color: "var(--clay)",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M14 5l7 8H7l7-8z" fill="var(--clay)" opacity=".18" />
        <path d="M14 5l7 8H7l7-8z" stroke="var(--clay)" strokeWidth="1.5" strokeLinejoin="round" />
        <rect x="11" y="13" width="6" height="10" rx="1" fill="var(--clay)" opacity=".12" stroke="var(--clay)" strokeWidth="1.5" />
      </svg>
    ),
    offset: "16px",
  },
  {
    id: "points-de-vue",
    title: "Points de vue",
    desc: "Là où on s'arrête juste pour regarder.",
    color: "var(--mist)",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <circle cx="14" cy="13" r="5" fill="var(--mist)" opacity=".18" stroke="var(--mist)" strokeWidth="1.5" />
        <circle cx="14" cy="13" r="2" fill="var(--mist)" />
        <path d="M4 13h4M20 13h4M14 3v4M14 22v3" stroke="var(--mist)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    offset: "-8px",
  },
  {
    id: "bonnes-tables",
    title: "Bonnes tables",
    desc: "Manger bien, sans se tromper, sur le chemin.",
    color: "var(--clay)",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M10 6v7a4 4 0 008 0V6" stroke="var(--clay)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="14" y1="17" x2="14" y2="23" stroke="var(--clay)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="11" y1="23" x2="17" y2="23" stroke="var(--clay)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="9" r="1.5" fill="var(--clay)" />
        <circle cx="18" cy="9" r="1.5" fill="var(--clay)" />
      </svg>
    ),
    offset: "32px",
  },
  {
    id: "nature",
    title: "Nature",
    desc: "Cascades, forêts, sentiers — une respiration verte.",
    color: "#587A3A",
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M14 4L6 16h5v8h6v-8h5L14 4z" fill="#587A3A" opacity=".18" stroke="#587A3A" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    offset: "0px",
  },
] as const;

/* ─── Single card ─────────────────────────────────────────────────────────── */

function HalteCard({
  title,
  desc,
  color,
  icon,
  offset,
  revealY,
}: {
  title: string;
  desc: string;
  color: string;
  icon: React.ReactNode;
  offset: string;
  revealY: number;
}) {
  return (
    <div className="halte-card-reveal" style={{ "--card-offset": offset } as React.CSSProperties}>
    <Reveal y={revealY}>
      <article
        className="halte-card"
        data-cursor-hover
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--border)",
          borderRadius: 20,
          padding: "clamp(20px, 3vw, 32px)",
          boxShadow: "0 1px 2px rgba(43,33,28,.04), 0 8px 24px rgba(43,33,28,.08)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          position: "relative",
          overflow: "hidden",
          // Accent left border
          borderLeft: `3px solid ${color}`,
          transition: "transform 200ms ease, box-shadow 200ms ease",
        }}
      >
        {/* Icon */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flexShrink: 0 }}>{icon}</span>
          <h3
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "clamp(17px, 2vw, 21px)",
              color: "var(--brown)",
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {title}
          </h3>
        </div>

        {/* Description */}
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "0.9rem",
            color: "var(--taupe)",
            lineHeight: 1.65,
            margin: 0,
          }}
        >
          {desc}
        </p>
      </article>
    </Reveal>
    </div>
  );
}

/* ─── Section ─────────────────────────────────────────────────────────────── */

export default function Haltes() {
  return (
    <section
      aria-label="Les haltes"
      style={{
        background: "var(--cream)",
        padding: "clamp(64px, 10vw, 112px) clamp(24px, 5vw, 80px)",
      }}
    >
      {/* Intro */}
      <Reveal y={30}>
        <span className="eyebrow">LES HALTES</span>
        <h2
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: "clamp(28px, 5vw, 56px)",
            color: "var(--brown)",
            lineHeight: 1.15,
            marginTop: "0.5em",
            marginBottom: "0.35em",
            maxWidth: "22ch",
          }}
        >
          Tout ce qui vaut un détour.
        </h2>
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "clamp(15px, 1.5vw, 18px)",
            color: "var(--taupe)",
            lineHeight: 1.65,
            maxWidth: "44ch",
            marginBottom: "clamp(40px, 6vw, 72px)",
          }}
        >
          Sur ta route, jamais à l'autre bout du pays.
        </p>
      </Reveal>

      {/* Grid */}
      <div className="haltes-grid">
        {CATEGORIES.map((cat, i) => (
          <HalteCard
            key={cat.id}
            title={cat.title}
            desc={cat.desc}
            color={cat.color}
            icon={cat.icon}
            offset={cat.offset}
            revealY={20 + (i % 3) * 12}
          />
        ))}
      </div>

      {/* Scoped styles */}
      <style>{`
        /* Desktop: asymmetric 3-column grid with per-card vertical offsets */
        @media (min-width: 769px) {
          .haltes-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: clamp(16px, 2.5vw, 28px);
            align-items: start;
          }
          /* Apply the per-card offset via CSS custom property */
          .halte-card-reveal {
            transform: translateY(var(--card-offset, 0px));
          }
          /* Card 1 (Producteurs, col 1) — first card spans a bit taller visually */
          .haltes-grid > :nth-child(1) .halte-card {
            padding-bottom: clamp(28px, 4vw, 44px);
          }
          /* Card 5 (Bonnes tables) pushed down extra in the second row */
          .haltes-grid > :nth-child(5) {
            grid-column: 2;
          }
        }

        /* Tablet: 2 columns, no offsets */
        @media (min-width: 480px) and (max-width: 768px) {
          .haltes-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }
          .halte-card-reveal {
            transform: none !important;
          }
        }

        /* Mobile: single column, no offsets */
        @media (max-width: 479px) {
          .haltes-grid {
            display: flex;
            flex-direction: column;
            gap: 14px;
          }
          .halte-card-reveal {
            transform: none !important;
          }
        }

        /* Hover lift — CSS only, transform+opacity only, no layout shift */
        .halte-card:hover,
        .halte-card:focus-within {
          transform: scale(1.02) translateY(-2px);
          box-shadow: 0 2px 4px rgba(43,33,28,.06), 0 16px 40px rgba(43,33,28,.13);
        }

        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .halte-card-reveal {
            transform: none !important;
          }
          .halte-card:hover,
          .halte-card:focus-within {
            transform: none;
          }
        }
      `}</style>
    </section>
  );
}
