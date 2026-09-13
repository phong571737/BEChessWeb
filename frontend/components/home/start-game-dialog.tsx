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
import { DEFAULT_INCREMENT_MS, DEFAULT_INITIAL_TIME_MS, INITIAL_TIME_OPTIONS_MS } from "@/lib/time-control";
import { parseExcelGameFile, ExcelGameImport } from "@/lib/excel-game-import";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useRef } from "react";

interface Props {
    board: PhysicalBoard | null;
    gameID: string | null;
    onClose: () => void;
}

const INCREMENT_OPTIONS = [0, 1_000, 2_000, 5_000, 10_000, 15_000];

export function StartGameDialog({ board, gameID , onClose }: Props) {
    const router = useRouter();
    const { t } = useT();
    const { isAdmin, token } = useAuth();
    const [white, setWhite] = useState("");
    const [black, setBlack] = useState("");
    const [initialTimeMs, setInitialTimeMs] = useState(DEFAULT_INITIAL_TIME_MS);
    const [incrementMs, setIncrementMs] = useState(DEFAULT_INCREMENT_MS);
    const [round, setRound] = useState(1);
    const [location, setLocation] = useState("");
    const [excelImport, setExcelImport] = useState<ExcelGameImport | null>(null);
    const [selectedExcelRow, setSelectedExcelRow] = useState("");
    const [excelError, setExcelError] = useState<string | null>(null);
    const [boardNumber, setBoardNumber] = useState("");
    const excelInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canStart = white.trim().length > 0 && black.trim().length > 0;

    const applyExcelRow = (index: string, imported = excelImport) => {
        setSelectedExcelRow(index);
        const row = imported?.rows[Number(index)];
        if (!row) return;
        setWhite(row.whiteName);
        setBlack(row.blackName);
        setBoardNumber(row.boardNumber || "");
        if (row.location || imported?.location) setLocation(row.location ?? imported?.location ?? "");
        setExcelError(null);
    };

    const handleExcelFile = async (file: File | undefined) => {
        if (!file) return;
        setExcelError(null);
        try {
            const imported = await parseExcelGameFile(file);
            if (!imported.rows.length) throw new Error("No player pairings were found in this workbook.");
            setExcelImport(imported);
            applyExcelRow("0", imported);
        } catch (error) {
            setExcelImport(null);
            setSelectedExcelRow("");
            setExcelError(t("sg.excelImportError"));
        } finally {
            if (excelInputRef.current) excelInputRef.current.value = "";
        }
    };

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
                    round,
                    location: location.trim(),
                    boardNumber: boardNumber.trim(),
                }),
            });
            if (!whiteResponse.ok) {
                const body = await whiteResponse.json().catch(() => null);
                throw new Error(body?.error || t("sg.saveClockError"));
            }

            const blackResponse = await fetch(`/games/${gameID}/rename`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ color: "Black", name: black.trim(), boardNumber: boardNumber.trim() }),
            });
            if (!blackResponse.ok) {
                const body = await blackResponse.json().catch(() => null);
                throw new Error(body?.error || t("sg.savePlayerError"));
            }

            useGameStore.getState().patchBoard(gameID, {
                whiteName: white.trim(),
                blackName: black.trim(),
                initialTimeMs,
                incrementMs,
                round,
                location: location.trim(),
                boardNumber: boardNumber.trim(),
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
            setExcelImport(null);
            setSelectedExcelRow("");
            setExcelError(null);
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
                    {t("common.chessboard")}: <span className="font-medium text-foreground">{board.boardID}</span>
                        </p>
                    )}

                    {/* Fill Black name */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="sg-white">
                                {t("sg.whiteSide")} <span className="text-destructive">*</span>
                            </Label>
                            <input ref={excelInputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => void handleExcelFile(event.target.files?.[0])} />
                            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => excelInputRef.current?.click()} disabled={loading} title={t("sg.excelImport") }>
                                <FileSpreadsheet className="size-3.5" />
                                <span className="hidden sm:inline">{t("sg.excelImport")}</span>
                                <Upload className="size-3.5" />
                            </Button>
                        </div>
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

                    {excelImport && (
                        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                            <Label htmlFor="sg-excel-row">{t("sg.excelChooseGame")}</Label>
                            <select id="sg-excel-row" value={selectedExcelRow} onChange={(event) => applyExcelRow(event.target.value)} disabled={loading} className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                                {excelImport.rows.map((row, index) => <option key={`${row.boardNumber}-${index}`} value={index}>{t("sg.excelGameOption", { n: row.boardNumber || String(index + 1), white: row.whiteName || t("sg.unknownPlayer"), black: row.blackName || t("sg.unknownPlayer") })}</option>)}
                            </select>
                            <p className="text-[11px] text-muted-foreground">{[t("common.boardNumber", { n: excelImport.rows[Number(selectedExcelRow)]?.boardNumber || t("sg.unknownPlayer") }), excelImport.tournament, excelImport.scheduledAt, excelImport.rows[Number(selectedExcelRow)]?.location].filter(Boolean).join(" · ")}</p>
                        </div>
                    )}
                    {excelError && <p className="text-xs text-destructive">{excelError}</p>}

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
                            <Label htmlFor="sg-clock">{t("sg.clock")}</Label>
                            <select
                                id="sg-clock"
                                value={initialTimeMs}
                                onChange={(e) => setInitialTimeMs(Number(e.target.value))}
                                disabled={loading}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                {INITIAL_TIME_OPTIONS_MS.map(value => (
                                    <option key={value} value={value}>{value === 3_600_000 ? t("sg.hourOption", { n: 1 }) : t(value === 60_000 ? "sg.minuteOption" : "sg.minutesOption", { n: value / 60_000 })}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sg-increment">{t("sg.increment")}</Label>
                            <select
                                id="sg-increment"
                                value={incrementMs}
                                onChange={(e) => setIncrementMs(Number(e.target.value))}
                                disabled={loading}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                {INCREMENT_OPTIONS.map(value => (
                                    <option key={value} value={value}>{t(value === 1_000 ? "sg.secondOption" : "sg.secondsOption", { n: value / 1_000 })}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="sg-round">{t("sg.round")}</Label>
                        <select
                            id="sg-round"
                            value={round}
                            onChange={(e) => setRound(Number(e.target.value))}
                            disabled={loading}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                                <option key={value} value={value}>{t("sg.roundOption", { n: value })}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="sg-location">{t("sg.location")}</Label>
                        <Input id="sg-location" placeholder={t("sg.locationPlaceholder")} value={location} onChange={(e) => setLocation(e.target.value)} disabled={loading} maxLength={160} />
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
