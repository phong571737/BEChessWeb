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
import { useAuth } from "@/lib/auth-context";

interface Props {
    board: PhysicalBoard | null;
    gameID: string | null;
    onClose: () => void;
}

const CLOCK_OPTIONS = [
    { label: "1 phút", value: 60_000 },
    { label: "3 phút", value: 180_000 },
    { label: "5 phút", value: 300_000 },
    { label: "10 phút", value: 600_000 },
    { label: "15 phút", value: 900_000 },
    { label: "30 phút", value: 1_800_000 },
];

const INCREMENT_OPTIONS = [
    { label: "0 giây", value: 0 },
    { label: "1 giây", value: 1_000 },
    { label: "2 giây", value: 2_000 },
    { label: "5 giây", value: 5_000 },
    { label: "10 giây", value: 10_000 },
];

export function StartGameDialog({ board, gameID , onClose }: Props) {
    const router = useRouter();
    const { t } = useT();
    const { isAdmin, token } = useAuth();
    const [white, setWhite] = useState("");
    const [black, setBlack] = useState("");
    const [initialTimeMs, setInitialTimeMs] = useState(600_000);
    const [incrementMs, setIncrementMs] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canStart = white.trim().length > 0 && black.trim().length > 0;

    const handleStart = async () => {
        if (!isAdmin || !token || !board || !gameID || !canStart) return;
        setLoading(true);
        setError(null);

        try {
            // Save names + clock settings in one request
            const whiteResponse = await fetch(`/games/${gameID}/rename`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    color: "White",
                    name: white.trim(),
                    initialTimeMs,
                    incrementMs,
                }),
            });
            if (!whiteResponse.ok) {
                const body = await whiteResponse.json().catch(() => null);
                throw new Error(body?.error || "Unable to save game clock settings");
            }

            const blackResponse = await fetch(`/games/${gameID}/rename`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ color: "Black", name: black.trim() }),
            });
            if (!blackResponse.ok) {
                const body = await blackResponse.json().catch(() => null);
                throw new Error(body?.error || "Unable to save player name");
            }

            useGameStore.getState().patchBoard(gameID, {
                WhiteName: white.trim(),
                BlackName: black.trim(),
                initialTimeMs,
                incrementMs,
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

                    {/* Clock settings */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="sg-clock">Thời gian</Label>
                            <select
                                id="sg-clock"
                                value={initialTimeMs}
                                onChange={(e) => setInitialTimeMs(Number(e.target.value))}
                                disabled={loading}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                {CLOCK_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sg-increment">Thêm thời gian</Label>
                            <select
                                id="sg-increment"
                                value={incrementMs}
                                onChange={(e) => setIncrementMs(Number(e.target.value))}
                                disabled={loading}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                {INCREMENT_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
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
