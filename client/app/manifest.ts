import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TTLab Chess",
    short_name: "TTLabChess",
    description: "Real-time chess platform with physical board integration and match analytics.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#111111",
    lang: "en",
    icons: [
      { src: "/images/logo.jpg", sizes: "192x192", type: "image/jpeg" },
      { src: "/images/logo.jpg", sizes: "512x512", type: "image/jpeg" },
    ],
  };
}
