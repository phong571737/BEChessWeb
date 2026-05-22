"use client"

import React from "react";
import { ThemeProvider } from "./theme-provider";
import { LanguageProvider } from "@/lib/i18n";
import { SocketProvider } from "./socket-provider";

export function Providers({children}: {children: React.ReactNode}) {
    return (
        <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        >
            <LanguageProvider>
                <SocketProvider>{children}</SocketProvider>
            </LanguageProvider>
        </ThemeProvider>
    );
}