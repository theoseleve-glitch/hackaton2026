import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: "https://backed.team/",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://backed.team/kit/jules",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
