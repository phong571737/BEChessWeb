import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review",
  description: "Review completed games with board replay, PGN, and analytics.",
  alternates: { canonical: "/played/review" },
  openGraph: {
    title: "Review | TTLab Chess",
    description: "Review completed games with board replay, PGN, and analytics.",
    url: "/played/review",
  },
};

export default function PlayedReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
