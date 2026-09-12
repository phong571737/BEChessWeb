import type { ExcelGameImport } from "@/lib/excel-game-import";
import { DEFAULT_INCREMENT_MS, DEFAULT_INITIAL_TIME_MS } from "@/lib/time-control";

const STORAGE_KEY = "ttlab:bulk-game-setup-draft:v1";

export interface BulkGameSetupDraft {
    fileName: string;
    imported: ExcelGameImport;
    tournamentName: string;
    boardAssignments: Record<number, string>;
    selectedMatchIndex: number;
    applyClock: boolean;
    initialTimeMs: number;
    incrementMs: number;
}

export function readBulkGameSetupDraft(): BulkGameSetupDraft | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const draft = JSON.parse(raw) as Partial<BulkGameSetupDraft>;
        if (!draft.imported || !Array.isArray(draft.imported.rows) || draft.imported.rows.length === 0) return null;
        return {
            fileName: typeof draft.fileName === "string" ? draft.fileName : "",
            imported: draft.imported,
            tournamentName: typeof draft.tournamentName === "string" ? draft.tournamentName : (draft.imported.tournament ?? ""),
            boardAssignments: draft.boardAssignments && typeof draft.boardAssignments === "object" ? draft.boardAssignments : {},
            selectedMatchIndex: Number.isInteger(draft.selectedMatchIndex)
                ? Math.min(9, Math.max(0, Number(draft.selectedMatchIndex)))
                : 0,
            applyClock: typeof draft.applyClock === "boolean" ? draft.applyClock : true,
            initialTimeMs: Number.isFinite(draft.initialTimeMs) ? Number(draft.initialTimeMs) : DEFAULT_INITIAL_TIME_MS,
            incrementMs: Number.isFinite(draft.incrementMs) ? Number(draft.incrementMs) : DEFAULT_INCREMENT_MS,
        };
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

export function writeBulkGameSetupDraft(draft: BulkGameSetupDraft): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function removeBulkGameSetupDraft(): void {
    localStorage.removeItem(STORAGE_KEY);
}
