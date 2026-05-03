import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers/providers";
import { AppShell } from "@/components/layout/app-shell";

const aptos = localFont({
  src: [
    { path: "../public/fonts/aptos/Aptos-Regular.ttf",    weight: "400", style: "normal" },
    { path: "../public/fonts/aptos/Aptos-Bold.ttf",       weight: "700", style: "normal" },
    { path: "../public/fonts/aptos/Aptos-Italic.ttf",     weight: "400", style: "italic" },
    { path: "../public/fonts/aptos/Aptos-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-aptos",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "TTLab Chess",
    template: "%s | TTLab Chess",
  },
  description: "Real-time chess platform with physical board integration, game history, and match review analytics.",
  keywords: ["chess", "smart chess board", "PGN", "chess review", "ESP32 chess"],
  applicationName: "TTLab Chess",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "TTLab Chess",
    title: "TTLab Chess",
    description: "Real-time chess platform with physical board integration, game history, and match review analytics.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "TTLab Chess",
    description: "Real-time chess platform with physical board integration, game history, and match review analytics.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TTLab Chess",
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/played?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "TTLab Chess",
    applicationCategory: "GameApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description: "Real-time chess platform with physical board integration, game history, and match review analytics.",
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={aptos.variable}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }} />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
