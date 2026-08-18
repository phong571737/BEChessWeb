"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Chess } from "chess.js";
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
    ScrollText,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    Swords,
    ListOrdered,
} from "lucide-react";
import { parseUciBranches, BranchResult, ParseUciResult } from "./parse-uci";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_RECOVERY_BRANCHES = 5;

function extractFenHistory(input: string): string[] | null {
    const lines = input.split(/\r?\n|;\s*/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return null;
    const fens = lines.map((line) => line.replace(/^\d+\.(\.\.\.)?\s+/, "").trim());
    if (!fens.every((fen) => fen.split(/\s+/).length === 6)) return null;
    try {
        fens.forEach((fen) => new Chess(fen, { skipValidation: true }));
        return fens;
    } catch {
        return null;
    }
}

function pgnMoves(pgn: string): string[] {
    return pgn.split(/\r?\n/).filter((line) => !line.trim().startsWith("[")).join(" ")
        .replace(/\{[^}]*\}/g, "").split(/\s+/).filter((token) => token && !/^\d+\.{1,3}$/.test(token));
}

interface RecoveryApiLine {
    uciMoves: string[];
    sanMoves: string[];
    movetext?: string;
}

interface RecoveryApiResponse {
    pgn?: string;
    fullyRecovered?: boolean;
    failedPlies?: number[];
    longestRecoveredPly?: number;
    bestMoveLists?: unknown;
}

function isRecoveryApiLine(value: unknown): value is RecoveryApiLine {
    if (!value || typeof value !== "object") return false;
    const line = value as Partial<RecoveryApiLine>;
    return Array.isArray(line.uciMoves) && Array.isArray(line.sanMoves);
}

function recoveryLinePgn(basePgn: string, line: RecoveryApiLine): string {
    const headers = basePgn
        .split(/\r?\n/)
        .filter((row) => row.trim().startsWith("["))
        .join("\n");
    const movetext = line.movetext?.trim() || line.sanMoves.map((san, index) => {
        const moveNumber = Math.floor(index / 2) + 1;
        return `${index % 2 === 0 ? `${moveNumber}.` : `${moveNumber}...`} ${san}`;
    }).join("\n");
    return `${headers}\n\n${movetext}`;
}

function recoveryResult(data: RecoveryApiResponse, fenHistory: string[]): ParseUciResult {
    if (!data.pgn) throw new Error("empty");
    const failedPlies = Array.isArray(data.failedPlies) ? data.failedPlies : [];
    const recoveryLines = Array.isArray(data.bestMoveLists)
        ? data.bestMoveLists.filter(isRecoveryApiLine)
        : [];
    const branches: BranchResult[] = recoveryLines.map((line) => {
        const skipped = line.uciMoves.flatMap((token, index) =>
            token === "X" ? [{ token, ply: index + 1 }] : []
        );
        return {
            pgn: recoveryLinePgn(data.pgn!, line),
            sanHistory: line.sanMoves,
            skipped,
            appliedCount: line.uciMoves.length - skipped.length,
            totalTokens: line.uciMoves.length,
            underpromotions: 0,
        };
    });
    if (branches.length === 0) {
        branches.push({
            pgn: data.pgn,
            sanHistory: pgnMoves(data.pgn),
            skipped: failedPlies.map((ply) => ({ token: "X", ply })),
            appliedCount: Math.max(0, fenHistory.length - failedPlies.length),
            totalTokens: fenHistory.length,
            underpromotions: 0,
        });
    }
    return {
        branches,
        mode: "fen",
        fullyRecovered: data.fullyRecovered === true,
        failedPlies,
        longestRecoveredPly: data.longestRecoveredPly,
    };
}

export function PasteGame() {
    const { t } = useT();
    const [rawInput, setRawInput] = useState("");
    const [fenInput, setFenInput] = useState("");
    const [result, setResult] = useState<ParseUciResult | null>(null);
    const [selectedBranch, setSelectedBranch] = useState(0);
    const [copiedBranch, setCopiedBranch] = useState<number | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [fenError, setFenError] = useState<string | null>(null);
    const [isFenRecovering, setIsFenRecovering] = useState(false);
    const [showAllRecoveryBranches, setShowAllRecoveryBranches] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

    useEffect(() => () => {
        timeoutRefs.current.forEach(clearTimeout);
        timeoutRefs.current = [];
    }, []);

    function schedule(callback: () => void, delay: number) {
        const timeout = setTimeout(() => {
            timeoutRefs.current = timeoutRefs.current.filter((item) => item !== timeout);
            callback();
        }, delay);
        timeoutRefs.current.push(timeout);
    }

    const activeBranch = useMemo(() => result?.branches[selectedBranch], [result, selectedBranch]);
    const visibleBranches = useMemo(() => {
        if (!result || result.mode !== "fen" || showAllRecoveryBranches) return result?.branches ?? [];
        return result.branches.slice(0, MAX_VISIBLE_RECOVERY_BRANCHES);
    }, [result, showAllRecoveryBranches]);

    const tokenCount = useMemo(() => {
        return rawInput.trim().split(/\s+/).filter(Boolean).length;
    }, [rawInput]);

    function handleClear() {
        setRawInput("");
        setFenInput("");
        setResult(null);
        setSelectedBranch(0);
        setCopiedBranch(null);
        setParseError(null);
        setFenError(null);
        setShowAllRecoveryBranches(false);
        textareaRef.current?.focus();
    }

    async function handleFenParse(fenHistory: string[]) {
        const response = await fetch("/games/recover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fenHistory }),
        });
        if (!response.ok) throw new Error(response.status === 503 ? "unavailable" : "failed");
        const data = await response.json() as RecoveryApiResponse;
        setResult(recoveryResult(data, fenHistory));
        setShowAllRecoveryBranches(false);
    }

    async function handleParse() {
        if (!rawInput.trim()) return;
        setIsParsing(true);
        setParseError(null);
        try {
            await new Promise<void>((resolve) => schedule(() => resolve(), 150));
            setResult({ ...parseUciBranches(rawInput), mode: "uci" });
            setSelectedBranch(0);
            setCopiedBranch(null);
        } catch (error) {
            setResult(null);
            setParseError(error instanceof Error && error.message === "unavailable" ? "unavailable" : "failed");
        } finally {
            setIsParsing(false);
        }
    }

    async function handleStrictFenRecovery() {
        if (!fenInput.trim()) return;
        setIsFenRecovering(true);
        setFenError(null);
        try {
            const fenHistory = extractFenHistory(fenInput);
            if (!fenHistory) throw new Error("invalid");
            const response = await fetch("/games/recover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fenHistory, strict: true }),
            });
            if (!response.ok) throw new Error(response.status === 503 ? "unavailable" : "failed");
            const data = await response.json() as RecoveryApiResponse;
            setResult(recoveryResult(data, fenHistory));
            setShowAllRecoveryBranches(false);
            setSelectedBranch(0);
            setCopiedBranch(null);
        } catch (error) {
            setFenError(error instanceof Error && error.message === "unavailable" ? "unavailable" : "failed");
        } finally {
            setIsFenRecovering(false);
        }
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
        schedule(() => {
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
        <div className="relative min-h-full min-w-0 max-w-full overflow-x-clip bg-background">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-72 overflow-hidden bg-gradient-to-b from-primary/8 via-accent/5 to-transparent" />
            {/* ─── Standard page header ───────────────────────────────── */}
            <div className="relative z-10 border-b border-border bg-card/60 backdrop-blur-sm">
                <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:py-6">
                    <div className="flex flex-col gap-5">
                        <div className="min-w-0 space-y-2">
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 shadow-sm shadow-primary/10 sm:size-11">
                                    <FileInput className="size-[18px] text-primary sm:size-5" />
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-xl font-bold tracking-tight sm:text-3xl">
                                        {t("nav.import")}
                                    </h1>
                                    <p className="text-xs text-muted-foreground mt-0.5 font-medium tracking-wide uppercase">
                                        {t("pg.converter")}
                                    </p>
                                </div>
                            </div>
                            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                                {t("pg.description")}
                            </p>
                        </div>

                    </div>
                </div>
            </div>

            <div className="relative z-10 border-b border-border/80 bg-background-secondary/70">
                <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-3 sm:gap-3 sm:px-6">
                    {[
                        { number: "01", title: t("pg.stepInput"), description: t("pg.stepInputDescription"), icon: Clipboard },
                        { number: "02", title: t("pg.stepRecover"), description: t("pg.stepRecoverDescription"), icon: GitFork },
                        { number: "03", title: t("pg.stepExport"), description: t("pg.stepExportDescription"), icon: Download },
                    ].map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <div key={step.number} className="flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-card/70 px-3 py-2.5 sm:px-4">
                                <span className="font-mono text-[10px] font-bold tracking-widest text-primary">{step.number}</span>
                                <Icon className="size-4 shrink-0 text-primary" />
                                <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-foreground">{step.title}</p>
                                    <p className="truncate text-[11px] text-muted-foreground">{step.description}</p>
                                </div>
                                {index < 2 && <ChevronRight className="ml-auto hidden size-3.5 shrink-0 text-muted-foreground/50 sm:block" />}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ─── Main Grid ─────────────────────────────────────────── */}
            <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
                <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] lg:gap-6">

                    {/* ── Input Panel ─────────────────────────────────── */}
                    <div className="flex min-w-0 flex-col gap-4">
                        {/* Card */}
                        <div className={cn(
                            "flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all sm:min-h-[420px] 2xl:min-h-[458px]",
                            isFocused && "border-primary/50 ring-1 ring-primary/30 shadow-md shadow-primary/5"
                        )}>
                            {/* Card Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background-secondary px-3 py-3 sm:px-5 sm:py-3.5">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                                        <Clipboard className="size-3.5 text-primary" />
                                    </div>
                                    <span className="truncate font-semibold text-sm">{t("pg.pasteUCI")}</span>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                                    {tokenCount > 0 && (
                                        <div className="flex items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-1 text-[11px] font-mono font-semibold text-primary sm:gap-1.5 sm:px-2">
                                            <ListOrdered className="size-3" />
                                            {tokenCount} {t("pg.tokens")}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handlePasteFromClipboard}
                                        className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground active:scale-95 sm:px-2.5"
                                    >
                                        <Clipboard className="size-3.5" />
                                        <span>{t("pg.paste")}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Textarea Area */}
                            <div className="relative min-h-[220px] flex-1 p-1.5 sm:min-h-[320px]">
                                <textarea
                                    ref={textareaRef}
                                    value={rawInput}
                                    onChange={(e) => {
                                        setRawInput(e.target.value);
                                    }}
                                    onFocus={() => setIsFocused(true)}
                                    onBlur={() => setIsFocused(false)}
                                    aria-label={t("pg.pasteUCI")}
                                    autoCorrect="off"
                                    spellCheck={false}
                                    onKeyDown={(e) => {
                                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleParse();
                                    }}
                                    className="h-full min-h-[220px] w-full resize-none rounded-md bg-transparent p-3 font-mono text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40 sm:min-h-[320px] sm:p-4 sm:text-sm"
                                    placeholder={t("pg.pastePlaceholder")}
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
                            <div className="border-t border-border bg-background-secondary px-3 py-3 sm:px-5 sm:py-3.5">
                                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                                            "flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-all duration-200 sm:w-auto",
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
                                {parseError && (
                                    <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                                        <AlertCircle className="size-3.5 shrink-0" />
                                        {t("pg.recoveryError")}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Dedicated FEN recovery panel */}
                        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm shadow-primary/5">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-background-secondary to-accent/10 px-3 py-3 sm:px-5 sm:py-3.5">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                                        <FileSearch className="size-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="block truncate font-semibold text-sm">{t("pg.fenInput")}</span>
                                        <span className="block truncate text-[11px] text-muted-foreground">{t("pg.fenDescription")}</span>
                                    </div>
                                </div>
                            </div>
                            <textarea
                                value={fenInput}
                                onChange={(event) => { setFenInput(event.target.value); setFenError(null); }}
                                aria-label={t("pg.fenInput")}
                                autoCorrect="off"
                                spellCheck={false}
                                className="min-h-[150px] w-full resize-y bg-transparent p-3 font-mono text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40 sm:min-h-[180px] sm:p-4 sm:text-sm"
                                placeholder={t("pg.fenPlaceholder")}
                            />
                            <div className="border-t border-border bg-background-secondary px-3 py-3 sm:px-5 sm:py-3.5">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    {fenError && (
                                        <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
                                            <AlertCircle className="size-3.5 shrink-0" />
                                            {fenError === "unavailable" ? t("pg.recoveryUnavailable") : t("pg.recoveryError")}
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        disabled={!fenInput.trim() || isFenRecovering}
                                        onClick={handleStrictFenRecovery}
                                        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto sm:w-auto"
                                    >
                                        <FileOutput className={cn("size-4", isFenRecovering && "animate-pulse")} />
                                        <span>{t("pg.recoverFen")}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Keyboard shortcut tip */}
                        <p className="text-center text-[11px] text-muted-foreground/60">
                            <kbd className="rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">
                                Ctrl+Enter
                            </kbd>
                            {" "}{t("pg.shortcutGenerate")}
                        </p>
                    </div>

                    {/* ── Result Panel ────────────────────────────────── */}
                    <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
                        <div className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:min-h-[420px] 2xl:min-h-[458px]">
                            {/* Card Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background-secondary px-3 py-3 sm:px-5 sm:py-3.5">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                                        <GitFork className="size-3.5 text-primary" />
                                    </div>
                                    <span className="truncate font-semibold text-sm">{t("pg.preview")}</span>
                                </div>
                                {result && (
                                    <div className="flex items-center gap-1.5 rounded-sm bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
                                        <CheckCircle2 className="size-3" />
                                        {result.branches.length} {result.branches.length > 1 ? t("pg.branches") : t("pg.branch")}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-1 flex-col gap-4 p-3 sm:gap-5 sm:p-5">
                                {result?.mode === "fen" && (
                                    <div className={cn(
                                        "rounded-md border px-3 py-2 text-xs",
                                        result.fullyRecovered ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"
                                    )}>
                                        {result.fullyRecovered
                                            ? t("pg.recoveryComplete")
                                            : t("pg.recoveryPartial", { count: result.failedPlies?.length ?? 0 })}
                                    </div>
                                )}
                                {/* Stats row */}
                                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                    {[
                                        {
                                            label: t("pg.branches"),
                                            value: result?.branches.length ?? 0,
                                            color: "text-foreground",
                                            bg: "bg-muted/40",
                                            icon: <GitFork className="size-3.5 text-muted-foreground" />
                                        },
                                        {
                                            label: t("pg.moves"),
                                            value: activeBranch?.appliedCount ?? 0,
                                            color: "text-primary",
                                            bg: "bg-primary/5",
                                            icon: <Swords className="size-3.5 text-primary" />
                                        },
                                        {
                                            label: t("pg.skipped"),
                                            value: activeBranch?.skipped.length ?? 0,
                                            color: (activeBranch?.skipped.length ?? 0) > 0 ? "text-destructive" : "text-success",
                                            bg: (activeBranch?.skipped.length ?? 0) > 0 ? "bg-destructive/5" : "bg-success/5",
                                            icon: <AlertCircle className={cn("size-3.5", (activeBranch?.skipped.length ?? 0) > 0 ? "text-destructive" : "text-success")} />
                                        },
                                    ].map((stat, i) => (
                                        <div key={i} className={cn("flex min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-border py-2.5 shadow-sm sm:py-3.5", stat.bg)}>
                                            <div className="flex items-center gap-1 mb-0.5">{stat.icon}</div>
                                            <span className={cn("text-lg font-bold tabular-nums sm:text-xl", stat.color)}>
                                                {stat.value}
                                            </span>
                                            <span className="truncate px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px] sm:tracking-wider">{stat.label}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* PGN output header + actions */}
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        <ScrollText className="size-3.5 text-primary" />
                                        {result ? t("pg.pgnPreview") : t("pg.noPreview")}
                                    </span>
                                    {activeBranch && (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleDownloadPgn}
                                                className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground active:scale-95"
                                                title={t("pg.downloadPgn")}
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
                                <div className="relative min-h-[180px] flex-1 overflow-hidden rounded-md border border-border bg-background-secondary sm:min-h-[220px]">
                                    {activeBranch?.pgn ? (
                                            <div className="max-h-[220px] overflow-auto sm:max-h-[260px]">
                                            <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-foreground select-all sm:p-4 sm:text-sm">
                                                {activeBranch.pgn}
                                            </pre>
                                        </div>
                                    ) : (
                                        <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 p-5 text-center sm:min-h-[220px] sm:p-6">
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
                                            {visibleBranches.map((branch, idx) => (
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
                                            {result.mode === "fen" && result.branches.length > MAX_VISIBLE_RECOVERY_BRANCHES && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (showAllRecoveryBranches && selectedBranch >= MAX_VISIBLE_RECOVERY_BRANCHES) setSelectedBranch(0);
                                                        setShowAllRecoveryBranches((expanded) => !expanded);
                                                    }}
                                                    className="self-center rounded-sm border border-border bg-background-secondary px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                                                >
                                                    {showAllRecoveryBranches
                                                        ? t("recovery.showFewerBranches")
                                                        : t("recovery.showMoreBranches", { count: result.branches.length - MAX_VISIBLE_RECOVERY_BRANCHES })}
                                                </button>
                                            )}
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
