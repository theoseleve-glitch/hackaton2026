import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Backed — sponsor conversion for underfunded athletes.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Carbon #0a0b0a · volt-lime #c6ff3d · off-white #f2f4ed
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0a0b0a",
          padding: "72px 80px",
        }}
      >
        {/* faint engineering gridlines */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(to right, #1a1c18 1px, transparent 1px), linear-gradient(to bottom, #1a1c18 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            display: "flex",
          }}
        />

        {/* top: telemetry label with accent bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 8,
              backgroundColor: "#c6ff3d",
              display: "flex",
            }}
          />
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 24,
              letterSpacing: "0.16em",
              color: "#80857a",
              display: "flex",
            }}
          >
            BACKED — SPONSOR CONVERSION
          </div>
        </div>

        {/* headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            color: "#f2f4ed",
            fontWeight: 800,
            fontSize: 96,
            lineHeight: 0.95,
            letterSpacing: "-0.04em",
          }}
        >
          <span style={{ display: "flex" }}>Not a website builder.</span>
          <span style={{ display: "flex" }}>Not a template.</span>
          <span style={{ display: "flex", color: "#c6ff3d" }}>Not an agency.</span>
        </div>

        {/* baseline rule + conversion mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #262824",
            paddingTop: 28,
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 22,
              letterSpacing: "0.12em",
              color: "#c4c8bc",
              display: "flex",
            }}
          >
            RAW PERFORMANCE → SPONSOR-READY CAMPAIGN
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 22,
              letterSpacing: "0.12em",
              color: "#80857a",
              display: "flex",
            }}
          >
            backed.team
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
