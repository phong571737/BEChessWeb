"use client";

import { useState, useMemo } from "react";
import { useT } from "@/lib/i18n";
import { 
    Sparkles, 
    Copy, 
    Check, 
    Download, 
    Clipboard, 
    RotateCcw, 
    GitBranch, 
    Terminal, 
    FileCode2, 
    Play, 
    Wand2,
    Layers,
    CheckCircle2,
    AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseUciBranches, ParseUciResult } from "./parse-uci";
import { cn } from "@/lib/utils";

// Sample UCI move presets for quick testing
const SAMPLES = [
    {
        name: "Scholar's Mate (Bẫy 4 nước)",
        uci: "e2e4 e7e5 d2d4 b8c6 f1c4 g8f6 d1f3 c6d4 f3f7",
    },
    {
        name: "Italian Game (Khai cuộc Ý)",
        uci: "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4 e5d4 c3d4 c5b4",
    },
    {
        name: "Ambiguous Capture (Ăn quân phân nhánh)",
        uci: "e2e4 d7d5 e4d5 c7c6 d5c6 b8c6 g1f3 e7e5 f1c4 e5e4",
    },
];

export function PasteGame() {
    const { t, locale } = useT();
    const [rawInput, setRawInput] = useState("");
    const [result, setResult] = useState<ParseUciResult | null>(null);
    const [selectedBranch, setSelectedBranch] = useState(0);
    const [copiedBranch, setCopiedBranch] = useState<number | null>(null);
    const [isParsing, setIsParsing] = useState(false);

    const activeBranch = useMemo(() => result?.branches[selectedBranch], [result, selectedBranch]);

    const tokenCount = useMemo(() => {
        return rawInput.trim().split(/\s+/).filter(Boolean).length;
    }, [rawInput]);

    function handleClear() {
        setRawInput("");
        setResult(null);
        setSelectedBranch(0);
        setCopiedBranch(null);
    }

    function handleParse() {
        if (!rawInput.trim()) return;
        setIsParsing(true);
        setTimeout(() => {
            const parsed = parseUciBranches(rawInput);
            setSelectedBranch(0);
            setResult(parsed);
            setCopiedBranch(null);
            setIsParsing(false);
        }, 150);
    }

    function handleLoadSample(uci: string) {
        setRawInput(uci);
        setIsParsing(true);
        setTimeout(() => {
            const parsed = parseUciBranches(uci);
            setSelectedBranch(0);
            setResult(parsed);
            setCopiedBranch(null);
            setIsParsing(false);
        }, 150);
    }

    async function handlePasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                setRawInput(text);
            }
        } catch {
            // Permission denied or unavailable
        }
    }

    async function handleCopy(idx: number, pgn: string) {
        await navigator.clipboard.writeText(pgn);
        setCopiedBranch(idx);
        setTimeout(() => {
            setCopiedBranch((current) => (current === idx ? null : current));
        }, 1500);
    }

    function handleDownloadPgn() {
        if (!activeBranch) return;
        const blob = new Blob([activeBranch.pgn], { type: "application/x-chess-pgn" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `imported_game_branch_${selectedBranch + 1}.pgn`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    return (
        <div className="max-w-[1400px] mx-auto space-y-6 px-4 py-6 sm:px-6">
            {/* Header Hero Section */}
            <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card/80 to-accent/20 p-6 sm:p-8 shadow-sm">
                <div className="absolute -right-12 -top-12 size-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                                <Sparkles className="size-5" />
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                                {t("nav.import")}
                            </h1>
                        </div>
                        <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
                            {t("pg.description")}
                        </p>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mr-1">
                            <Wand2 className="size-3.5" />
                            {locale === "vi" ? "Mẫu nhanh:" : "Presets:"}
                        </span>
                        {SAMPLES.map((sample, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleLoadSample(sample.uci)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/60 px-3 py-1 text-xs font-medium text-foreground backdrop-blur-sm transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary active:scale-95"
                            >
                                {sample.name}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* Main Content Grid */}
            <div className="grid gap-6 lg:grid-cols-12">
                {/* Input Panel */}
                <Card className="lg:col-span-6 flex flex-col overflow-hidden border-border shadow-sm">
                    <CardHeader className="border-b border-border/60 bg-muted/30 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Terminal className="size-4 text-primary" />
                                <CardTitle className="text-base font-semibold">{t("pg.pasteUCI")}</CardTitle>
                            </div>
                            <div className="flex items-center gap-2">
                                {tokenCount > 0 && (
                                    <Badge variant="secondary" className="font-mono text-[11px]">
                                        {tokenCount} {t("pg.tokens")}
                                    </Badge>
                                )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handlePasteFromClipboard}
                                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                    title="Paste from clipboard"
                                >
                                    <Clipboard className="size-3.5" />
                                    <span>{locale === "vi" ? "Dán" : "Paste"}</span>
                                </Button>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="flex-1 flex flex-col p-6 space-y-4">
                        {/* Editor Area */}
                        <div className="relative flex-1 min-h-[280px] rounded-2xl border border-border/80 bg-muted/40 transition-all focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
                            <textarea
                                value={rawInput}
                                onChange={(e) => setRawInput(e.target.value)}
                                aria-label={t("pg.pasteUCI")}
                                autoCorrect="off"
                                spellCheck={false}
                                className="w-full h-full min-h-[280px] resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
                                placeholder={t("pg.pastePlaceholder") || "e2e4 e7e5 g1f3 b8c6 f1c4..."}
                            />

                            {/* Floating Clear Button */}
                            {rawInput.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    className="absolute right-3 top-3 p-1.5 rounded-lg bg-background/80 text-muted-foreground hover:text-foreground hover:bg-background border border-border/60 transition-all"
                                    title={t("pg.clear")}
                                >
                                    <RotateCcw className="size-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Formatting info */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/40 rounded-xl px-3.5 py-2.5 border border-border/40">
                            <FileCode2 className="size-4 shrink-0 text-primary/70" />
                            <p className="line-clamp-1">{t("pg.notation")}</p>
                        </div>

                        {/* Action Bar */}
                        <div className="pt-2 flex items-center justify-between gap-3">
                            <div className="text-xs text-muted-foreground font-mono">
                                {rawInput.trim().length === 0 ? (
                                    <span>{t("pg.noInput")}</span>
                                ) : (
                                    <span className="text-foreground font-medium">
                                        {rawInput.length} {locale === "vi" ? "ký tự" : "chars"}
                                    </span>
                                )}
                            </div>

                            <Button
                                type="button"
                                disabled={rawInput.trim().length === 0 || isParsing}
                                onClick={handleParse}
                                className="gap-2 px-6 shadow-md transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-95"
                            >
                                {isParsing ? (
                                    <Sparkles className="size-4 animate-spin" />
                                ) : (
                                    <Play className="size-4 fill-current" />
                                )}
                                <span>{t("pg.generatePgn")}</span>
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Preview & Result Panel */}
                <Card className="lg:col-span-6 flex flex-col overflow-hidden border-border shadow-sm">
                    <CardHeader className="border-b border-border/60 bg-muted/30 px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <GitBranch className="size-4 text-primary" />
                                <CardTitle className="text-base font-semibold">{t("pg.preview")}</CardTitle>
                            </div>
                            {result && (
                                <Badge variant="outline" className="gap-1.5 text-xs font-normal border-primary/30 bg-primary/5 text-primary">
                                    <CheckCircle2 className="size-3" />
                                    {result.branches.length} {result.branches.length > 1 ? t("pg.branches") : (locale === "vi" ? "nhánh" : "branch")}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>

                    <CardContent className="flex-1 flex flex-col p-6 space-y-6">
                        {/* Stats Summary Bar */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 text-center">
                                <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    {t("pg.branches")}
                                </span>
                                <span className="text-xl font-bold mt-1 block text-foreground">
                                    {result?.branches.length ?? 0}
                                </span>
                            </div>
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 text-center">
                                <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    {locale === "vi" ? "Nước đi" : "Moves"}
                                </span>
                                <span className="text-xl font-bold mt-1 block text-primary">
                                    {activeBranch?.appliedCount ?? 0}
                                </span>
                            </div>
                            <div className="col-span-2 sm:col-span-1 rounded-xl border border-border/70 bg-card p-3.5 text-center">
                                <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    {locale === "vi" ? "Bỏ qua" : "Skipped"}
                                </span>
                                <span className={cn(
                                    "text-xl font-bold mt-1 block",
                                    (activeBranch?.skipped.length ?? 0) > 0 ? "text-destructive" : "text-emerald-500"
                                )}>
                                    {activeBranch?.skipped.length ?? 0}
                                </span>
                            </div>
                        </div>

                        {/* PGN Box Header & Actions */}
                        <div className="space-y-3 flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Layers className="size-3.5 text-primary" />
                                    {result ? t("pg.pgnPreview") : t("pg.noPreview")}
                                </span>

                                {activeBranch && (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleDownloadPgn}
                                            className="h-8 gap-1.5 text-xs"
                                            title="Download .pgn file"
                                        >
                                            <Download className="size-3.5" />
                                            <span>.pgn</span>
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => activeBranch && handleCopy(selectedBranch, activeBranch.pgn)}
                                            className="h-8 gap-1.5 text-xs"
                                        >
                                            {copiedBranch === selectedBranch ? (
                                                <>
                                                    <Check className="size-3.5 text-emerald-500" />
                                                    <span>{t("rev.copiedPgn")}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="size-3.5" />
                                                    <span>{t("rev.copyPgn")}</span>
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* PGN Code Block */}
                            <div className="flex-1 min-h-[200px] rounded-2xl border border-border/80 bg-muted/60 relative overflow-hidden">
                                <ScrollArea className="h-full max-h-[280px]">
                                    <pre className="p-4 font-mono text-xs sm:text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words select-all">
                                        {activeBranch?.pgn || (
                                            <span className="text-muted-foreground/60 italic flex items-center gap-2 pt-8 justify-center">
                                                <AlertCircle className="size-4 opacity-50" />
                                                {t("pg.noPreview")}
                                            </span>
                                        )}
                                    </pre>
                                </ScrollArea>
                            </div>
                        </div>

                        {/* Branch Variations Selector */}
                        {result && result.branches.length > 1 && (
                            <div className="space-y-3 pt-2">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                                    {t("pg.listbranch")} ({result.branches.length})
                                </span>
                                <ScrollArea className="max-h-[180px]">
                                    <div className="grid gap-2 pr-2">
                                        {result.branches.map((branch, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setSelectedBranch(idx)}
                                                className={cn(
                                                    "group flex items-center justify-between rounded-xl border p-3 text-left transition-all text-xs",
                                                    idx === selectedBranch
                                                        ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20"
                                                        : "border-border/60 bg-card hover:border-border hover:bg-accent/40"
                                                )}
                                            >
                                                <div className="space-y-1 min-w-0 pr-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-foreground">
                                                            {t("sg.branch")} #{idx + 1}
                                                        </span>
                                                        {idx === 0 && (
                                                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                                                {t("sg.mainBranch")}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-muted-foreground font-mono text-[11px] truncate">
                                                        {branch.sanHistory.slice(0, 6).join(" ")}
                                                        {branch.sanHistory.length > 6 ? "..." : ""}
                                                    </p>
                                                </div>
                                                <Badge
                                                    variant={idx === selectedBranch ? "default" : "outline"}
                                                    className="shrink-0 font-mono text-[11px]"
                                                >
                                                    {branch.appliedCount}/{branch.totalTokens} {locale === "vi" ? "nước" : "moves"}
                                                </Badge>
                                            </button>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

