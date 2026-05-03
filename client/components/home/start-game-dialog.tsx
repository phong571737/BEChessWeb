"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { encodeGameID } from "@/lib/id-utils";
import { useT } from "@/lib/i18n";
import type { PhysicalBoard } from "@/types/game.types";

interface Props {
  board: PhysicalBoard | null;
  onClose: () => void;
}

export function StartGameDialog({ board, onClose }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [white, setWhite]   = useState("");
  const [black, setBlack]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const canStart = white.trim().length > 0 && black.trim().length > 0;

  const handleStart = async () => {
    if (!board || !canStart) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          WhiteName: white.trim(),
          BlackName: black.trim(),
          boardID: board.boardID,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const { gameID } = await res.json();
      if (!gameID) throw new Error(t("sg.errNoGameID"));

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
  };

  return (
    <Dialog open={!!board} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{t("sg.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {board && (
            <p className="text-xs text-muted-foreground">
              {t("sg.board")}: <span className="font-medium text-foreground">{board.boardID}</span>
            </p>
          )}

          <div className="space-y-1.5">
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

          <div className="space-y-1.5">
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

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("sg.cancel")}
          </Button>
          <Button onClick={handleStart} disabled={loading || !canStart}>
            {loading ? t("sg.starting") : t("sg.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
