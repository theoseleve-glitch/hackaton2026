"use client";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { magneticOffset } from "@/components/ui/magnetic";
import { useReducedMotion } from "@/lib/useReducedMotion";

export const APP_STORE_URL = "https://apps.apple.com/app/idTODO";   // TODO real
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=TODO"; // TODO real

function MagneticWrap({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => () => { tweenRef.current?.kill(); }, []);

  const move = (e: React.MouseEvent) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const { x, y } = magneticOffset(e.clientX, e.clientY, r, 0.4);
    tweenRef.current?.kill();
    tweenRef.current = gsap.to(ref.current, { x, y, duration: 0.4, ease: "power3.out" });
  };

  const reset = () => {
    if (!ref.current) return;
    tweenRef.current?.kill();
    tweenRef.current = gsap.to(ref.current, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1,0.4)" });
  };

  return (
    <span ref={ref} onMouseMove={move} onMouseLeave={reset} style={{ display: "inline-block" }}>
      {children}
    </span>
  );
}

function AppleGlyph() {
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M16.498 12.793c-.025-2.944 2.4-4.368 2.51-4.438-1.374-2.008-3.508-2.283-4.258-2.307-1.8-.183-3.528 1.07-4.44 1.07-.916 0-2.31-1.05-3.804-1.02-1.94.03-3.74 1.133-4.737 2.857-2.034 3.52-.518 8.706 1.45 11.556.97 1.396 2.112 2.96 3.612 2.903 1.457-.06 2.002-.934 3.762-.934 1.757 0 2.262.934 3.79.9 1.565-.026 2.552-1.41 3.51-2.814a14.75 14.75 0 0 0 1.6-3.26c-.036-.014-3.065-1.172-3.095-4.513ZM13.613 4.04C14.42 3.068 14.966 1.726 14.82.35 13.658.407 12.24 1.145 11.4 2.098c-.752.84-1.415 2.21-1.238 3.512 1.3.1 2.632-.66 3.45-1.57Z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="21" height="24" viewBox="0 0 21 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M1.22 0 12.58 11.36.5 23.44A2 2 0 0 1 0 22V2C0 .88.46.12 1.22 0Z" fill="#EA4335" />
      <path d="M16.9 8.1 13.94 5.14 12.58 6.5 18.36 12.28l2.58-1.49a1.5 1.5 0 0 0 0-2.6L16.9 8.1Z" fill="#FBBC04" />
      <path d="m12.58 11.36 1.36 1.36-3.44 3.44-1.36-1.36 3.44-3.44Z" fill="#4285F4" />
      <path d="M1.22 24c.22.14.46.22.72.22.42 0 .84-.12 1.22-.34l10.42-6.02-2.6-2.6L1.22 24Z" fill="#34A853" />
    </svg>
  );
}

export default function StoreBadge({ store, href }: { store: "ios" | "android"; href: string }) {
  const label = store === "ios" ? "Télécharger sur l'App Store" : "Disponible sur Google Play";
  const eyebrow = store === "ios" ? "Télécharger sur" : "Disponible sur";
  const storeName = store === "ios" ? "App Store" : "Google Play";

  return (
    <MagneticWrap>
      <a
        href={href}
        aria-label={label}
        data-cursor-hover
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 20px",
          borderRadius: 14,
          background: "var(--brown)",
          color: "var(--surface)",
          textDecoration: "none",
          minWidth: 180,
          border: "1.5px solid rgba(255,252,245,0.12)",
        }}
      >
        {store === "ios" ? <AppleGlyph /> : <PlayGlyph />}
        <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7, lineHeight: 1.2, fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
            {eyebrow}
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
            {storeName}
          </span>
        </span>
      </a>
    </MagneticWrap>
  );
}
