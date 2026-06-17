/** RaceLab premium-motorsport palette (brand v1 — flat, no chrome). See docs/superpowers/specs/2026-06-17-racelab-brand-identity-design.md */
export const colors = {
  bg: "#0B0C0E",
  card: "#16181C",
  cardAlt: "#20242B",
  border: "#2A2E35",
  text: "#ECEFF2",
  sub: "#8A9099",
  accent: "#E10600",
  accentSoft: "#2A0B0A",
  good: "#3DDC84",
  warn: "#FFB02E",
  /** brand steel — logo plate outline, machined hairlines, prominent dividers */
  steel: "#5B626C",
  /** label color that sits on top of an accent/coloured fill */
  onAccent: "#FFFFFF",
  /** medal / best-lap / "official" highlight */
  gold: "#FFD700",
  /** one consistent modal dim — use everywhere a sheet/overlay darkens the app */
  scrim: "rgba(11,12,14,0.85)",
  /** literal-contrast pair (QR codes, share-card text on light) */
  white: "#FFFFFF",
  black: "#000000",
};

export const radius = { sm: 4, md: 10, lg: 16, pill: 999 };

/** 4-pt spacing scale — paddings, gaps, margins all draw from this. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 14, xl: 18, xxl: 24 };

/** Elevation token for the few surfaces that float above the page. */
export const shadow = {
  pop: {
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
};
