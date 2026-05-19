import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Board",
  description: "Real-time board view, move navigation, and game controls.",
  alternates: { canonical: "/board" },
  openGraph: {
    title: "Board | TTLab Chess",
    description: "Real-time board view, move navigation, and game controls.",
    url: "/board",
  },
};

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return children;
}