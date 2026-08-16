"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { invalidateFetchCache } from "@/lib/fetch-cache";
import { useT } from "@/lib/i18n";
import { useGameStore } from "@/lib/store";
import { parseExcelGameFile, ExcelGameImport } from "@/lib/excel-game-import";
import { FileSpreadsheet, Settings2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_INCREMENT_MS, DEFAULT_INITIAL_TIME_MS, INITIAL_TIME_OPTIONS_MS } from "@/lib/time-control";

const INCREMENT_OPTIONS = [0, 1_000, 2_000, 5_000, 10_000, 15_000];

interface Props {
    gameID: string;
    whiteName: string;
    blackName: string;
    initialTimeMs?: number;
    incrementMs?: number;
    round: number;
    boardNumber?: string;
    location: string;
}
const BOARD_NUMBER_OPTIONS = Array.from(
    { length: 10 },
    (_, index) => String(index + 1),
);

function isPresetBoardNumber(value: string) {
    return BOARD_NUMBER_OPTIONS.includes(value.trim());
}

export function GameSetupDialog({ gameID, whiteName, blackName, initialTimeMs = DEFAULT_INITIAL_TIME_MS, incrementMs = DEFAULT_INCREMENT_MS, round, boardNumber: initialBoardNumber = "", location }: Props) {
    const { t } = useT();
    const { token } = useAuth();
    const [open, setOpen] = useState(false);
    const [white, setWhite] = useState(whiteName);
    const [black, setBlack] = useState(blackName);
    const [time, setTime] = useState(initialTimeMs);
    const [increment, setIncrement] = useState(incrementMs);
    const [selectedRound, setSelectedRound] = useState(round);
    const [boardNumber, setBoardNumber] = useState(initialBoardNumber);
    const [isCustomBoardNumber, setIsCustomBoardNumber] = useState(
        initialBoardNumber.trim() !== "" && 
        !isPresetBoardNumber(initialBoardNumber.trim())
    );
    const [gameLocation, setGameLocation] = useState(location);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [excelImport, setExcelImport] = useState<ExcelGameImport | null>(null);
    const [selectedExcelRow, setSelectedExcelRow] = useState("");
    const [excelError, setExcelError] = useState<string | null>(null);
    const excelInputRef = useRef<HTMLInputElement>(null);
    const clockLabel = (value: number) => value >= 3_600_000
        ? t("sg.hourOption", { n: value / 3_600_000 })
        : t(value === 60_000 ? "sg.minuteOption" : "sg.minutesOption", { n: value / 60_000 });
    const incrementLabel = (value: number) => t(value === 1_000 ? "sg.secondOption" : "sg.secondsOption", { n: value / 1_000 });

    useEffect(() => {
        if (!open) return;
        setWhite(whiteName);
        setBlack(blackName);
        setTime(initialTimeMs);
        setIncrement(incrementMs);
        setSelectedRound(round);
        setBoardNumber(initialBoardNumber);
        setIsCustomBoardNumber(
            initialBoardNumber.trim() !== "" && 
            !isPresetBoardNumber(initialBoardNumber.trim())
        );
        setGameLocation(location);
        setError(null);
        setExcelImport(null);
        setSelectedExcelRow("");
        setExcelError(null);
    }, [open, whiteName, blackName, initialTimeMs, incrementMs, round, location, initialBoardNumber]);

    const applyExcelRow = (index: string, imported = excelImport) => {
        setSelectedExcelRow(index);
        const row = imported?.rows[Number(index)];
        if (!row) return;
        const importedBoardNumber = String(row.boardNumber || "").trim();
        setWhite(row.whiteName);
        setBlack(row.blackName);
        setBoardNumber(importedBoardNumber);
        setIsCustomBoardNumber(
            importedBoardNumber !== "" && 
            !isPresetBoardNumber(importedBoardNumber)
        );
        if (row.location || imported?.location) setGameLocation(row.location ?? imported?.location ?? "");
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
        } catch {
            setExcelImport(null);
            setSelectedExcelRow("");
            setExcelError(t("sg.excelImportError"));
        } finally {
            if (excelInputRef.current) excelInputRef.current.value = "";
        }
    };

    const save = async () => {
        if (!token || !white.trim() || !black.trim()) return;
        const normalizedBoardNumber = boardNumber.trim();
        const parsedBoardNumber = Number(normalizedBoardNumber);
        if (!Number.isInteger(parsedBoardNumber) || parsedBoardNumber < 1) {
            setError(t("sg.boardNumberInvalid"));
            return;
        }
        if (isCustomBoardNumber && parsedBoardNumber <= 10) {
            setError(t("sg.boardNumberCustomInvalid"));
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const first = await fetch(`/games/${gameID}/rename`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ color: "White", name: white.trim(), initialTimeMs: time, incrementMs: increment, round: selectedRound, location: gameLocation.trim(), boardNumber: normalizedBoardNumber }),
            });
            if (!first.ok) throw new Error((await first.json().catch(() => null))?.error ?? t("sg.saveClockError"));

            const second = await fetch(`/games/${gameID}/rename`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ color: "Black", name: black.trim() }),
            });
            if (!second.ok) throw new Error((await second.json().catch(() => null))?.error ?? t("sg.savePlayerError"));

            useGameStore.getState().patchBoard(gameID, {
                WhiteName: white.trim(),
                BlackName: black.trim(),
                initialTimeMs: time,
                incrementMs: increment,
                round: selectedRound,
                boardNumber: normalizedBoardNumber,
                location: gameLocation.trim(),
            });
            invalidateFetchCache(`/games/${gameID}`);
            invalidateFetchCache("/games/current");
            setOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : t("sg.errUnknown"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !loading && setOpen(nextOpen)}>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setOpen(true)}>
                <Settings2 className="size-3.5" />{t("sg.configure")}
            </Button>
            <DialogContent className="max-w-md p-0">
                <DialogHeader>
                    <DialogTitle>{t("sg.configure")}</DialogTitle>
                    <p className="text-xs text-muted-foreground">{t("sg.configureHint")}</p>
                </DialogHeader>
                <div className="space-y-4 px-5 py-4">
                    <div className="flex items-center justify-end">
                        <input ref={excelInputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => void handleExcelFile(event.target.files?.[0])} />
                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => excelInputRef.current?.click()} disabled={loading} title={t("sg.excelImport")}>
                            <FileSpreadsheet className="size-3.5" />
                            <span>{t("sg.excelImport")}</span>
                            <Upload className="size-3.5" />
                        </Button>
                    </div>
                    {excelImport && (
                        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                            <Label htmlFor="board-setup-excel-row">{t("sg.excelChooseGame")}</Label>
                            <select id="board-setup-excel-row" value={selectedExcelRow} onChange={(event) => applyExcelRow(event.target.value)} disabled={loading} className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                                {excelImport.rows.map((row, index) => <option key={`${row.boardNumber}-${index}`} value={index}>{t("sg.excelGameOption", { n: row.boardNumber || String(index + 1), white: row.whiteName || t("sg.unknownPlayer"), black: row.blackName || t("sg.unknownPlayer") })}</option>)}
                            </select>
                            <p className="text-[11px] text-muted-foreground">{[t("common.boardNumber", { n: excelImport.rows[Number(selectedExcelRow)]?.boardNumber || t("sg.unknownPlayer") }), excelImport.tournament, excelImport.scheduledAt, excelImport.rows[Number(selectedExcelRow)]?.location].filter(Boolean).join(" · ")}</p>
                        </div>
                    )}
                    {excelError && <p className="text-xs text-destructive">{excelError}</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2"><Label htmlFor="board-setup-white">{t("sg.whiteSide")}</Label><Input id="board-setup-white" value={white} onChange={(event) => setWhite(event.target.value)} disabled={loading} /></div>
                        <div className="space-y-2"><Label htmlFor="board-setup-black">{t("sg.blackSide")}</Label><Input id="board-setup-black" value={black} onChange={(event) => setBlack(event.target.value)} disabled={loading} /></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2"><Label htmlFor="board-setup-time">{t("sg.time")}</Label><select id="board-setup-time" value={time} onChange={(event) => setTime(Number(event.target.value))} disabled={loading} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{INITIAL_TIME_OPTIONS_MS.map((option) => <option key={option} value={option}>{clockLabel(option)}</option>)}</select></div>
                        <div className="space-y-2"><Label htmlFor="board-setup-increment">{t("sg.increment")}</Label><select id="board-setup-increment" value={increment} onChange={(event) => setIncrement(Number(event.target.value))} disabled={loading} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{INCREMENT_OPTIONS.map((option) => <option key={option} value={option}>{incrementLabel(option)}</option>)}</select></div>
                    </div>
                    {/* Round Selection and Board Number */}
                    <div className="grid gap-3 sm:grid-cols-2">
                        {/* Round selection */}
                        <div className="space-y-2">
                            <Label htmlFor="board-setup-round">
                                {t("sg.round")}
                            </Label>

                            <select
                                id="board-setup-round"
                                value={selectedRound}
                                onChange={(event) => setSelectedRound(Number(event.target.value))}
                                disabled={loading}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) =>
                                    <option
                                        key={value}
                                        value={value}>{t("sg.roundOption", { n: value })}
                                    </option>
                                )}
                            </select>
                        </div>
                        {/* Board Number */}
                        <div className="space-y-2">
                            <Label htmlFor="board-setup-board-number">
                        {t("common.chessboard")}
                            </Label>

                            <select
                                id="board-setup-board-number"
                                value={isCustomBoardNumber ? "other" : boardNumber}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    if (value === "other") {
                                        setIsCustomBoardNumber(true);
                                        setBoardNumber("");
                                        return;
                                    }
                                    setIsCustomBoardNumber(false);
                                    setBoardNumber(value);
                                }}
                                disabled={loading}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="">
                                    {t("sg.boardNumberSelect")}
                                </option>
                                
                                {BOARD_NUMBER_OPTIONS.map((value) => (
                                    <option key={value} value={value}>
                                                {t("common.boardNumber", { n: value })}
                                    </option>
                                ))}
                                <option value="other">
                                    {t("sg.boardNumberOther")}
                                </option>
                            </select>
                            {isCustomBoardNumber && (
                                <Input
                                    id="board-setup-board-number-custom"
                                    type="number"
                                    min={11}
                                    step={1}
                                    inputMode="numeric"
                                    value={boardNumber}
                                    onChange={(event) => 
                                        setBoardNumber(event.target.value)
                                    }
                                    disabled={loading}
                                    placeholder={t("sg.boardNumberOtherPlaceholder")}
                                />
                            )}
                        </div>
                    </div>

                    {/* Location selection */}
                    <div className="space-y-2">
                        <Label htmlFor="board-setup-location">
                            {t("sg.location")}
                        </Label>
                        <Input
                            id="board-setup-location"
                            value={gameLocation}
                            onChange={(event) => setGameLocation(event.target.value)}
                            disabled={loading}
                            maxLength={160}
                            placeholder={t("sg.locationPlaceholder")}
                        />
                    </div>
                    {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={loading}>
                        {t("sg.cancel")}
                    </Button>
                    <Button size="sm" onClick={save} disabled={loading || !white.trim() || !black.trim()}>
                        {loading ? t("sg.starting") : t("sg.save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
