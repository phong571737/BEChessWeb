"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Download, LogIn, Smartphone, Wifi, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { publicPath } from "@/lib/public-path";

const stepIcons = [LogIn, Smartphone, Wifi, CheckCircle2];

export default function GuidePage() {
    const { t } = useT();
    const { isAuthenticated } = useAuth();
    const [isQrOpen, setIsQrOpen] = useState(false);
    const steps = ["step1", "step2", "step3", "step4"] as const;

    // 
    useEffect(() => {
        if (!isQrOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setIsQrOpen(false);
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isQrOpen]);

    return (
        <div className="min-h-full bg-background">
            <div className="border-b border-border bg-card/60">
                <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("app.name")}</p>
                    <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{t("guide.title")}</h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("guide.description")}</p>
                </div>
            </div>

            <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
                <ol className="space-y-3">
                    {steps.map((step, index) => {
                        const Icon = stepIcons[index];
                        const needsLogin = step === "step4";
                        return (
                            <li key={step} className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
                                <div className="flex gap-3 sm:gap-4">
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="size-4" /></div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{index + 1}</p>
                                        <h2 className="mt-0.5 font-semibold text-foreground">{t(`guide.${step}.title`)}</h2>
                                        {needsLogin && !isAuthenticated ? (
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <p className="text-sm text-muted-foreground">{t("guide.loginRequired")}</p>
                                                <Button size="sm" variant="outline" asChild><Link href="/login">{t("login.title")}</Link></Button>
                                            </div>
                                        ) : (
                                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`guide.${step}.body`)}</p>
                                        )}
                                        {step === "step2" && (
                                            <Button className="mt-3" size="sm" asChild>
                                                <a href={publicPath("/downloads/TTLab_v1.1-patch2.apk")} download><Download className="size-3.5" />{t("settings.downloadApk")}</a>
                                            </Button>
                                        )}
                                        {step === "step3" && (
                                            <div className="mt-4 flex flex-col items-center gap-4 rounded-md border border-border bg-muted/30 p-4 sm:flex-row sm:items-start">
                                                <div className="flex shrink-0 flex-col items-center gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsQrOpen(true)}
                                                        aria-label={t("guide.qrZoom")}
                                                        className="cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                                    >
                                                        <Image
                                                            src={publicPath("/images/qr-code-json.png")}
                                                            alt={t("guide.qrAlt")}
                                                            width={176}
                                                            height={176}
                                                            className="size-40 rounded-md bg-white p-2 shadow-sm transition-transform hover:scale-[1.03] sm:size-44"
                                                        />
                                                    </button>
                                                    <a
                                                        href={publicPath("/images/qr-code-json.png")}
                                                        download="ttlab-board-qr.png"
                                                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                                    >
                                                        <Download className="size-3.5" />
                                                        {t("guide.qrDownload")}
                                                    </a>
                                                </div>
                                                <div className="min-w-0 text-center sm:text-left">
                                                    <h3 className="font-medium text-foreground">{t("guide.qrTitle")}</h3>
                                                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t("guide.qrBody")}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </main>

            {isQrOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 sm:p-8"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="qr-dialog-title"
                    onClick={() => setIsQrOpen(false)}
                >
                    <div
                        className="relative flex max-h-full w-full max-w-lg flex-col items-center gap-4 rounded-lg bg-card p-4 shadow-xl sm:p-6"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex w-full items-center justify-between gap-4">
                            <h2 id="qr-dialog-title" className="font-semibold text-foreground">{t("guide.qrTitle")}</h2>
                            <button
                                type="button"
                                onClick={() => setIsQrOpen(false)}
                                aria-label={t("guide.qrClose")}
                                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <X className="size-5" />
                            </button>
                        </div>
                        <Image
                            src={publicPath("/images/qr-code-json.png")}
                            alt={t("guide.qrAlt")}
                            width={640}
                            height={640}
                            className="h-auto max-h-[min(70vh,640px)] w-full max-w-[640px] rounded-md bg-white p-3 object-contain"
                        />
                        <a
                            href={publicPath("/images/qr-code-json.png")}
                            download="ttlab-board-qr.png"
                            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <Download className="size-4" />
                            {t("guide.qrDownload")}
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
