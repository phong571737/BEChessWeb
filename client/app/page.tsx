import { GameGrid } from "@/components/home/game-grid";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
  description: "Live active chess games with quick access to real-time boards.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Home | TTLab Chess",
    description: "Live active chess games with quick access to real-time boards.",
    url: "/",
  },
};

export default function HomePage() {
  return <GameGrid />;
}
