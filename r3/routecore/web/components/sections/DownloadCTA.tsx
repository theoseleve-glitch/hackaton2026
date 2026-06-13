import StoreBadge, { APP_STORE_URL, PLAY_STORE_URL } from "@/components/ui/StoreBadge";

export default function DownloadCTA() {
  return (
    <section
      id="telecharger"
      style={{
        minHeight: "100vh",
        background: "var(--clay)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(64px, 12vw, 140px) clamp(24px, 6vw, 80px)",
        textAlign: "center",
      }}
    >
      <p
        className="eyebrow"
        style={{ color: "rgba(255,252,245,0.65)", marginBottom: 24 }}
      >
        Disponible maintenant
      </p>

      <h2
        style={{
          fontSize: "clamp(36px, 7vw, 88px)",
          color: "var(--surface)",
          maxWidth: "14ch",
          marginBottom: 20,
          lineHeight: 1.05,
        }}
      >
        Ta prochaine échappée commence ici.
      </h2>

      <p
        style={{
          fontFamily: "var(--font-inter), system-ui, sans-serif",
          fontSize: "clamp(16px, 2vw, 20px)",
          color: "rgba(255,252,245,0.75)",
          marginBottom: 48,
          letterSpacing: "0.01em",
        }}
      >
        Gratuit. Sur iOS et Android.
      </p>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <StoreBadge store="ios" href={APP_STORE_URL} />
        <StoreBadge store="android" href={PLAY_STORE_URL} />
      </div>
    </section>
  );
}
