"use client"

import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/lib/i18n";
import { Check, Copy, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseUciBranches, ParseUciResult } from "./parse-uci";
import { cn } from "@/lib/utils";
import { RippleButton } from "@/components/ui/ripple-button";

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
        console.log("Parse result:", parsed);
        setSelectedBranch(0);
        setResult(parsed);
        setCopiedBranch(null)
    }

    async function handleCopy(idx: number, pgn: string) {
        await navigator.clipboard.writeText(pgn);
        setCopiedBranch(idx);
        setTimeout(() => {
            setCopiedBranch((current) => (current === idx ? null : current))
        }, 1500);
    }

    return (
        <>
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-background/60">
                <div>
                    <h1 className="text-3xl font-semibold py-5">{t("nav.import")}</h1>
                    <p className="text-2xs mt-0.5">
                        {t("pg.description")}
                    </p>
                    <div className="flex flex-1 items-center">
                        <Info className="size-4" />
                        <p className="px-2">{t("pg.notation")}</p>
                    </div>
                </div>
            </div>

            {/* Area to import game */}
            <div className="px-4 sm:px-5 pb-5 space-y-2 py-4">
                <div className="space-y-1">
                    {/* Area to import uci */}
                    <span className="text-2xs font-bold">{t("pg.pasteUCI")}</span>
                    <ScrollArea className="h-36 rounded-md border border-border bg-muted">
                        <textarea
                            value={rawInput}
                            onChange={(e) => setRawInput(e.target.value)}
                            autoCorrect="off"
                            className="w-full h-36 resize-none p-3 font-mono text-xs text-foreground bg-transparent outline-none whitespace-pre-wrap break-words placeholder:text-muted-foreground"
                        />
                    </ScrollArea>

                    {/* Button remove and generate */}
                    <div className="flex space-x-3 items-center justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleClear}
                            disabled={rawInput.trim().length === 0}
                            className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {t("pg.clear")}
                        </Button>

                        <Button 
                            disabled={rawInput.trim().length === 0} 
                            onClick={handleParse}
                            variant="outline"
                            type="button"
                            className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {t("pg.generatePgn")}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Area to display pgn */}
            {result && result.branches.length > 1 && (

                 
                <div className="px-4 sm:px-5 space-y-1">
                    <span className="text-2xs font-bold">{t("pg.listbranch")}</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                        {result.branches.map((branch, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => setSelectedBranch(idx)}
                                className={cn(
                                    "px-2.5 py-1 rounded-md border text-2xs font-mono transition-colors",
                                    idx === selectedBranch
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border bg-muted text-muted-foreground hover:text-foreground"
                                )}   
                                title={branch.sanHistory.join("")} 
                            >
                                {t("sg.branch")} {idx + 1} {branch.appliedCount} / {branch.totalTokens}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {activeBranch && (
                <div className="px-4 sm:px-5 space-y-1 py-4">
                    <div className="flex items-center justify-between">
                        <span className="text-2xs font-bold">
                            {t("sg.branch")} {selectedBranch + 1}
                        </span>
                        {/* Button copy */}
                        <button
                            type="button"
                            onClick={() => handleCopy(selectedBranch, activeBranch.pgn)}
                            className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {copiedBranch === selectedBranch ? (
                                <Check className="size-3"/>
                            ): (
                                <Copy className="size-3"/>
                            )}
                            {copiedBranch === selectedBranch ? t("rev.copiedPgn") : t("rev.copyPgn")}
                        </button>
                    </div>

                    {/* Area to display pgn */}
                    <ScrollArea className="h-40 rounded-md border border-border bg-muted">
                        <pre className="p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
                            {activeBranch.pgn}
                        </pre>
                    </ScrollArea>
                </div>
            )}
        </>
    );
}