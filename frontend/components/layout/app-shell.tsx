"use client"

import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { House, NotebookPen, X, ChevronRight, Menu, Castle, Sun, Moon, FileUp, History } from "lucide-react";
import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { Separator } from "@radix-ui/react-separator";
import { BoardLayoutHeaderControl } from "@/components/board/board-layout-header-control";
import { useAuth } from "@/lib/auth-context";

const sectionDefs = [
    { key: "nav.home" as const, url: "/", icon: House },
    { key: "nav.played" as const, url: "/played", icon: History },
    { key: "nav.import" as const, url: "/paste", icon: NotebookPen},
];

function AppSidebar({
    collapsed,
    mobileOpen,
    onCloseMobile
}: {
    collapsed: boolean,
    mobileOpen: boolean,
    onCloseMobile: () => void
}) {
    const pathname = usePathname();
    const {t} = useT();
    const base = (
        <aside
            className={cn(
                "h-screen flex flex-col border-r transition-all duration-200",
                "bg-[hsl(var(--sidebar))] border-[hsl(var(--sidebar-border))]",
                collapsed ? "w-[64px]" : "w-[220px]"
            )}>
            {/* Brand */}
            <div className={cn(
                "h-14 flex items-center gap-2.5 border-b border-[hsl(var(--sidebar-border))]",
                collapsed ? "px-0 justify-center" : "px-4"
            )}>
                <Image
                    src="/images/logo.jpg"
                    alt="TTLab"
                    width={28}
                    height={28}
                    className="rounded-md shrink-0"
                    priority
                />
                {!collapsed && (
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate leading-tight">TTLab Chess</p>
                        <p className="text-[10px] text-muted-foreground truncate leading-tight tracking-wide">Lab Management</p>
                    </div>
                )}

                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("size-7 md:hidden shrink-0", !collapsed && "ml-auto")}
                    onClick={onCloseMobile}
                >
                    <X className="size-3.5" />
                </Button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
                { sectionDefs.map((section) => {
                    const isActive = 
                        section.url === "/"
                            ? pathname === "/"
                            : pathname === section.url || pathname.startsWith(`${section.url}/`);
                    const Icon = section.icon;

                    return (
                        <Link
                            key={section.key}
                            href={section.url}
                            onClick={onCloseMobile}
                            className={cn(
                                "group flex items-center gap-2.5 rounded-md text-sm transition-colors duration-150 relative",
                                collapsed ? "justify-center h-9 w-9 mx-auto" : "px-3 py-2 w-full",
                                isActive
                                    ? "bg-foreground/[0.07] text-foreground font-medium"
                                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]"
                            )}
                        >
                            {/* Active indicator — left bar (expanded only) */}
                            {isActive && !collapsed && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-foreground/60"/>
                            )}
                            <Icon className={cn(
                                "shrink-0 transition-colors",
                                collapsed ? "size-4" : "size-4",
                                isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                            )}/>
                            {!collapsed && (
                                <>
                                    <span className="truncate flex-1">{t(section.key)}</span>
                                    <ChevronRight className={cn(
                                        "size-3.5 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity",
                                        isActive && "opacity-25"
                                    )}/>
                                </>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            {!collapsed && (
                <div className="px-3 py-3 border-t border-[hsl(var(--sidebar-border))]">
                <p className="text-[10px] text-muted-foreground/60 text-center tracking-wide">
                    TTLab · Chess System
                </p>
                </div>
            )}
        </aside>
    );

    return (
        <>
            <div className="hidden md:block h-screen sticky top-0">{base}</div>
            {mobileOpen && (
                <div className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onCloseMobile}>
                <div className="h-full w-[80%] max-w-[280px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    {base}
                </div>
                </div>
            )}
        </>
    )
}


export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { theme, setTheme, resolvedTheme } = useTheme();
    const {t, locale, setLocale} = useT();
    const { user, isAuthenticated, logout } = useAuth();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const crumbLinks = useMemo(() => {
        const segLabels: Record<string, string> = {
        played: t("nav.played"),
        // device: t("nav.device"),
        board:  "Board",
        review: t("rev.moveReview"),
        };
        const segs = pathname.split("/").filter(Boolean);
        const links = [{ label: t("nav.home"), href: "/" }];
        let acc = "";
        for (const seg of segs) {
        acc += `/${seg}`;
        links.push({
            label: segLabels[seg] ?? seg.replace(/[-_]/g, " "),
            href: acc,
        });
        }
        return links;
    }, [pathname, t]);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex min-h-screen">
                <AppSidebar
                    collapsed={collapsed}
                    mobileOpen={mobileOpen}
                    onCloseMobile={() => setMobileOpen(false)}
                />
                <div className="flex-1 min-w-0 flex flex-col">
                    {/* Top header */}
                    <header className="h-14 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
                        <div className="h-full px-3 sm:px-4 flex items-center gap-2">
                            {/* Mobile hamburger */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 md:hidden"
                                onClick={() => setMobileOpen(true)}
                            >
                                <Menu className="size-4" />  
                            </Button>

                            {/* Desktop collapse toggle */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 hidden md:inline-flex"
                                onClick={() => setCollapsed((v) => !v)}
                            >
                                <ChevronRight className={cn(
                                "size-4 transition-transform duration-200",
                                collapsed && "rotate-180"
                                )} />
                            </Button>

                            {/* Breadcrumb — desktop */}
                            <div className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                                <Castle className="size-4 shrink-0 opacity-60" />
                                <Separator orientation="vertical" className="h-3.5 mx-0.5" />
                                {crumbLinks.map((c, i) => (
                                <div key={`${c.href}-${i}`} className="flex items-center gap-1.5">
                                    {i > 0 && <ChevronRight className="size-3 opacity-40" />}
                                    {i === crumbLinks.length - 1 ? (
                                    <span className="text-foreground font-medium capitalize">{c.label}</span>
                                    ) : (
                                    <Link href={c.href} className="capitalize hover:text-foreground transition-colors">
                                        {c.label}
                                    </Link>
                                    )}
                                </div>
                                ))}
                            </div>

                            {/* Mobile title */}
                            <div className="md:hidden text-sm font-semibold truncate">TTLab Chess</div>

                            {/* Right actions */}
                            <div className="ml-auto flex items-center gap-0.5">
                                <BoardLayoutHeaderControl />

                                {isAuthenticated && user ? (
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-muted-foreground hidden sm:inline">
                                            {user.username}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2.5 text-xs font-medium text-destructive hover:text-destructive"
                                            onClick={logout}
                                            >
                                            Đăng xuất
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                                        asChild
                                    >
                                        <Link href="/login">Đăng nhập</Link>
                                    </Button>
                                )}

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                                    onClick={() => setLocale(locale === "vi" ? "en" : "vi")}
                                    title="Switch language / Đổi ngôn ngữ"
                                    >
                                    {locale === "vi" ? "English" : "Tiếng Việt"}
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                                    >
                                    <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                                    <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                                </Button>
                            </div>

                        </div>
                    </header>
                    <main className="flex-1 min-h-0 h-full overflow-x-hidden">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}