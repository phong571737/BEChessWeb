"use client"

import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Check, Download, FlipHorizontal, House, NotebookPen, X, ChevronRight, Menu, Castle, Sun, Moon, FileUp, History, Languages, LogOut, Palette, Settings, Smartphone, UserRound } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { Separator } from "@radix-ui/react-separator";
import { BoardLayoutHeaderControl } from "@/components/board/board-layout-header-control";
import { useAuth } from "@/lib/auth-context";
import { BOARD_COLOR_PRESETS, useBoardDisplay } from "@/components/providers/board-display-provider";
import { APP_RELEASE_VERSION } from "@/lib/app-version";
import { publicPath } from "@/lib/public-path";

const sectionDefs = [
    { key: "nav.home" as const, url: "/", icon: House },
    { key: "nav.played" as const, url: "/played", icon: History },
    { key: "nav.import" as const, url: "/paste", icon: NotebookPen},
    { key: "nav.guide" as const, url: "/guide", icon: BookOpen},
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
    const { isAdmin } = useAuth();
    const sections = isAdmin
        ? [...sectionDefs, { key: "nav.dashboard" as const, url: "/dashboard", icon: BarChart3 }]
        : sectionDefs;
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
                    src={publicPath("/images/logo.jpg")}
                    alt={t("app.logoAlt")}
                    width={28}
                    height={28}
                    className="rounded-md shrink-0"
                    priority
                />
                {!collapsed && (
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate leading-tight">{t("app.name")}</p>
                        <p className="text-[10px] text-muted-foreground truncate leading-tight tracking-wide">{t("app.subtitle")}</p>
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
                { sections.map((section) => {
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
                                    ? "bg-accent text-accent-foreground font-medium"
                                    : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                            )}
                        >
                            {/* Active indicator — left bar (expanded only) */}
                            {isActive && !collapsed && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-primary"/>
                            )}
                            <Icon className={cn(
                                "shrink-0 transition-colors",
                                collapsed ? "size-4" : "size-4",
                                isActive ? "text-accent-foreground" : "text-muted-foreground group-hover:text-foreground"
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
                    {t("app.footer")}
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
    const { setTheme, resolvedTheme } = useTheme();
    const {t, locale, setLocale} = useT();
    const { user, isAuthenticated, logout } = useAuth();
    const { flipped, showEvaluation, boardColorTheme, boardColors, toggleFlipped, toggleEvaluation, setBoardColorTheme, setCustomBoardColors } = useBoardDisplay();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
    const [themeMounted, setThemeMounted] = useState(false);
    const accountMenuRef = useRef<HTMLDivElement>(null);
    const settingsMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setThemeMounted(true);
    }, []);

    useEffect(() => {
        const closeMenus = (event: MouseEvent) => {
            const target = event.target as Node;
            if (accountMenuRef.current && !accountMenuRef.current.contains(target)) setAccountMenuOpen(false);
            if (settingsMenuRef.current && !settingsMenuRef.current.contains(target)) setSettingsMenuOpen(false);
        };
        document.addEventListener("mousedown", closeMenus);
        return () => document.removeEventListener("mousedown", closeMenus);
    }, []);

    const crumbLinks = useMemo(() => {
        const segLabels: Record<string, string> = {
        played: t("nav.played"),
        paste: t("nav.import"),
        guide: t("nav.guide"),
        // device: t("nav.device"),
        board: t("app.board"),
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
                            <div className="md:hidden text-sm font-semibold truncate">{t("app.name")}</div>

                            {/* Right actions */}
                            <div className="ml-auto flex items-center gap-0.5">
                                {isAuthenticated && user ? (
                                    <div ref={accountMenuRef} className="relative">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 gap-2 px-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                                            onClick={() => setAccountMenuOpen((open) => !open)}
                                            aria-expanded={accountMenuOpen}
                                            aria-haspopup="menu"
                                        >
                                            <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary"><UserRound className="size-3" /></span>
                                            <span className="hidden sm:block max-w-24 truncate text-foreground">{user.username}</span>
                                        </Button>
                                        {accountMenuOpen && (
                                            <div
                                                role="menu"
                                                className="absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-56 rounded-md border border-border bg-popover p-1 shadow-lg"
                                            >
                                                <div className="border-b border-border px-2.5 py-2">
                                                    <p className="truncate text-xs font-semibold text-foreground">{user.username}</p>
                                                    <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="mt-1 w-full justify-start gap-2 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    onClick={() => {
                                                        setAccountMenuOpen(false);
                                                        logout();
                                                    }}
                                                    role="menuitem"
                                                >
                                                    <LogOut className="size-3.5" />{t("app.logout")}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                                        asChild
                                    >
                                        <Link href="/login">{t("login.title")}</Link>
                                    </Button>
                                )}

                                <div ref={settingsMenuRef} className="relative">
                                    <Button variant="ghost" size="icon" className="size-8" onClick={() => setSettingsMenuOpen((open) => !open)} title={t("settings.open")} aria-label={t("settings.open")} aria-expanded={settingsMenuOpen} aria-haspopup="menu">
                                        <Settings className="size-4" />
                                    </Button>
                                    {settingsMenuOpen && (
                                        <div role="menu" className="absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-48 rounded-md border border-border bg-popover p-1 shadow-lg">
                                            <p className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Languages className="size-3.5" />{t("settings.language")}</p>
                                            {(["en", "vi"] as const).map((value) => (
                                                <button key={value} type="button" role="menuitem" onClick={() => { setLocale(value); setSettingsMenuOpen(false); }} className="flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground">
                                                    <span>{value === "en" ? t("settings.english") : t("settings.vietnamese")}</span>{locale === value && <Check className="size-3.5 text-primary" />}
                                                </button>
                                            ))}
                                            <div className="my-1 border-t border-border" />
                                            <p className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Settings className="size-3.5" />{t("settings.theme")}</p>
                                            {(["light", "dark"] as const).map((value) => (
                                                <button key={value} type="button" role="menuitem" onClick={() => { setTheme(value); setSettingsMenuOpen(false); }} className="flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground">
                                                    <span className="flex items-center gap-2">{value === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}{value === "dark" ? t("settings.dark") : t("settings.light")}</span>{themeMounted && resolvedTheme === value && <Check className="size-3.5 text-primary" />}
                                                </button>
                                            ))}
                                            <div className="my-1 border-t border-border" />
                                            <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                {t("settings.boardLayout")}
                                            </div>
                                            <div className="px-1 pb-1">
                                                <BoardLayoutHeaderControl />
                                            </div>
                                            <div className="my-1 border-t border-border" />
                                            <button type="button" role="menuitem" onClick={() => { toggleFlipped(); setSettingsMenuOpen(false); }} className="flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground">
                                                <span className="flex items-center gap-2"><FlipHorizontal className="size-3.5" />{t("settings.flipBoard")}</span>{flipped && <Check className="size-3.5 text-primary" />}
                                            </button>
                                            <button type="button" role="menuitem" onClick={() => { toggleEvaluation(); setSettingsMenuOpen(false); }} className="flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground">
                                                <span className="flex items-center gap-2"><BarChart3 className="size-3.5" />{t("settings.evaluationBar")}</span>{showEvaluation && <Check className="size-3.5 text-primary" />}
                                            </button>
                                            <div className="my-1 border-t border-border" />
                                            <p className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Smartphone className="size-3.5" />{t("settings.mobileApp")}</p>
                                            <a href={publicPath("/downloads/TTLab_v1.1.apk")} download className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground">
                                                <Download className="size-3.5" />{t("settings.downloadApk")}
                                            </a>
                                            <Link href="/guide" onClick={() => setSettingsMenuOpen(false)} className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground">
                                                <BookOpen className="size-3.5" />{t("settings.usageGuide")}
                                            </Link>
                                            <div className="my-1 border-t border-border" />
                                            <p className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Palette className="size-3.5" />{t("settings.boardColors")}</p>
                                            <div className="grid grid-cols-3 gap-1 px-1 pb-1">
                                                {(Object.entries(BOARD_COLOR_PRESETS) as [keyof typeof BOARD_COLOR_PRESETS, typeof BOARD_COLOR_PRESETS[keyof typeof BOARD_COLOR_PRESETS]][]).map(([name, colors]) => (
                                                    <button key={name} type="button" role="menuitem" title={t(`settings.boardColor.${name}`)} aria-label={t(`settings.boardColor.${name}`)} onClick={() => { setBoardColorTheme(name); setSettingsMenuOpen(false); }} className="relative overflow-hidden rounded-sm border border-border p-0.5 transition-shadow hover:ring-2 hover:ring-ring/40">
                                                        <span className="flex h-6 overflow-hidden rounded-[2px]"><span className="w-1/2" style={{ backgroundColor: colors.light }} /><span className="w-1/2" style={{ backgroundColor: colors.dark }} /></span>
                                                        {boardColorTheme === name && <Check className="absolute inset-0 m-auto size-3.5 text-white drop-shadow" />}
                                                    </button>
                                                ))}
                                            </div>
                                            <details className="mx-1 rounded-sm border border-border px-2 py-1.5 text-xs text-muted-foreground">
                                                <summary className="cursor-pointer select-none">{t("settings.customBoardColors")}</summary>
                                                <div className="mt-2 flex items-center justify-between gap-2">
                                                    <label className="flex items-center gap-1.5">{t("settings.lightSquare")}<input type="color" value={boardColors.light} onChange={(event) => setCustomBoardColors({ ...boardColors, light: event.target.value })} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" /></label>
                                                    <label className="flex items-center gap-1.5">{t("settings.darkSquare")}<input type="color" value={boardColors.dark} onChange={(event) => setCustomBoardColors({ ...boardColors, dark: event.target.value })} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" /></label>
                                                </div>
                                                <button type="button" onClick={() => setSettingsMenuOpen(false)} className="mt-2 w-full rounded-sm bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground hover:bg-surface-hover">{t("settings.done")}</button>
                                            </details>
                                            <div className="mt-1 border-t border-border px-2.5 py-2 text-[10px] text-muted-foreground">Version v{APP_RELEASE_VERSION}</div>
                                        </div>
                                    )}
                                </div>
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
