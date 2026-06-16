/** Dark pit-lane palette (DEV_PLAN design direction). */
export const colors = {
  bg: "#0E0F12",
  card: "#1A1C21",
  cardAlt: "#22252C",
  border: "#2E323B",
  text: "#ECEDEE",
  sub: "#9BA1A6",
  accent: "#FF5A26",
  accentSoft: "#3A2218",
  good: "#3DDC84",
  warn: "#FFB02E",
  /** label color that sits on top of an accent/coloured fill */
  onAccent: "#FFFFFF",
  /** medal / best-lap / "official" highlight */
  gold: "#FFD700",
  /** one consistent modal dim — use everywhere a sheet/overlay darkens the app */
  scrim: "rgba(14,15,18,0.85)",
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
