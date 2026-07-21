"use client"

import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/lib/i18n";
import { Check, Copy, Info, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { parseUciBranches, ParseUciResult } from "./parse-uci";
import { cn } from "@/lib/utils";

export function PasteGame() {
    const { t } = useT();
    const [rawInput, setRawInput] = useState("");
    const [result, setResult] = useState<ParseUciResult | null>(null);
    const [selectedBranch, setSelectedBranch] = useState(0);
    const [copiedBranch, setCopiedBranch] = useState<number | null>(null);

    const activeBranch = useMemo(() => result?.branches[selectedBranch], [result, selectedBranch]);

    function handleClear() {
        setRawInput("");
        setResult(null);
        setSelectedBranch(0);
        setCopiedBranch(null);
    }

    function handleParse() {
        const parsed = parseUciBranches(rawInput);
        setSelectedBranch(0);
        setResult(parsed);
        setCopiedBranch(null);
    }

    async function handleCopy(idx: number, pgn: string) {
        await navigator.clipboard.writeText(pgn);
        setCopiedBranch(idx);
        setTimeout(() => {
            setCopiedBranch((current) => (current === idx ? null : current));
        }, 1500);
    }

    return (
        <div className="space-y-6 px-4 pb-8 sm:px-6">
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 text-3xl font-semibold">
                            <Sparkles className="size-5 text-primary" />
                            {t("nav.import")}
                        </div>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            {t("pg.description")}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{t("pg.pasteUCI")}</Badge>
                        <Badge variant="outline">{t("pg.notation")}</Badge>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
                <Card className="overflow-hidden border-border shadow-sm">
                    <CardHeader className="gap-2 border-b border-border p-6">
                        <div className="space-y-1">
                            <CardTitle>{t("pg.pasteUCI")}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {t("pg.pasteHint")}
                            </p>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-6 p-6">
                        <ScrollArea className="min-h-[240px] rounded-3xl border border-border bg-muted">
                            <textarea
                                value={rawInput}
                                onChange={(e) => setRawInput(e.target.value)}
                                aria-label={t("pg.pasteUCI")}
                                autoCorrect="off"
                                className="w-full min-h-[240px] resize-none bg-transparent p-5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
                                placeholder={t("pg.pastePlaceholder") || "e2e4 e7e5 g1f3 ..."}
                            />
                        </ScrollArea>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                    {t("pg.input")}
                                </p>
                                <p className="text-sm text-foreground/80">
                                    {rawInput.trim().length === 0
                                        ? t("pg.noInput")
                                        : `${rawInput.trim().split(/\s+/).filter(Boolean).length} ${t("pg.tokens")}`}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={handleClear}
                                    disabled={rawInput.trim().length === 0}
                                    className="text-xs"
                                >
                                    {t("pg.clear")}
                                </Button>
                                <Button
                                    type="button"
                                    disabled={rawInput.trim().length === 0}
                                    onClick={handleParse}
                                    variant="default"
                                    className="min-w-[140px] text-sm"
                                >
                                    {t("pg.generatePgn")}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="overflow-hidden border-border shadow-sm">
                    <CardHeader className="gap-2 border-b border-border p-6">
                        <div className="space-y-1">
                            <CardTitle>{t("pg.preview")}</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                {t("pg.previewDescription")}
                            </p>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-6 p-6">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-border bg-background p-4">
                                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                    {t("pg.branches")}
                                </p>
                                <p className="mt-2 text-2xl font-semibold">{result?.branches.length ?? 0}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-background p-4">
                                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                    {t("pg.tokens")}
                                </p>
                                <p className="mt-2 text-2xl font-semibold">
                                    {rawInput.trim().split(/\s+/).filter(Boolean).length}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold">
                                    {result ? t("pg.resultSummary") : t("pg.noPreview")}
                                </span>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => activeBranch && handleCopy(selectedBranch, activeBranch.pgn)}
                                    disabled={!activeBranch}
                                >
                                    {copiedBranch === selectedBranch ? (
                                        <span className="inline-flex items-center gap-2">
                                            <Check className="size-4" /> {t("rev.copiedPgn")}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-2">
                                            <Copy className="size-4" /> {t("rev.copyPgn")}
                                        </span>
                                    )}
                                </Button>
                            </div>

                            <ScrollArea className="h-[260px] rounded-3xl border border-border bg-muted">
                                <pre className="p-4 text-sm font-mono leading-6 text-foreground whitespace-pre-wrap break-words">
                                    {activeBranch?.pgn || t("pg.noPreview")}
                                </pre>
                            </ScrollArea>
                        </div>

                        {result?.branches.length > 1 && (
                            <div className="space-y-3">
                                <p className="text-sm font-semibold">{t("pg.listbranch")}</p>
                                <div className="grid gap-2 lg:grid-cols-2">
                                    {result.branches.map((branch, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setSelectedBranch(idx)}
                                            className={cn(
                                                "rounded-2xl border p-4 text-left transition-all",
                                                idx === selectedBranch
                                                    ? "border-primary bg-primary/5"
                                                    : "border-border bg-background hover:border-primary/70"
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-sm font-semibold">
                                                    {t("sg.branch")} {idx + 1}
                                                </span>
                                                <Badge variant={idx === selectedBranch ? "default" : "outline"}>
                                                    {branch.appliedCount}/{branch.totalTokens}
                                                </Badge>
                                            </div>
                                            <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                                                {branch.sanHistory.join(" ")}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
