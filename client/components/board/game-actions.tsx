"use client";

import { useState } from "react";
import { RotateCcw, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  gameID:    string;
  onRestart: () => Promise<void>;
  onResign:  (resignSide: "white" | "black" | "draw") => Promise<void>;
}

type PendingAction = "restart" | "resign" | null;

export function GameActions({ gameID, onRestart, onResign }: Props) {
  void gameID;
  const { t } = useT();
  const [pending, setPending]   = useState<PendingAction>(null);
  const [loading, setLoading]   = useState(false);
  const [resignSide, setResignSide] = useState<"white" | "black" | "draw">("white");

  const confirm = async () => {
    if (!pending) return;
    setLoading(true);
    try {
      if (pending === "restart") await onRestart();
      if (pending === "resign")  await onResign(resignSide);
    } finally {
      setLoading(false);
      setPending(null);
    }
  };

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
          onClick={() => {
            setResignSide("white");
            setPending("resign");
          }}
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
              {pending === "restart" ? t("board.restartDesc") : t("board.resignDesc")}
            </DialogDescription>
          </DialogHeader>
          {pending === "resign" && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setResignSide("white")}
                className={`w-full rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
                  resignSide === "white"
                    ? "border-border bg-accent text-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <div className="font-medium">{t("board.whiteResign")}</div>
                <div className="text-[11px] opacity-80">{t("board.whiteResignResult")}</div>
              </button>
              <button
                type="button"
                onClick={() => setResignSide("black")}
                className={`w-full rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
                  resignSide === "black"
                    ? "border-border bg-accent text-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <div className="font-medium">{t("board.blackResign")}</div>
                <div className="text-[11px] opacity-80">{t("board.blackResignResult")}</div>
              </button>
              <button
                type="button"
                onClick={() => setResignSide("draw")}
                className={`w-full rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
                  resignSide === "draw"
                    ? "border-border bg-accent text-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <div className="font-medium">{t("board.agreeDraw")}</div>
                <div className="text-[11px] opacity-80">{t("board.agreeDrawResult")}</div>
              </button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPending(null)}>
              {t("sg.cancel")}
            </Button>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
