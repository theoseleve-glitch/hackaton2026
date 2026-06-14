import StoreBadge, { APP_STORE_URL, PLAY_STORE_URL } from "@/components/ui/StoreBadge";

// Minimal close: restate the brand line, offer the stores one last time, and
// keep the legal/nav anchors calm and out of the way.

const NAV = [
  { href: "#contenu", label: "Accueil" },
  { href: "#telecharger", label: "Télécharger" },
];

export default function Footer() {
  return (
    <footer
      aria-label="Pied de page"
      style={{
        background: "var(--brown)",
        color: "var(--surface)",
        padding: "clamp(56px, 9vw, 96px) clamp(24px, 6vw, 80px)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "clamp(32px, 6vw, 80px)",
          justifyContent: "space-between",
          alignItems: "flex-start",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div style={{ maxWidth: "22ch" }}>
          <p
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "clamp(22px, 3.5vw, 34px)",
              lineHeight: 1.2,
            }}
          >
            Le GPS des routes qui respirent.
          </p>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 14,
              color: "var(--border)",
              marginTop: 16,
            }}
          >
            Le détour est la destination.
          </p>
        </div>

        <nav aria-label="Navigation du pied de page" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {NAV.map((n) => (
            <a key={n.href} href={n.href} data-cursor-hover style={{ color: "var(--surface)", textDecoration: "none", fontFamily: "Inter, sans-serif", fontSize: 15 }}>
              {n.label}
            </a>
          ))}
          <a href="#" data-cursor-hover style={{ color: "var(--border)", textDecoration: "none", fontFamily: "Inter, sans-serif", fontSize: 15 }}>
            Mentions légales
          </a>
          <a href="#" data-cursor-hover style={{ color: "var(--border)", textDecoration: "none", fontFamily: "Inter, sans-serif", fontSize: 15 }}>
            Confidentialité
          </a>
        </nav>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <StoreBadge store="ios" href={APP_STORE_URL} />
          <StoreBadge store="android" href={PLAY_STORE_URL} />
        </div>
      </div>

      <p
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          color: "var(--taupe)",
          marginTop: "clamp(40px, 6vw, 72px)",
          maxWidth: 1200,
          marginInline: "auto",
        }}
      >
        © 2026 L&rsquo;Échappée.
      </p>
    </footer>
  );
}
