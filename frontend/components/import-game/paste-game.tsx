"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useT } from "@/lib/i18n";
import {
    FileInput,
    Copy,
    Check,
    Download,
    Clipboard,
    RotateCcw,
    GitFork,
    FileOutput,
    FileSearch,
    Library,
    ScrollText,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    Swords,
    ListOrdered,
} from "lucide-react";
import { parseUciBranches, ParseUciResult } from "./parse-uci";
import { cn } from "@/lib/utils";

// Sample UCI move presets for quick testing
const SAMPLES = [
    {
        name: "Scholar's Mate",
        label: "4 moves",
        uci: "e2e4 e7e5 d2d4 b8c6 f1c4 g8f6 d1f3 c6d4 f3f7",
        dot: "bg-warning",
    },
    {
        name: "Italian Game",
        label: "Classic",
        uci: "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4 e5d4 c3d4 c5b4",
        dot: "bg-success",
    },
    {
        name: "Ambiguous Capture",
        label: "Branching",
        uci: "e2e4 d7d5 e4d5 c7c6 d5c6 b8c6 g1f3 e7e5 f1c4 e5e4",
        dot: "bg-primary",
    },
];

export function PasteGame() {
    const { t, locale } = useT();
    const [rawInput, setRawInput] = useState("");
    const [result, setResult] = useState<ParseUciResult | null>(null);
    const [selectedBranch, setSelectedBranch] = useState(0);
    const [copiedBranch, setCopiedBranch] = useState<number | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const activeBranch = useMemo(() => result?.branches[selectedBranch], [result, selectedBranch]);

    const tokenCount = useMemo(() => {
        return rawInput.trim().split(/\s+/).filter(Boolean).length;
    }, [rawInput]);

    function handleClear() {
        setRawInput("");
        setResult(null);
        setSelectedBranch(0);
        setCopiedBranch(null);
        setSelectedPreset(null);
        textareaRef.current?.focus();
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

    function handleLoadSample(uci: string, presetIndex: number) {
        setRawInput(uci);
        setSelectedPreset(presetIndex);
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
            if (text) setRawInput(text);
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
        <div className="min-h-full bg-background">
            {/* ─── Standard page header ───────────────────────────────── */}
            <div className="border-b border-border bg-card/60">
                <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className="flex size-11 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 shadow-sm shadow-primary/10">
                                    <FileInput className="size-5 text-primary" />
                                </div>
                                <div>
                                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                                        {t("nav.import")}
                                    </h1>
                                    <p className="text-xs text-muted-foreground mt-0.5 font-medium tracking-wide uppercase">
                                        UCI → PGN Converter
                                    </p>
                                </div>
                            </div>
                            <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
                                {t("pg.description")}
                            </p>
                        </div>

                        {/* Sample Presets */}
                        <div className="flex flex-col gap-2 xl:items-end">
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                                <Library className="size-3" />
                                {locale === "vi" ? "Ví dụ mẫu" : "Quick Presets"}
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {SAMPLES.map((sample, idx) => (
                                    <button
                                        key={idx}
                                    onClick={() => handleLoadSample(sample.uci, idx)}
                                    className={cn(
                                            "group relative flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                                            selectedPreset === idx
                                                ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                                                : "border-border bg-card text-foreground hover:border-primary/25 hover:bg-surface-hover",
                                            "active:scale-[0.98]"
                                        )}
                                    >
                                        <span className={cn("size-1.5 rounded-full shrink-0", sample.dot)} />
                                        <span className="text-foreground">{sample.name}</span>
                                        <span className="text-muted-foreground">·</span>
                                        <span className="text-muted-foreground">{sample.label}</span>
                                        <ChevronRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 -ml-1 transition-all group-hover:translate-x-0.5" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Main Grid ─────────────────────────────────────────── */}
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]">

                    {/* ── Input Panel ─────────────────────────────────── */}
                    <div className="flex flex-col gap-4">
                        {/* Card */}
                        <div className={cn(
                            "flex min-h-[458px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-all",
                            isFocused && "border-primary/50 ring-1 ring-primary/30 shadow-md shadow-primary/5"
                        )}>
                            {/* Card Header */}
                            <div className="flex items-center justify-between border-b border-border bg-background-secondary px-5 py-3.5">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                                        <Clipboard className="size-3.5 text-primary" />
                                    </div>
                                    <span className="font-semibold text-sm">{t("pg.pasteUCI")}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {tokenCount > 0 && (
                                        <div className="flex items-center gap-1.5 rounded-sm bg-primary/10 px-2 py-1 text-[11px] font-mono font-semibold text-primary">
                                            <ListOrdered className="size-3" />
                                            {tokenCount} {t("pg.tokens")}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handlePasteFromClipboard}
                                        className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground active:scale-95"
                                    >
                                        <Clipboard className="size-3.5" />
                                        <span>{locale === "vi" ? "Dán" : "Paste"}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Textarea Area */}
                            <div className="relative flex-1 min-h-[320px] p-1.5">
                                <textarea
                                    ref={textareaRef}
                                    value={rawInput}
                                    onChange={(e) => {
                                        setRawInput(e.target.value);
                                        setSelectedPreset(null);
                                    }}
                                    onFocus={() => setIsFocused(true)}
                                    onBlur={() => setIsFocused(false)}
                                    aria-label={t("pg.pasteUCI")}
                                    autoCorrect="off"
                                    spellCheck={false}
                                    onKeyDown={(e) => {
                                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleParse();
                                    }}
                                    className="w-full h-full min-h-[320px] resize-none rounded-md bg-transparent p-4 font-mono text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40"
                                    placeholder={t("pg.pastePlaceholder") || "e2e4 e7e5 g1f3 b8c6 f1c4..."}
                                />
                                {rawInput.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleClear}
                                        className="absolute right-4 top-4 flex size-7 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-surface-hover hover:text-foreground active:scale-95"
                                        title={t("pg.clear")}
                                    >
                                        <RotateCcw className="size-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Card Footer */}
                            <div className="border-t border-border bg-background-secondary px-5 py-3.5">
                                <div className="flex items-center justify-between gap-3">
                                    {/* Hint */}
                                    <div className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground">
                                        <FileInput className="size-3.5 shrink-0 text-primary/50" />
                                        <span className="truncate">{t("pg.notation")}</span>
                                    </div>

                                    {/* Parse button */}
                                    <button
                                        type="button"
                                        disabled={rawInput.trim().length === 0 || isParsing}
                                        onClick={handleParse}
                                        className={cn(
                                            "shrink-0 flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-all duration-200",
                                            "bg-primary text-primary-foreground shadow-sm",
                                            "hover:bg-primary-hover hover:shadow-md hover:scale-[1.01]",
                                            "active:scale-[0.98]",
                                            "disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
                                        )}
                                    >
                                        {isParsing ? (
                                            <FileOutput className="size-4 animate-pulse" />
                                        ) : (
                                            <FileOutput className="size-4" />
                                        )}
                                        <span>{t("pg.generatePgn")}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Keyboard shortcut tip */}
                        <p className="text-center text-[11px] text-muted-foreground/60">
                            <kbd className="rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">
                                Ctrl+Enter
                            </kbd>
                            {" "}{locale === "vi" ? "để tạo PGN" : "to generate PGN"}
                        </p>
                    </div>

                    {/* ── Result Panel ────────────────────────────────── */}
                    <div className="flex flex-col gap-4">
                        <div className="flex min-h-[458px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                            {/* Card Header */}
                            <div className="flex items-center justify-between border-b border-border bg-background-secondary px-5 py-3.5">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                                        <GitFork className="size-3.5 text-primary" />
                                    </div>
                                    <span className="font-semibold text-sm">{t("pg.preview")}</span>
                                </div>
                                {result && (
                                    <div className="flex items-center gap-1.5 rounded-sm bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
                                        <CheckCircle2 className="size-3" />
                                        {result.branches.length} {result.branches.length > 1 ? t("pg.branches") : (locale === "vi" ? "nhánh" : "branch")}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-1 flex-col gap-5 p-5">
                                {/* Stats row */}
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        {
                                            label: t("pg.branches"),
                                            value: result?.branches.length ?? 0,
                                            color: "text-foreground",
                                            bg: "bg-muted/40",
                                            icon: <GitFork className="size-3.5 text-muted-foreground" />
                                        },
                                        {
                                            label: locale === "vi" ? "Nước đi" : "Moves",
                                            value: activeBranch?.appliedCount ?? 0,
                                            color: "text-primary",
                                            bg: "bg-primary/5",
                                            icon: <Swords className="size-3.5 text-primary" />
                                        },
                                        {
                                            label: locale === "vi" ? "Bỏ qua" : "Skipped",
                                            value: activeBranch?.skipped.length ?? 0,
                                            color: (activeBranch?.skipped.length ?? 0) > 0 ? "text-destructive" : "text-success",
                                            bg: (activeBranch?.skipped.length ?? 0) > 0 ? "bg-destructive/5" : "bg-success/5",
                                            icon: <AlertCircle className={cn("size-3.5", (activeBranch?.skipped.length ?? 0) > 0 ? "text-destructive" : "text-success")} />
                                        },
                                    ].map((stat, i) => (
                                        <div key={i} className={cn("flex flex-col items-center justify-center rounded-md border border-border py-3.5 gap-1 shadow-sm", stat.bg)}>
                                            <div className="flex items-center gap-1 mb-0.5">{stat.icon}</div>
                                            <span className={cn("text-xl font-bold tabular-nums", stat.color)}>
                                                {stat.value}
                                            </span>
                                            <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">{stat.label}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* PGN output header + actions */}
                                <div className="flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        <ScrollText className="size-3.5 text-primary" />
                                        {result ? t("pg.pgnPreview") : t("pg.noPreview")}
                                    </span>
                                    {activeBranch && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleDownloadPgn}
                                                className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground active:scale-95"
                                                title="Download .pgn file"
                                            >
                                                <Download className="size-3.5" />
                                                <span>.pgn</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => activeBranch && handleCopy(selectedBranch, activeBranch.pgn)}
                                                className={cn(
                                                    "flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-all active:scale-95",
                                                    copiedBranch === selectedBranch
                                                        ? "bg-success/10 text-success border border-success/30"
                                                        : "bg-secondary text-secondary-foreground border border-border/60 hover:bg-secondary/80"
                                                )}
                                            >
                                                {copiedBranch === selectedBranch ? (
                                                    <><Check className="size-3.5 text-success" /><span>{t("rev.copiedPgn")}</span></>
                                                ) : (
                                                    <><Copy className="size-3.5" /><span>{t("rev.copyPgn")}</span></>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* PGN Code block */}
                                <div className="relative min-h-[220px] flex-1 rounded-md border border-border bg-background-secondary overflow-hidden">
                                    {activeBranch?.pgn ? (
                                        <div className="overflow-auto max-h-[260px]">
                                            <pre className="p-4 font-mono text-xs sm:text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words select-all">
                                                {activeBranch.pgn}
                                            </pre>
                                        </div>
                                    ) : (
                                        <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center">
                                            <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground/50">
                                                <FileSearch className="size-6" />
                                            </div>
                                            <p className="text-sm text-muted-foreground/60 italic">{t("pg.noPreview")}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Branch Selector */}
                                {result && result.branches.length > 1 && (
                                    <div className="space-y-2.5">
                                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            <GitFork className="size-3" />
                                            {t("pg.listbranch")} ({result.branches.length})
                                        </span>
                                        <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                                            {result.branches.map((branch, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => setSelectedBranch(idx)}
                                                    className={cn(
                                                        "group flex items-center justify-between rounded-sm border px-3 py-2.5 text-left text-xs transition-all duration-150",
                                                        idx === selectedBranch
                                                            ? "border-primary/40 bg-primary/8 ring-1 ring-primary/20 shadow-sm"
                                                            : "border-border/60 bg-card hover:border-border hover:bg-surface-hover"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className={cn(
                                                            "size-1.5 rounded-full shrink-0 transition-colors",
                                                            idx === selectedBranch ? "bg-primary" : "bg-muted-foreground/30"
                                                        )} />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-semibold text-foreground">
                                                                    {t("sg.branch")} #{idx + 1}
                                                                </span>
                                                                {idx === 0 && (
                                                                    <span className="rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0 text-[10px] text-primary font-medium">
                                                                        {t("sg.mainBranch")}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-muted-foreground font-mono text-[11px] truncate mt-0.5">
                                                                {branch.sanHistory.slice(0, 7).join(" ")}
                                                                {branch.sanHistory.length > 7 ? "…" : ""}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className={cn(
                                                        "shrink-0 ml-2 font-mono text-[11px] rounded-lg border px-2 py-0.5 font-semibold tabular-nums",
                                                        idx === selectedBranch
                                                            ? "bg-primary/10 text-primary border-primary/20"
                                                            : "bg-muted/50 text-muted-foreground border-border/60"
                                                    )}>
                                                        {branch.appliedCount}/{branch.totalTokens}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
