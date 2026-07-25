"use client"

import { useT } from "@/lib/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Flag, Loader2, Ellipse, Ellipsis, AlertTriangle, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogDescription, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Branch } from "@/types/game.types";

interface Props {
    gameID: string;
    onRestart: () => Promise<void>;
    onResign: (resignSide: "white" | "black" | "draw", branchId: string | null) => Promise<void>;
    branches?: Branch[];
    isAdmin?: boolean;
}

type PendingAction = "restart" | "resign" | null;
type ResignStep = "branch" | "side";

const MAIN_GAME_ID = "__main__";
const PGN_RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

/** Counts the actual half-moves (plies) played in a PGN string, ignoring move numbers and the result token. */
function pgnMoveCount(pgn: string | undefined | null): number {
    if (!pgn) return 0;
    const movetext = pgn.split(/\n\s*\n/).pop() ?? "";
    const tokens = movetext.trim().split(/\s+/).filter(Boolean);
    const plies = tokens.filter((tok) => !/^\d+\.+$/.test(tok) && !PGN_RESULT_TOKENS.has(tok)).length;
    return plies;
}

/** Returns a short tail-end snippet of a PGN string, plus whether it was truncated */
function pgnPreview(pgn: string | undefined | null, maxTokens = 10): { text: string; truncated: boolean } {
    if (!pgn) return { text: "", truncated: false };
    const tokens = pgn.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return { text: "", truncated: false };
    const tail = tokens.slice(-maxTokens);
    return { text: tail.join(" "), truncated: tokens.length > maxTokens };
}


export function GameActions({ gameID, onRestart, onResign, branches = [], isAdmin = false }: Props) {
    void gameID;
    const { t } = useT();
    const [pending, setPending] = useState<PendingAction>(null);
    const [loading, setLoading] = useState(false);
    const [resignSide, setResignSide] = useState<"white" | "black" | "draw">("white");
    const [resignStep, setResignStep] = useState<ResignStep>("branch");
    const [selectedResignBranch, setSelectedResignBranch] = useState<string>(MAIN_GAME_ID);

    const hasBranches = branches.length > 0;
    const isRestartPending = pending === "restart";
    const isResignPending = pending === "resign";

    const openResign = () => {
        setResignSide("white");
        setResignStep(hasBranches ? "branch" : "side");
        setSelectedResignBranch(branches[0]?.id ?? MAIN_GAME_ID);
        setPending("resign");
    };

    const confirm = async () => {
        console.log("confirm() called, pending:", pending, "resignSide:", resignSide);
        if (!pending) return;
        setLoading(true);
        try {
            if (pending === "restart") await onRestart();
            if (pending === "resign") {
                const branchId = selectedResignBranch === MAIN_GAME_ID ? null : selectedResignBranch;
                await onResign(resignSide, branchId);
            }
        } finally {
            setLoading(false);
            setPending(null);
        }
    };

    const resignOptions = branches.map((b) => ({ id: b.id, branch: b,}));
    const selectedIndex = resignOptions.findIndex((o) => o.id === selectedResignBranch);

    return (
        <>
            {isAdmin && (
                <div className="flex gap-2 p-3 border-t border-border bg-muted/20">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="group flex-1 gap-1.5 border border-blue-500/30 bg-blue-500/10 text-blue-700 transition-transform hover:bg-blue-500/20 dark:text-blue-300 active:scale-[0.98]"
                        onClick={() => setPending("restart")}
                        aria-pressed={isRestartPending}
                        disabled={loading}
                    >
                        <RotateCcw className="h-3.5 w-3.5 transition-transform group-active:-rotate-90" />
                        {t("board.restart")}
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        className="group flex-1 gap-1.5 text-xs transition-transform active:scale-[0.98]"
                        onClick={openResign}
                        aria-pressed={isResignPending}
                        disabled={loading}
                    >
                        <Flag className="h-3.5 w-3.5 transition-transform group-active:rotate-12" />
                        {t("board.resign")}
                    </Button>
                </div>
            )}

            <Dialog open={pending !== null} onOpenChange={(o) => !o && !loading && setPending(null)}>
                <DialogContent className="max-w-sm overflow-hidden p-0">
                    <DialogHeader className="border-b border-border bg-muted/30 px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className={`flex size-9 shrink-0 items-center justify-center rounded-full ${isRestartPending ? "bg-blue-500/15 text-blue-600 dark:text-blue-300" : "bg-destructive/10 text-destructive"}`}>
                                {isRestartPending ? (
                                    <RotateCcw className={`size-4 ${loading ? "animate-spin" : "animate-[spin_0.6s_ease-in-out_1]"}`} />
                                ) : (
                                    <AlertTriangle className={`size-4 ${loading ? "animate-pulse" : "animate-[bounce_0.45s_ease-in-out_1]"}`} />
                                )}
                            </div>
                            <DialogTitle>
                                {isRestartPending ? t("board.restartTitle") : t("board.resignTitle")}
                            </DialogTitle>
                        </div>
                        <DialogDescription>
                            {isRestartPending
                                ? t("board.restartDesc")
                                : resignStep === "branch"
                                    ? t("board.resignSelectBranch") ?? "Chọn nhánh game để kết thúc"
                                    : t("board.resignDesc")}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Resign: Choose branch */}
                    <div className="space-y-4 px-5 py-4">
                    {isResignPending && resignStep === "branch" && (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                            {resignOptions.map(({ id, branch }, index) => {
                                const preview = pgnPreview(branch.pgn);
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedResignBranch(id)}
                                        disabled={loading}
                                        className={`w-full rounded-sm border px-3 py-2 text-left text-xs transition-all active:scale-[0.99] ${selectedResignBranch === id
                                            ? "border-primary/40 bg-accent text-foreground shadow-sm"
                                            : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                            }`}
                                    >
                                        <div className="flex items-baseline justify-between gap-2">
                                            <div className="font-medium">
                                                {id === MAIN_GAME_ID
                                                    ? t("sg.mainBranch") : `${t("sg.branch")} ${index + 1}`}
                                            </div>
                                            {branch && (
                                                <div className="shrink-0 text-[10px] opacity-60">
                                                    {pgnMoveCount(branch.pgn)} {t("sg.moves")}
                                                </div>
                                            )}
                                        </div>

                                        {/* Display pgn */}
                                        {preview.text && (
                                            <div className="flex items-center gap-1 text-[10px] font-mono opacity-70 mt-1 trucate">
                                                {/* {pgnPreview(branch.pgn)} */}
                                                {preview.truncated && <Ellipsis className="h-3 w-3 shrink-0"/>}
                                                <span className="truncate">{preview.text}</span>
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {/* Resign: Choose side resign */}
                    {isResignPending && resignStep === "side" && (
                        <>
                            {/* Display the selected branch */}
                            {hasBranches && (
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground border border-border/60 rounded-sm px-2.5 py-1.5 bg-muted/40">
                                    <span className="font-mono font-medium text-foreground truncate">
                                        {t("sg.branch")} {selectedIndex + 1}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setResignStep("branch")}
                                        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                                    >
                                        {t("sg.changeBranch")}
                                    </button>
                                </div>
                            )}

                            <div className="space-y-2">
                                {(["white", "black", "draw"] as const).map((side) => (

                                    <button
                                        key={side}
                                        type="button"
                                        onClick={() => setResignSide(side)}
                                        disabled={loading}
                                        className={`w-full rounded-sm border px-3 py-2 text-left text-xs transition-all active:scale-[0.99] ${resignSide === side
                                            ? side === "white"
                                                ? "border-slate-400 bg-slate-100 text-slate-950 shadow-sm dark:border-slate-400 dark:bg-slate-200 dark:text-slate-950"
                                                : side === "black"
                                                    ? "border-slate-700 bg-slate-900 text-white shadow-sm dark:border-slate-500 dark:bg-slate-950"
                                                    : "border-amber-500/50 bg-amber-500/10 text-foreground shadow-sm"
                                            : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between gap-2 font-medium">
                                            {side === "white" ? t("board.whiteResign")
                                                : side === "black" ? t("board.blackResign")
                                                    : t("board.agreeDraw")}
                                            {resignSide === side && <Check className={`size-3.5 ${side === "black" ? "text-white" : side === "draw" ? "text-amber-600" : "text-slate-700"}`} />}
                                        </div>
                                        <div className="text-[11px] opacity-80">
                                            {side === "white" ? t("board.whiteResignResult")
                                                : side == "black" ? t("board.blackResignResult")
                                                    : t("board.agreeDrawResult")}
                                        </div>
                                    </button>

                                    // <button
                                    //     type="button"
                                    //     onClick={() => setResignSide("black")}
                                    //     className={`w-full rounded-sm border px-3 py-2 text-left text-xs transition-colors ${resignSide === "black"
                                    //             ? "border-border bg-accent text-foreground"
                                    //             : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                    //         }`}
                                    // >
                                    //     <div className="font-medium">{t("board.blackResign")}</div>
                                    //     <div className="text-[11px] opacity-80">{t("board.blackResignResult")}</div>
                                    // </button>
                                    // <button
                                    //     type="button"
                                    //     onClick={() => setResignSide("draw")}
                                    //     className={`w-full rounded-sm border px-3 py-2 text-left text-xs transition-colors ${resignSide === "draw"
                                    //             ? "border-border bg-accent text-foreground"
                                    //             : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                    //         }`}
                                    // >
                                    //     <div className="font-medium">{t("board.agreeDraw")}</div>
                                    //     <div className="text-[11px] opacity-80">{t("board.agreeDrawResult")}</div>
                                    // </button>
                                ))}
                            </div>
                        </>
                    )}

                    </div>
                    {/* Button abort and confirm */}
                    <DialogFooter className="border-t border-border bg-muted/20 px-5 py-3 sm:justify-end">
                        <Button variant="outline" size="sm" onClick={() => setPending(null)} disabled={loading}>
                            {t("sg.cancel")}
                        </Button>

                        {/* Confirm after choose branch */}
                        {isResignPending && resignStep === "branch" && (
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => setResignStep("side")}
                                className="bg-state-black hover:bg-state-white/90"
                            >
                                {t("sg.next")}
                            </Button>
                        )}

                        {(isRestartPending || resignStep === "side") && (
                            <Button
                                variant={isResignPending && resignSide !== "draw" ? "destructive" : "default"}
                                size="sm"
                                onClick={confirm}
                                disabled={loading}
                                className="min-w-24 transition-transform active:scale-[0.98]"
                            >
                                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                                {isRestartPending ? t("board.restart") : resignSide === "draw" ? t("board.confirmDraw") : t("board.confirmResult")}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
