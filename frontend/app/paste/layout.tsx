import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Import game",
  description: "Import moves from an e-board to generate PGN, FEN.",
  alternates: { canonical: "/paste" },
  openGraph: {
    title: "Import game | TTLab Chess",
    description: "Import moves from an e-board to generate PGN, FEN.",
    url: "/paste",
  },
};

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return children;
}