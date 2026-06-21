"use client"

import { useT } from "@/lib/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Flag, Loader2, Ellipse, Ellipsis } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogDescription, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Branch } from "@/types/game.types";

interface Props {
    gameID: string;
    onRestart: () => Promise<void>;
    onResign: (resignSide: "white" | "black" | "draw", branchId: string | null) => Promise<void>;
    branches?: Branch[];
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


export function GameActions({ gameID, onRestart, onResign, branches = [] }: Props) {
    void gameID;
    const { t } = useT();
    const [pending, setPending] = useState<PendingAction>(null);
    const [loading, setLoading] = useState(false);
    const [resignSide, setResignSide] = useState<"white" | "black" | "draw">("white");
    const [resignStep, setResignStep] = useState<ResignStep>("branch");
    const [selectedResignBranch, setSelectedResignBranch] = useState<string>(MAIN_GAME_ID);

    const hasBranches = branches.length > 0;

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
            <div className="flex gap-2 p-3 border-t border-border">
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs"
                    onClick={() => setPending("restart")}
                >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("board.restart")}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs text-destructive hover:text-destructive"
                    onClick={openResign}
                >
                    <Flag className="h-3.5 w-3.5" />
                    {t("board.resign")}
                </Button>
            </div>

            <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>
                            {pending === "restart" ? t("board.restartTitle") : t("board.resignTitle")}
                        </DialogTitle>
                        <DialogDescription>
                            {pending === "restart"
                                ? t("board.restartDesc")
                                : resignStep === "branch"
                                    ? t("board.resignSelectBranch") ?? "Chọn nhánh game để kết thúc"
                                    : t("board.resignDesc")}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Resign: Choose branch */}
                    {pending === "resign" && resignStep === "branch" && (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                            {resignOptions.map(({ id, branch }, index) => {
                                const preview = pgnPreview(branch.pgn);
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedResignBranch(id)}
                                        className={`w-full rounded-sm border px-3 py-2 text-left text-xs transition-colors ${selectedResignBranch === id
                                            ? "border-border bg-accent text-foreground"
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
                    {pending === "resign" && resignStep === "side" && (
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
                                        className={`w-full rounded-sm border px-3 py-2 text-left text-xs transition-colors ${resignSide === side
                                            ? "border-border bg-accent text-foreground"
                                            : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                            }`}
                                    >
                                        <div className="font-medium">
                                            {side === "white" ? t("board.whiteResign")
                                                : side === "black" ? t("board.blackResign")
                                                    : t("board.agreeDraw")}
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

                    {/* Button abort and confirm */}
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setPending(null)}>
                            {t("sg.cancel")}
                        </Button>

                        {/* Confirm after choose branch */}
                        {pending === "resign" && resignStep === "branch" && (
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => setResignStep("side")}
                                className="bg-state-black hover:bg-state-white/90"
                            >
                                {t("sg.next")}
                            </Button>
                        )}

                        {(pending === "restart" || resignStep === "side") && (
                            <Button
                                variant="default"
                                size="sm"
                                onClick={confirm}
                                disabled={loading}
                                className={
                                    pending !== "resign"
                                        ? ""
                                        : resignSide === "white"
                                            ? "bg-state-black text-white hover:bg-state-black/90"
                                            : resignSide === "black"
                                                ? "bg-state-white text-white hover:bg-state-white/90"
                                                : "bg-muted text-foreground hover:bg-muted/80"
                                }
                            >
                                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                                {pending === "restart" ? t("board.restart") : resignSide === "draw" ? t("board.confirmDraw") : t("board.confirmResult")}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}