import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";
import { Providers } from "@/components/providers/providers";
import { AuthProvider } from "@/components/providers/auth-provider";

export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: {
        default: "TTLab Chess",
        template: "%s | TTLab Chess",
    },
    description: "Live chess boards, match history, and board setup tools for TTLab.",
    applicationName: "TTLab Chess",
    keywords: ["chess", "board management", "TTLab", "live games"],
    alternates: {
        canonical: "/",
    },
    openGraph: {
        title: "TTLab Chess",
        description: "Live chess boards, match history, and board setup tools for TTLab.",
        siteName: "TTLab Chess",
        type: "website",
    },
};

export const viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode; 
}) {
    return (
        <html lang="vi" suppressHydrationWarning>
            <body>
                <AuthProvider>
                    <Providers>
                        <AppShell>{children}</AppShell>
                    </Providers>
                </AuthProvider>
            </body>
        </html>
    )
}
