"use client";

import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Download, LogIn, Smartphone, Wifi } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { publicPath } from "@/lib/public-path";

const stepIcons = [LogIn, Smartphone, Wifi, CheckCircle2];

export default function GuidePage() {
    const { t } = useT();
    const { isAuthenticated } = useAuth();
    const steps = ["step1", "step2", "step3", "step4"] as const;

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
                                                <a href={publicPath("/downloads/TTLab_v1.1.apk")} download><Download className="size-3.5" />{t("settings.downloadApk")}</a>
                                            </Button>
                                        )}
                                        {step === "step3" && (
                                            <div className="mt-4 flex flex-col items-center gap-4 rounded-md border border-border bg-muted/30 p-4 sm:flex-row sm:items-start">
                                                <Image
                                                    src={publicPath("/images/qr-code-json.png")}
                                                    alt={t("guide.qrAlt")}
                                                    width={176}
                                                    height={176}
                                                    className="size-40 rounded-md bg-white p-2 shadow-sm sm:size-44"
                                                />
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
        </div>
    );
}
