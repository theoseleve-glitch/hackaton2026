import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Backed",
    short_name: "Backed",
    description: "The sponsorship campaign engine for underfunded athletes.",
    theme_color: "#080807",
    background_color: "#080807",
    display: "standalone",
    start_url: "/",
    icons: [
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
