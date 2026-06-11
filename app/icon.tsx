import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Charcoal square with a fuel-orange forward double-chevron ">>".
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#080807",
          color: "#ff5a1f",
          fontFamily: "monospace",
          fontWeight: 800,
          fontSize: 360,
          letterSpacing: "-0.08em",
          lineHeight: 1,
        }}
      >
        »
      </div>
    ),
    { ...size },
  );
}
