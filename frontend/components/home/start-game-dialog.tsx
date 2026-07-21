import { useT } from "@/lib/i18n";
import { PhysicalBoard } from "@/types/game.types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { encodeGameID } from "@/lib/id-utils";
import { useGameStore } from "@/lib/store";
import { invalidateFetchCache } from "@/lib/fetch-cache";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface Props {
    board: PhysicalBoard | null;
    gameID: string | null;
    onClose: () => void;
}

export function StartGameDialog({ board, gameID , onClose }: Props) {
    const router = useRouter();
    const { t } = useT();
    const [white, setWhite] = useState("");
    const [black, setBlack] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canStart = white.trim().length > 0 && black.trim().length > 0;

    const handleStart = async () => {
        if (!board || !gameID || !canStart) return;
        setLoading(true);
        setError(null);

        try {
            await Promise.all([
                fetch(`/games/${gameID}/rename`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ color: "White", name: white.trim() }),
                }),
                fetch(`/games/${gameID}/rename`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ color: "Black", name: black.trim() }),
                }),
            ]);

            useGameStore.getState().patchBoard(gameID, {
                WhiteName: white.trim(),
                BlackName: black.trim(),
            });

            useGameStore.getState().patchBoard(gameID, {
                WhiteName: white.trim(),
                BlackName: black.trim(),
            });
            invalidateFetchCache(`/games/${gameID}`);

            onClose();
            router.push(`/board?id=${encodeGameID(gameID)}`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t("sg.errUnknown"));
        } finally {
            setLoading(false);
        }
    };

    const handleOpenChange = (open: boolean) => {
        if (!open && !loading) {
            setWhite("");
            setBlack("");
            setError(null);
            onClose();
        }
    }

    return (
        <Dialog open={!!board} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[420px] px-5 sm:px-6 py-4 sm:py-5">
                <DialogHeader className="space-y-1 pb-1">
                    <DialogTitle className="text-base sm:text-lg">{t("sg.title")}</DialogTitle>
                    <p className="text-xs text-muted-foreground">{t("sg.fillName")} </p>
                </DialogHeader>

                <div className="space-y-5 py-2 px-0 5">
                    {board && (
                        <p className="text-xs text-muted-foreground">
                            {t("sg.board")}: <span className="font-medium text-foreground">{board.boardID}</span>
                        </p>
                    )}

                    {/* Fill Black name */}
                    <div className="space-y-2">
                        <Label htmlFor="sg-white">
                            {t("sg.whiteSide")} <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="sg-white"
                            placeholder={t("sg.playerName")}
                            value={white}
                            onChange={(e) => setWhite(e.target.value)}
                            disabled={loading}
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && canStart && handleStart()}
                        />
                    </div>

                    {/* Fill White name */}
                    <div className="space-y-2">
                        <Label htmlFor="sg-black">
                            {t("sg.blackSide")} <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="sg-black"
                            placeholder={t("sg.playerName")}
                            value={black}
                            onChange={(e) => setBlack(e.target.value)}
                            disabled={loading}
                            onKeyDown={(e) => e.key === "Enter" && canStart && handleStart()}
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="text-xs text-destructive">{error}</p>
                    )}
                </div>

                <DialogFooter className="gap-2 pt-2 sm:pt-3">
                    <Button className="w-full sm:w-auto" variant="outline" onClick={onClose} disabled={loading}>
                        {t("sg.cancel")}
                    </Button>
                    <Button className="w-full sm:w-auto" onClick={handleStart} disabled={loading || !canStart}>
                        {loading ? t("sg.starting") : t("sg.start")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}