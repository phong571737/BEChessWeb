import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Match Review ${id}`,
    description: "Detailed chess match review with timeline replay, PGN notation, and analysis charts.",
    alternates: { canonical: `/played/review/${id}` },
    openGraph: {
      title: `Match Review ${id} | TTLab Chess`,
      description: "Detailed chess match review with timeline replay, PGN notation, and analysis charts.",
      url: `/played/review/${id}`,
      images: [{ url: `/played/review/${id}/opengraph-image`, width: 1200, height: 630, alt: `Match Review ${id}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `Match Review ${id} | TTLab Chess`,
      description: "Detailed chess match review with timeline replay, PGN notation, and analysis charts.",
      images: [`/played/review/${id}/opengraph-image`],
    },
  };
}

export default function PlayedReviewIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
