// config.js — single source of truth. Swap BRAND in one place.
export const BRAND = "RaceLab"; // placeholder; public sign-off pending (candidate: GripLab)
export const LINKS = {
  trial: "https://griplab.app",
  account: "https://griplab.app",
};
export const NAV = [
  { label: "How it works", href: "#tune" },
  { label: "The loop", href: "#loop" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];
export const HERO = {
  eyebrow: "THE STRAVA OF RC RACING",
  headline: ["TUNE LESS.", "WIN MORE."],
  headlineVariants: [["GET", "DIALED."], ["STOP GUESSING", "YOUR SETUP."]],
  subhead: "Log every run. Get one grounded change from an AI race engineer that knows your track, your weather, and whether its advice actually worked.",
  ctaPrimary: { label: "Start free trial", href: LINKS.trial },
  ctaSecondary: { label: "See how it works", href: "#tune" },
};
export const PROBLEM = {
  eyebrow: "THE PROBLEM",
  heading: "40 tunable parameters. One question:",
  big: "What do I change?",
  body: "Camber, ride height, shock oil, diff, springs, wing. Most racers copy a fast guy's sheet and hope. The conditions that decide everything — surface, grip, weather — never make it into the advice.",
};
export const TUNE = {
  eyebrow: "TUNE IT LIVE",
  heading: "One change at a time.",
  caption: "Real setup values. Real cause and effect. The way a race engineer actually works — isolate one variable, see what it does.",
  steps: [
    { part: "Ride height", value: "-1.0 mm", note: "less body roll" },
    { part: "Camber", value: "-2.0°", note: "more grip mid-corner" },
    { part: "Shock oil", value: "+50 cSt rear", note: "calmer on power" },
    { part: "Wing", value: "+5°", note: "stable in the fast stuff" },
  ],
  explode: "See every part. Nothing hidden.",
};
export const ENGINEER = {
  eyebrow: "YOUR AI RACE ENGINEER",
  heading: "Strava tells you what you did. RaceLab tells you what to change.",
  report: [
    { k: "Diagnosis", v: "Car pushes mid-corner on power; rear feels planted." },
    { k: "Primary change", v: "Drop front ride height 1 mm — frees rotation on entry." },
    { k: "Secondary", v: "If it still pushes, soften front sway 0.2 mm." },
    { k: "Don't touch", v: "Diff and rear shocks are right for these conditions." },
    { k: "Expected", v: "Sharper turn-in, a touch more steering on throttle." },
    { k: "Driving tip", v: "Brake one car-length earlier into the hairpin; let it rotate." },
    { k: "Confidence", v: "High — matches HUDY rule 4.2 for high-grip blue groove." },
    { k: "Why", v: "Grounded in your last 3 runs + today's track temp and grip." },
  ],
  principles: [
    { t: "One change at a time", d: "Never a dump of five guesses. One ranked, reversible move." },
    { t: "Grounded or silent", d: "Every change cites a knowledge-base rule — or we say stick with what you have." },
    { t: "On-device. No signal needed", d: "Works in the pits with dead Wi-Fi. Zero API on the advice path." },
  ],
  duel: { before: "18.40", after: "18.06", delta: "-0.34s", label: "avg lap, before vs after one change" },
};
export const LOOP = {
  eyebrow: "THE LOOP",
  heading: "Every run makes the next one faster.",
  stations: [
    { n: "Race", d: "Transponder laps + conditions auto-captured." },
    { n: "Log", d: "Setup attached to the run, quick feedback, photos." },
    { n: "Engineer", d: "One grounded change to try, with the why." },
    { n: "Result", d: "Better / same / worse — the AI learns you." },
    { n: "Share", d: "Verified results attached; others fork it." },
  ],
  punchline: "Each logged run teaches the AI what actually works — a flywheel a static setup vault can never copy.",
};
export const FEATURES = {
  eyebrow: "THE APP",
  heading: "Built for the pit lane.",
  cards: [
    { t: "Garage", d: "Every car, every typology — nitro or electric, the sheet adapts." },
    { t: "Setup sheets", d: "Immutable versions. See exactly what changed vs the kit." },
    { t: "Tracks", d: "Corner-by-corner, surfaces, conditions, lap records." },
    { t: "Run log", d: "Log a run in under 10 seconds, trackside, offline." },
    { t: "Compare", d: "Two runs side by side: setup vs conditions vs tyres." },
    { t: "Engineer report", d: "The 8-part report, grounded in your history." },
    { t: "Race planner", d: "Time-first pit windows. Box at 5:50, not lap 14." },
    { t: "Speedhive", d: "Transponder laps import themselves. New run detected." },
  ],
};
export const PROOF = {
  eyebrow: "WHY IT'S DIFFERENT",
  heading: "The Strava of RC racing — but prescriptive.",
  rows: [
    { a: "Activity (ride/run)", b: "Race day, auto-created from timing data" },
    { a: "GPS trace", b: "Lap times + the setup sheet attached to the run" },
    { a: "Kudos", b: "Props — Dialed · Send it · Tough break" },
    { a: "Segments & leaderboards", b: "Per-track, per-class lap leaderboards" },
    { a: "Year in Review", b: "Season Wrapped" },
    { a: "— (no equivalent)", b: "An AI race engineer that tells you what to change" },
  ],
  punchline: "Strava is descriptive. RaceLab is prescriptive.",
  facts: ["100% on-device advice", "0 API calls on the advice path", "8-part engineer report", "Transponder-verified results"],
};
export const PRICING = {
  eyebrow: "PRICING",
  heading: "Start with 15 days free.",
  plans: [
    { name: "Monthly", price: "€9.99", per: "/ month", highlight: false },
    { name: "Annual", price: "€99.99", per: "/ year", highlight: true, badge: "2 months free" },
  ],
  note: "Create your account on the web — it's cheaper there (no app-store cut).",
  cta: { label: "Start your 15-day free trial", href: LINKS.trial },
};
export const FINAL = {
  heading: "Get dialed.",
  sub: "Your next run could be your fastest.",
  cta: { label: "Start your 15-day free trial", href: LINKS.trial },
};
export const FOOTER = {
  tagline: "On-device · grounded or silent · made by racers.",
  links: [
    { label: "How it works", href: "#tune" },
    { label: "Pricing", href: "#pricing" },
    { label: "griplab.app", href: LINKS.trial },
  ],
  legal: "Pre-launch.",
};
