import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/played`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/played/review`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/board`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/log`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];

  try {
    const apiUrl = process.env.API_URL || "http://localhost:8080";
    const res = await fetch(`${apiUrl}/games/history`, { cache: "no-store" });
    if (!res.ok) return staticRoutes;
    const rows = (await res.json()) as Array<{ _id?: string; endedAt?: string; createAt?: string }>;
    const dynamicRoutes: MetadataRoute.Sitemap = rows
      .filter((r) => !!r?._id)
      .map((r) => ({
        url: `${baseUrl}/played/review/${r._id}`,
        lastModified: new Date(r.endedAt || r.createAt || now),
        changeFrequency: "monthly",
        priority: 0.7,
      }));
    return [...staticRoutes, ...dynamicRoutes];
  } catch {
    return staticRoutes;
  }
}
