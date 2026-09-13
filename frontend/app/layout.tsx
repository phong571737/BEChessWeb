import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";
import { Providers } from "@/components/providers/providers";
import { AuthProvider } from "@/lib/auth-context";

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
    const siteUrl = process.env.API_URL || "http://localhost:3000";
    return (
        <html lang="en" suppressHydrationWarning>
            <body >
                <AuthProvider>
                    <Providers>
                        <AppShell>{children}</AppShell>
                    </Providers>
                </AuthProvider>
            </body>
        </html>
    )
}
