/**
 * FUEL THE SEASON — all site copy lives here, typed and brand-voiced.
 * Voice: direct, paddock-native, commercially sharp. No startup fluff.
 * Brand: Fuel the Season · Tagline: Turn performance into sponsor money.
 * Functional line: The athlete pitch, rebuilt for the sponsor era.
 * Forbidden: empower, seamless, unlock, revolutionize, AI-powered (as a slogan),
 * game-changing, next-generation, democratize, "beautiful portfolio website".
 */

export type Cta = { label: string; href: string };
export type SpecRow = { k: string; v: string };
export type Stat = { value: string; label: string };
export type Tier = {
  name: string;
  price: string;
  note?: string;
  lines: string[];
  featured?: boolean;
};
export type NumberedItem = { title: string; body: string; tag?: string };

export const site = {
  name: "Fuel the Season",
  tagline: "Turn performance into sponsor money.",
  oneLine:
    "Fuel the Season turns an athlete's results, story and funding goal into a sponsor-ready website, media kit and outreach campaign — built to raise the money to compete.",
  url: "https://fueltheseason.com",
  email: "hello@fueltheseason.com",
  micDrop: "Build the athlete pitch. Raise the season.",
};

export const nav = {
  brand: "Fuel the Season",
  links: [
    { label: "Insight", href: "#insight" },
    { label: "Product", href: "#product" },
    { label: "Example kit", href: "#example-kit" },
    { label: "48h plan", href: "#sprint" },
    { label: "Numbers", href: "#economics" },
  ] as Cta[],
  cta: { label: "See the live example kit", href: "#example-kit" } as Cta,
};

export const hero = {
  eyebrow: "THE ATHLETE PITCH · REBUILT FOR THE SPONSOR ERA",
  headlineLines: ["Your season should not", "die in a bad", "sponsor deck."],
  subhead: "Turn performance into sponsor money.",
  support:
    "Fuel the Season turns an athlete's results, story and funding goal into a sponsor-ready website, media kit and outreach campaign — built to raise the money to compete.",
  proofLine: "First athletes go live this weekend.",
  primaryCta: { label: "See the live example kit", href: "#example-kit" } as Cta,
  secondaryCta: { label: "View the 48-hour sales plan", href: "#sprint" } as Cta,
  before: {
    label: "WHAT A SPONSOR GETS TODAY",
    items: ["Word-doc deck", "Dead Instagram bio", "Logo-on-shirt promise"],
  },
  after: {
    label: "WHAT FUEL THE SEASON SHIPS",
    items: ["Sponsor-ready page", "PDF media kit", "Outreach pack"],
  },
};

export const insight = {
  eyebrow: "THE BOTTLENECK",
  headline: "Talent doesn't lose. Presentation does.",
  body: "A driver can spend €15,000 chasing a season, then pitch sponsors with a weak PDF and a logo on a shirt. The bottleneck isn't performance. It's commercial presentation.",
  keyline:
    "Athletes don't lose sponsorship for a lack of talent. They lose because they can't package their value commercially — they have the results, but they can't sell the story.",
  stats: [
    { value: "€15k", label: "burned chasing a single season" },
    { value: "1 PDF", label: "the average sponsor pitch" },
    { value: "0", label: "ROI a logo-on-a-shirt argues" },
  ] as Stat[],
};

export const firstCustomer = {
  eyebrow: "CUSTOMER 001",
  headline: "Start with Jules.",
  body: "Jules Pirzadeh needs money to move from rental karting to a full owner-kart season. He's exactly who Fuel the Season is built for: fast, ambitious, financially stretched — and not a marketing professional.",
  spec: [
    { k: "Target", v: "Young karting drivers changing categories" },
    { k: "Buyer", v: "The parent. The athlete signs off." },
    { k: "Trigger", v: "Rental → owner kart. The budget jumps." },
    { k: "Today", v: "Weak documents and a manual sponsor hunt" },
  ] as SpecRow[],
};

export const product = {
  eyebrow: "THE OUTPUT",
  headline: "One intake. One sponsor-ready campaign.",
  line: "Fuel the Season isn't the page. It's the whole sponsor-conversion system around the athlete.",
  outputs: [
    { title: "Premium sponsor website", body: "A page that argues reach, ROI and credibility — not just looks." },
    { title: "PDF media kit", body: "Downloadable and send-ready, built to be forwarded inside a company." },
    { title: "Athlete story & positioning", body: "The narrative a sponsor can repeat to their boss." },
    { title: "Sponsor packages", body: "Named tiers that spell out what the brand actually gets." },
    { title: "Outreach emails & DMs", body: "Copy-paste scripts for warm contacts and cold ones." },
    { title: "Sponsor target list", body: "A starter hit-list of local businesses that fit the driver." },
    { title: "Inquiry CTA + form", body: "One unmistakable way for a sponsor to say yes." },
    { title: "Visibility & follow-up report", body: "A data-backed ROI report after every event.", tag: "The wedge" },
  ] as NumberedItem[],
};

export const exampleKit = {
  eyebrow: "LIVE EXAMPLE",
  headline: "This is what a sponsor receives.",
  body: "Not a mockup. A working sponsor page for Jules — results, audience, packages, and a way to say yes. Open it the way a brand would.",
  cta: { label: "Open Jules' sponsor page", href: "/kit/jules" } as Cta,
  previewStats: [
    { value: "P2", label: "regional championship" },
    { value: "€18k", label: "season goal" },
    { value: "3", label: "sponsor tiers" },
  ] as Stat[],
};

export const competitors = {
  eyebrow: "THE MARKET",
  headline: "Every alternative solves the wrong layer.",
  rows: [
    { k: "Wix · Framer · Squarespace", v: "Build pages. Not a sponsorship argument." },
    { k: "Canva · Etsy templates", v: "Look better. Stay generic." },
    { k: "Marketing agencies", v: "€1,000–5,000, and they don't know the paddock." },
    { k: "Sponsorship marketplaces", v: "Passive. They wait to be discovered." },
  ] as SpecRow[],
  us: { k: "Fuel the Season", v: "Builds the campaign you can send tonight — and proves the ROI." } as SpecRow,
  keyline: "Templates make you look better. Fuel the Season helps you ask better.",
};

export const sprint = {
  eyebrow: "THIS WEEKEND",
  headline: "Right now it isn't SaaS. It's a productized service.",
  tiers: [
    { name: "Starter", price: "€49", lines: ["Live sponsor page", "Copy-paste outreach script"] },
    {
      name: "Full",
      price: "€99",
      lines: ["Page + PDF media kit", "3 sponsor packages", "10 outreach messages", "Target list"],
      featured: true,
    },
    { name: "Premium", price: "€199", lines: ["Everything in Full", "A working call", "Revisions"] },
  ] as Tier[],
  execution: [
    "Build one premium template",
    "Ship our own live example kit",
    "Wire Stripe payment links",
    "DM warm athletes and parents",
    "Sell the preview, collect, deliver",
  ],
  target: {
    line: "17 warm prospects → free-preview DMs → €49 to keep. ~3 sales, €150–300 this weekend.",
    steps: [
      { value: "17", label: "warm prospects" },
      { value: "6", label: "replies" },
      { value: "3", label: "sales" },
      { value: "€150–300", label: "collected" },
    ] as Stat[],
  },
  cta: { label: "Get sponsor-ready this weekend", href: "/kit/jules" } as Cta,
};

export const roadmap = {
  eyebrow: "THE ENGINE",
  headline: "Manual first. SaaS second.",
  timeline: [
    { k: "Phase 0 · this weekend", v: "Wizard-of-Oz: real product, manual delivery, real sales." },
    { k: "Phase 1 · weeks 1–4", v: "Semi-automated pipeline. Under 30 minutes a kit." },
    { k: "Phase 2 · months 2–3", v: "Self-serve MVP + subscriptions. Founder out of the loop." },
    { k: "Phase 3 · months 4–6", v: "The sponsorship OS: outreach tracker, page analytics, follow-up." },
    { k: "Phase 4 · month 6+", v: "Club & academy B2B2C, federation partnerships, more sports." },
  ] as SpecRow[],
  stack: [
    "Next.js + Tailwind",
    "Vercel / Cloudflare Pages",
    "Tally / Typeform intake",
    "Stripe payment links",
    "Claude · GPT · Gemini generation",
    "HTML-to-PDF media kit",
    "Later: Supabase",
  ],
};

export const economics = {
  eyebrow: "THE NUMBERS",
  headline: "≈ 94% gross margin — and it holds at scale.",
  cogsLine:
    "Per kit: AI ~€0.20 (≈0.3% of price); all-in COGS ~€1–1.75 including Stripe. Pages are static and serve for almost nothing; AI fires only on generation.",
  marginNow: { value: "94%", label: "gross margin per kit, before founder time" },
  medium: {
    pricing: "€99 setup + €15 / month",
    revenuePerCustomer: "€99 + 12 × €15 = €279 in year one",
    costPerCustomer: "€15–30 / customer / year",
    marginScale: { value: "~94%", label: "margin holds at 100 / 1,000 / 10,000 users" },
  },
  scale: [
    { value: "€27.9k", label: "100 customers / year" },
    { value: "€279k", label: "1,000 customers / year" },
    { value: "€1.4M", label: "5,000 customers / year" },
  ] as Stat[],
  caveat:
    "Our biggest variable cost is Stripe, not AI. The real constraint at scale is CAC and support, never infrastructure — and CAC and churn are unknown until the contact rounds tell us who pays, how fast, and at what price.",
};

export const gtm = {
  eyebrow: "THE CONTACT PLAN",
  headline: "Acquisition starts in the paddock.",
  channels: [
    "The founder's motorsport network",
    "Karting parents in IG & FB groups",
    "DMs to drivers with a visible funding need",
    "Before/after short-form clips",
    "'How to get karting sponsors' SEO",
    "Karting teams, clubs & coaches",
  ],
  hitlist: [
    "17 named prospects from the founder's grid",
    "Drivers moving up a category",
    "Parents already posting their kid's racing",
    "Sim racers chasing a real seat",
    "Swimmers, triathletes, fighters with traction but a weak pitch",
  ],
  outreachScript:
    "I'm building live sponsor-kit previews for a few drivers tonight. If I make one for you, want to see it tomorrow? If you love it, it's €49 and yours to send to sponsors.",
  hotLead: "€49, I build it tonight, it's live tomorrow. Send me your results and photos.",
};

export const founder = {
  eyebrow: "FOUNDER–MARKET FIT",
  headline: "I built it on myself.",
  body: "I'm Théo Stipa — 22, from Nantes, the engineer in the cockpit. I came to racing through science and precision, took a podium in both championships as a rookie, and I'm building the analytics that prove sponsor ROI. I know this problem because I'm living it: chasing my own budget, on the grid, P2 in my championship.",
  line: "A marketing agency sees an athlete. I see the exact reason the sponsor pitch fails.",
};

export const closing = {
  eyebrow: "THE ASK",
  headline: "Raise your season.",
  body: "Every talented athlete is underfunded for one reason: they couldn't sell their story. Fuel the Season fixes that — turning performance into sponsor money. We start with young motorsport drivers, where the pain is immediate and the founder is the customer. This weekend we sell the manual version. If people pay, we automate the engine.",
  primaryCta: { label: "See the live example kit", href: "#example-kit" } as Cta,
  proofLine: "First athletes go live this weekend.",
};

export const footer = {
  wordmark: "Fuel the Season",
  tagline: site.tagline,
  micDrop: site.micDrop,
  disclaimer:
    "Fuel the Season helps athletes build professional sponsorship materials and outreach. It does not guarantee sponsor acquisition.",
  colophon: "Typeset in Archivo & JetBrains Mono. Built with Next.js, Tailwind & Framer Motion.",
  built: "Built from the paddock · 2026",
  links: nav.links,
  email: site.email,
};

/* ───────────────────────── /kit/jules — the live example sponsor page ───────────────────────── */

export const kit = {
  athlete: {
    name: "Jules Pirzadeh",
    number: "27",
    discipline: "Karting · Senior Rotax",
    region: "Nantes, France",
    age: "16",
    eyebrow: "SPONSOR-READY · SEASON 2026",
  },
  hero: {
    headline: "Back a driver before the world knows his name.",
    sub: "Senior Rotax karting. Two seasons, fourteen podiums, one missing piece: the budget to run a full owner-kart championship.",
    primaryCta: { label: "Back Jules this season", href: "#packages" } as Cta,
    secondaryCta: { label: "Download the media kit", href: "#contact" } as Cta,
  },
  stats: [
    { value: "P2", label: "2025 regional championship" },
    { value: "14", label: "podiums in 22 races" },
    { value: "1:02.4", label: "lap record, Circuit de l'Ouest" },
    { value: "16", label: "years old" },
  ] as Stat[],
  goal: {
    eyebrow: "THE ASK",
    headline: "€18,000 funds the full season.",
    body: "Not a wishlist. A season budget broken down the way a race engineer would — every line is a number a sponsor can see working.",
    breakdown: [
      { k: "Chassis & engine", v: "€7,200" },
      { k: "Race entries (12 rounds)", v: "€4,300" },
      { k: "Tyres", v: "€3,100" },
      { k: "Travel & logistics", v: "€2,400" },
      { k: "Coaching & data", v: "€1,000" },
    ] as SpecRow[],
    total: { k: "Full season", v: "€18,000" } as SpecRow,
  },
  audience: {
    eyebrow: "WHAT A BRAND GETS",
    headline: "Reach a local brand can actually use.",
    body: "Karting isn't a TV sport — it's a community one. That's the point. A sponsor on Jules' kart shows up in front of the exact people a regional business wants.",
    stats: [
      { value: "12", label: "race weekends, 6 circuits" },
      { value: "8,400", label: "trackside spectators / season" },
      { value: "11k", label: "followers across IG & TikTok" },
      { value: "3", label: "regional press features in 2025" },
    ] as Stat[],
  },
  story: {
    eyebrow: "THE STORY",
    headline: "From a rental kart to a championship fight.",
    paragraphs: [
      "Jules started in rental karting at twelve, beating drivers with twice his track time. By fifteen he was on the regional podium against owner-kart teams with real budgets behind them.",
      "2026 is the step up: a full owner-kart season in Senior Rotax. The talent is there — fourteen podiums in twenty-two races says so. What's missing is the budget that the kids he beats already have.",
      "Back him now and you're not buying a logo spot. You're on the kart while the story is still being written.",
    ],
  },
  packages: {
    eyebrow: "SPONSOR PACKAGES",
    headline: "Three ways to be on the kart.",
    tiers: [
      {
        name: "Nosecone",
        price: "€500",
        note: "season",
        lines: ["Logo on the kart nose", "4 social posts tagging your brand", "Name on the media kit"],
      },
      {
        name: "Sidepod",
        price: "€1,500",
        note: "season",
        lines: [
          "Premium kart placement + helmet",
          "Monthly content featuring your brand",
          "Named in every press release",
          "A framed end-of-season recap",
        ],
        featured: true,
      },
      {
        name: "Title Partner",
        price: "€5,000",
        note: "season",
        lines: [
          "Title placement on kart + race suit",
          "Co-branded content all season",
          "Two appearances at your events",
          "First right of renewal next year",
        ],
      },
    ] as Tier[],
  },
  contact: {
    eyebrow: "SAY YES",
    headline: "Put your brand on the kart.",
    body: "Tell Jules which package fits. He replies the same day — and the media kit lands in your inbox.",
    fields: { name: "Your name", company: "Company", message: "Which package interests you?" },
    submit: "Send to Jules",
    success: "Sent. Jules will reply today with the media kit. (This is a Fuel the Season demo — no email actually leaves.)",
  },
  disclaimer:
    "Jules Pirzadeh is a fictionalized athlete built to demonstrate Fuel the Season. Results, numbers and imagery are illustrative.",
  poweredBy: { label: "Made with Fuel the Season", href: "/" } as Cta,
};
