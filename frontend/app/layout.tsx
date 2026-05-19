import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";
import { Providers } from "@/components/providers/providers";

export default function RootLayout({
    children,
}: {
    children: React.ReactNode; 
}) {
    const siteUrl = process.env.API_URL || "http://localhost:3000";
    return (
        <html lang="en" suppressHydrationWarning>
            <body >
                <Providers>
                    <AppShell>{children}</AppShell>
                </Providers>
            </body>
        </html>
    )
}