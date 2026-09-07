"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-fetch";
import { ExcelGameImport, parseExcelGameFile } from "@/lib/excel-game-import";
import { useT } from "@/lib/i18n";
import { getLastTimeControl, saveLastTimeControl } from "@/lib/last-time-control";
import { DEFAULT_INCREMENT_MS, DEFAULT_INITIAL_TIME_MS, INITIAL_TIME_OPTIONS_MS } from "@/lib/time-control";
import type { ActiveGame } from "@/types/game.types";
import { FileSpreadsheet, Settings2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const INCREMENT_OPTIONS = [0, 1_000, 2_000, 5_000, 10_000, 15_000];

interface Props {
    activeGames: ActiveGame[];
    onApplied: () => void;
}

function boardKey(value?: string): string {
    const normalized = String(value ?? "").trim().toLowerCase();
    const number = normalized.match(/\d+$/)?.[0];
    return number ? String(Number(number)) : normalized;
}

export function BulkGameSetupDialog({ activeGames, onApplied }: Props) {
    const { t } = useT();
    const fileRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [imported, setImported] = useState<ExcelGameImport | null>(null);
    const [tournamentName, setTournamentName] = useState("");
    const [boardAssignments, setBoardAssignments] = useState<Record<number, string>>({});
    const [applyClock, setApplyClock] = useState(true);
    const [initialTimeMs, setInitialTimeMs] = useState(DEFAULT_INITIAL_TIME_MS);
    const [incrementMs, setIncrementMs] = useState(DEFAULT_INCREMENT_MS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const assignments = useMemo(() => (imported?.rows ?? []).flatMap((row, rowIndex) => {
        const game = activeGames.find((candidate) => candidate.gameID === boardAssignments[rowIndex]);
        return game && row.whiteName.trim() && row.blackName.trim() ? [{ game, row }] : [];
    }), [activeGames, boardAssignments, imported]);

    useEffect(() => {
        if (!open) return;
        const last = getLastTimeControl();
        setInitialTimeMs(last.initialTimeMs);
        setIncrementMs(last.incrementMs);
        setError(null);
    }, [open]);

    const importWorkbook = async (file?: File) => {
        if (!file) return;
        setError(null);
        try {
            const workbook = await parseExcelGameFile(file);
            if (!workbook.rows.length) throw new Error("EMPTY_WORKBOOK");
            const used = new Set<string>();
            const defaults: Record<number, string> = {};
            workbook.rows.forEach((row, rowIndex) => {
                const key = boardKey(row.boardNumber);
                const game = activeGames.find((candidate) => !used.has(candidate.gameID)
                    && (boardKey(candidate.boardNumber) === key || boardKey(candidate.boardID) === key));
                if (game && row.whiteName.trim() && row.blackName.trim()) {
                    used.add(game.gameID);
                    defaults[rowIndex] = game.gameID;
                }
            });
            setImported(workbook);
            setTournamentName(workbook.tournament ?? "");
            setBoardAssignments(defaults);
        } catch {
            setImported(null);
            setTournamentName("");
            setBoardAssignments({});
            setError(t("sg.excelImportError"));
        } finally {
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const assignWorkbookRow = (gameID: string, rowIndexValue: string) => {
        setBoardAssignments((current) => {
            const next = { ...current };
            // One physical board can receive one Excel row, and each Excel
            // row can be assigned to only one physical board.
            Object.entries(next).forEach(([rowIndex, assignedGameID]) => {
                if (assignedGameID === gameID) delete next[Number(rowIndex)];
            });
            if (rowIndexValue) next[Number(rowIndexValue)] = gameID;
            return next;
        });
    };

    const save = async () => {
        const selected = assignments;
        if (!selected.length) {
            setError(t("bulk.noBoardsSelected"));
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const response = await apiFetch("/games/bulk-setup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    applyClock,
                    ...(applyClock ? { initialTimeMs, incrementMs } : {}),
                    games: selected.map(({ game, row }) => ({
                        gameID: game.gameID,
                        whiteName: row.whiteName,
                        blackName: row.blackName,
                        round: game.round ?? 1,
                        boardNumber: row.boardNumber || game.boardNumber || "",
                        location: row.location ?? imported?.location ?? game.location ?? "",
                        tournament: tournamentName.trim() || row.tournament || imported?.tournament || game.tournament || "",
                    })),
                }),
            });
            const result = await response.json().catch(() => null) as { error?: string; updated?: string[]; failed?: unknown[] } | null;
            if (!response.ok) throw new Error(result?.error ?? "BULK_SETUP_FAILED");
            if (applyClock && (result?.updated?.length ?? 0) > 0) {
                saveLastTimeControl({ initialTimeMs, incrementMs });
            }
            onApplied();
            if ((result?.failed?.length ?? 0) > 0) {
                setError(t("bulk.partialFailure", { count: result?.failed?.length ?? 0 }));
                return;
            }
            setOpen(false);
        } catch {
            setError(t("bulk.saveError"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !loading && setOpen(next)}>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setOpen(true)}>
                <Settings2 className="size-3.5" />
                {t("bulk.open")}
            </Button>
            <DialogContent className="max-w-2xl p-0">
                <DialogHeader>
                    <DialogTitle>{t("bulk.title")}</DialogTitle>
                    <p className="text-xs text-muted-foreground">{t("bulk.hint")}</p>
                </DialogHeader>
                <div className="space-y-4 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">{t("bulk.importHint")}</p>
                        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => void importWorkbook(event.target.files?.[0])} />
                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => fileRef.current?.click()} disabled={loading}>
                            <FileSpreadsheet className="size-3.5" />
                            {t("sg.excelImport")}
                            <Upload className="size-3.5" />
                        </Button>
                    </div>

                    {imported && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{t("bulk.selectedBoards", { count: assignments.length })}</span>
                                <span>{t("bulk.mappingHint")}</span>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="bulk-tournament">{t("bulk.tournamentLabel")}</Label>
                                <input
                                    id="bulk-tournament"
                                    value={tournamentName}
                                    onChange={(event) => setTournamentName(event.target.value)}
                                    disabled={loading}
                                    placeholder={t("bulk.tournamentPlaceholder")}
                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                />
                            </div>
                            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                                {activeGames.map((game) => {
                                    const selectedRowIndex = Object.entries(boardAssignments)
                                        .find(([, assignedGameID]) => assignedGameID === game.gameID)?.[0] ?? "";
                                    const selectedRow = selectedRowIndex === "" ? null : imported.rows[Number(selectedRowIndex)] ?? null;
                                    return (
                                        <div key={game.gameID} className="grid gap-2 border-b border-border px-3 py-2 last:border-0 sm:grid-cols-[minmax(9rem,0.8fr)_minmax(8rem,0.7fr)_minmax(14rem,1.5fr)] sm:items-center">
                                            <span className="text-xs font-medium">{game.boardID ?? t("common.boardNumber", { n: game.boardNumber ?? "?" })}</span>
                                            <select aria-label={t("bulk.sourceBoard", { board: game.boardID ?? game.boardNumber ?? "?" })} value={selectedRowIndex} onChange={(event) => assignWorkbookRow(game.gameID, event.target.value)} disabled={loading} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                                                <option value="">{t("bulk.noBoard")}</option>
                                                {imported.rows.map((row, rowIndex) => {
                                                    const assignedElsewhere = boardAssignments[rowIndex] !== undefined && boardAssignments[rowIndex] !== game.gameID;
                                                    return <option key={`${row.boardNumber}-${rowIndex}`} value={rowIndex} disabled={assignedElsewhere || !row.whiteName.trim() || !row.blackName.trim()}>{t("common.boardNumber", { n: row.boardNumber || String(rowIndex + 1) })}</option>;
                                                })}
                                            </select>
                                            <span className="truncate text-xs text-muted-foreground">{selectedRow ? `${selectedRow.whiteName} — ${selectedRow.blackName}` : t("bulk.noPairing")}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {assignments.length === 0 && <p className="text-xs text-destructive">{t("bulk.noBoardsSelected")}</p>}
                        </div>
                    )}

                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={applyClock} onChange={(event) => setApplyClock(event.target.checked)} disabled={loading} />
                        {t("bulk.applyClock")}
                    </label>

                    {applyClock && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="bulk-clock">{t("sg.time")}</Label>
                                <select id="bulk-clock" value={initialTimeMs} onChange={(event) => setInitialTimeMs(Number(event.target.value))} disabled={loading} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                    {INITIAL_TIME_OPTIONS_MS.map((value) => <option key={value} value={value}>{value === 3_600_000 ? t("sg.hourOption", { n: 1 }) : t(value === 60_000 ? "sg.minuteOption" : "sg.minutesOption", { n: value / 60_000 })}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bulk-increment">{t("sg.increment")}</Label>
                                <select id="bulk-increment" value={incrementMs} onChange={(event) => setIncrementMs(Number(event.target.value))} disabled={loading} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                                    {INCREMENT_OPTIONS.map((value) => <option key={value} value={value}>{t(value === 1_000 ? "sg.secondOption" : "sg.secondsOption", { n: value / 1_000 })}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>{t("sg.cancel")}</Button>
                    <Button type="button" onClick={() => void save()} disabled={loading || !assignments.length}>{loading ? t("common.saving") : t("bulk.save", { count: assignments.length })}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
