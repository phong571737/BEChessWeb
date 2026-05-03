import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Played",
  description: "Game history, filters, sortable table, and detailed match review.",
  alternates: { canonical: "/played" },
  openGraph: {
    title: "Played | TTLab Chess",
    description: "Game history, filters, sortable table, and detailed match review.",
    url: "/played",
  },
};

export default function PlayedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
