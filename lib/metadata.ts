import type { Metadata } from "next";
import { site } from "./content";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Fuel the Season — turn performance into sponsor money",
    template: "%s · Fuel the Season",
  },
  description: site.oneLine,
  applicationName: "Fuel the Season",
  keywords: [
    "athlete sponsorship",
    "karting sponsors",
    "motorsport sponsorship",
    "sponsor media kit",
    "sponsorship campaign",
    "sponsor a driver",
    "raise my season",
  ],
  authors: [{ name: "Fuel the Season" }],
  creator: "Fuel the Season",
  openGraph: {
    type: "website",
    locale: "en",
    url: site.url,
    siteName: "Fuel the Season",
    title: "Not a website builder. Not a template. Not an agency.",
    description: site.oneLine,
  },
  twitter: {
    card: "summary_large_image",
    title: "Fuel the Season — turn performance into sponsor money",
    description: site.oneLine,
  },
  robots: { index: true, follow: true },
  category: "technology",
};

export const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Fuel the Season",
  description: site.oneLine,
  url: site.url,
  slogan: site.tagline,
  email: site.email,
};
