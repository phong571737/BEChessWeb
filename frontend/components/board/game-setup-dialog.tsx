"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { invalidateFetchCache } from "@/lib/fetch-cache";
import { useT } from "@/lib/i18n";
import { useGameStore } from "@/lib/store";
import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

const CLOCK_OPTIONS = [
    { label: "1 phút", value: 60_000 },
    { label: "3 phút", value: 180_000 },
    { label: "5 phút", value: 300_000 },
    { label: "10 phút", value: 600_000 },
    { label: "15 phút", value: 900_000 },
    { label: "30 phút", value: 1_800_000 },
    { label: "1 giờ", value: 3_600_000 },
];

const INCREMENT_OPTIONS = [
    { label: "0 giây", value: 0 },
    { label: "1 giây", value: 1_000 },
    { label: "2 giây", value: 2_000 },
    { label: "5 giây", value: 5_000 },
    { label: "10 giây", value: 10_000 },
];

interface Props {
    gameID: string;
    whiteName: string;
    blackName: string;
    initialTimeMs?: number;
    incrementMs?: number;
    round: number;
    location: string;
}

export function GameSetupDialog({ gameID, whiteName, blackName, initialTimeMs = 600_000, incrementMs = 0, round, location }: Props) {
    const { t } = useT();
    const { token } = useAuth();
    const [open, setOpen] = useState(false);
    const [white, setWhite] = useState(whiteName);
    const [black, setBlack] = useState(blackName);
    const [time, setTime] = useState(initialTimeMs);
    const [increment, setIncrement] = useState(incrementMs);
    const [selectedRound, setSelectedRound] = useState(round);
    const [gameLocation, setGameLocation] = useState(location);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setWhite(whiteName);
        setBlack(blackName);
        setTime(initialTimeMs);
        setIncrement(incrementMs);
        setSelectedRound(round);
        setGameLocation(location);
        setError(null);
    }, [open, whiteName, blackName, initialTimeMs, incrementMs, round, location]);

    const save = async () => {
        if (!token || !white.trim() || !black.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const first = await fetch(`/games/${gameID}/rename`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ color: "White", name: white.trim(), initialTimeMs: time, incrementMs: increment, round: selectedRound, location: gameLocation.trim() }),
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
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2"><Label htmlFor="board-setup-white">{t("sg.whiteSide")}</Label><Input id="board-setup-white" value={white} onChange={(event) => setWhite(event.target.value)} disabled={loading} /></div>
                        <div className="space-y-2"><Label htmlFor="board-setup-black">{t("sg.blackSide")}</Label><Input id="board-setup-black" value={black} onChange={(event) => setBlack(event.target.value)} disabled={loading} /></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2"><Label htmlFor="board-setup-time">{t("sg.time")}</Label><select id="board-setup-time" value={time} onChange={(event) => setTime(Number(event.target.value))} disabled={loading} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{CLOCK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                        <div className="space-y-2"><Label htmlFor="board-setup-increment">{t("sg.increment")}</Label><select id="board-setup-increment" value={increment} onChange={(event) => setIncrement(Number(event.target.value))} disabled={loading} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{INCREMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                    </div>
                    <div className="space-y-2"><Label htmlFor="board-setup-round">{t("sg.round")}</Label><select id="board-setup-round" value={selectedRound} onChange={(event) => setSelectedRound(Number(event.target.value))} disabled={loading} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{t("sg.roundOption", { n: value })}</option>)}</select></div>
                    <div className="space-y-2"><Label htmlFor="board-setup-location">{t("sg.location")}</Label><Input id="board-setup-location" value={gameLocation} onChange={(event) => setGameLocation(event.target.value)} disabled={loading} maxLength={160} placeholder={t("sg.locationPlaceholder")} /></div>
                    {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
                <DialogFooter><Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={loading}>{t("sg.cancel")}</Button><Button size="sm" onClick={save} disabled={loading || !white.trim() || !black.trim()}>{loading ? t("sg.starting") : t("sg.save")}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
