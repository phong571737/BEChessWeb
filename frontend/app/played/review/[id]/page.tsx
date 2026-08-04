"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { useParams } from "next/navigation";
import { PGNReviewContent } from "@/components/played/pgn-modal";
import { MatchAnalysis } from "@/components/played/match-analysis";
import { Skeleton } from "@/components/ui/skeleton";
import type { HistoryGame } from "@/types/game.types";
import { fetchJSONCached } from "@/lib/fetch-cache";
import { useT } from "@/lib/i18n";
import { parsePgnHeader } from "@/lib/game-utils";

type LegacyHistoryGame = HistoryGame & {
  White?: string;
  Black?: string;
  whiteName?: string;
  blackName?: string;
  lastSeq?: number;
};

function ReviewSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-5 py-4 sm:py-5 space-y-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <Skeleton className="h-5 w-28" />
        <div className="flex flex-wrap gap-1.5">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-14" />
          <Skeleton className="h-7 w-14" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-12" />
        </div>
      </div>
      {/* Main card */}
      <div className="rounded-sm border border-border bg-background overflow-hidden">
        {/* PGN review content: board + info + moves */}
        <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5">
          <Skeleton className="w-full sm:w-[300px] md:w-[340px] aspect-square shrink-0" />
          <div className="flex-1 space-y-3 min-w-0">
            <Skeleton className="h-7 w-40" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          </div>
        </div>
        {/* Match analysis charts */}
        <div className="px-4 sm:px-5 pb-5 space-y-4 border-t border-border pt-4">
          <Skeleton className="h-5 w-36" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-[220px] w-full" />
            <Skeleton className="h-[220px] w-full" />
            <Skeleton className="h-[220px] w-full" />
            <Skeleton className="h-[220px] w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlayedReviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { t } = useT();
  const [game, setGame] = useState<HistoryGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const copiedResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const controller = new AbortController();
    fetchJSONCached<HistoryGame[]>("/games/history", 10_000, { signal: controller.signal })
      .then((rows: HistoryGame[]) => {
        if (cancelled) return;
        const raws = rows.find((x) => x._id === id) ?? null;
        if (!raws) {
          setGame(null); 
          return;
        }
        const legacy = raws as LegacyHistoryGame;
        const headers = parsePgnHeader(raws.pgn ?? "");
        setGame({
          ...raws,
          WhiteName: raws.WhiteName || legacy.whiteName || legacy.White || headers["White"] || "White",
          BlackName: raws.BlackName || legacy.blackName || legacy.Black || headers["Black"] || "Black",
          Result: (raws.Result || headers["Result"] || "*") as HistoryGame["Result"],
          Date: raws.Date || headers["Date"] || raws.createdAt || "",
          createdAt: raws.createdAt || raws.startedAt || raws.createAt,
          totalMoves: raws.totalMoves ?? legacy.lastSeq ?? raws.totalPlies ?? raws.uciHistory?.length ?? raws.fenHistory?.length ?? 0,
        });
      })
      .catch(() => {
        if (!cancelled) setGame(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  useEffect(() => () => {
    if (copiedResetTimerRef.current !== null) window.clearTimeout(copiedResetTimerRef.current);
  }, []);

  if (loading) return <ReviewSkeleton />;

  if (!game) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-5 py-4 sm:py-5 space-y-3">
        <Link href="/played" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("rev.backToHistory")}
        </Link>
        <div className="rounded-sm border border-border bg-card p-4 text-sm text-muted-foreground">
          {t("rev.notFound")}
        </div>
      </div>
    );
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${game.WhiteName} vs ${game.BlackName} - ${game.Result}`;

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (copiedResetTimerRef.current !== null) window.clearTimeout(copiedResetTimerRef.current);
      copiedResetTimerRef.current = window.setTimeout(() => {
        copiedResetTimerRef.current = null;
        setCopied(false);
      }, 1500);
    } catch {}
  };

  const onNativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: t("rev.share") + " | TTLab Chess", text: shareText, url: shareUrl });
      }
    } catch {}
  };

  const openShare = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer,width=720,height=640");
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-5 py-4 sm:py-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <Link href="/played" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("rev.backToHistory")}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={onNativeShare} className="h-7 px-2 rounded-sm border border-border text-xs hover:bg-accent inline-flex items-center gap-1.5">
            <Share2 className="h-3 w-3" />
            {t("rev.share")}
          </button>
          <button type="button" onClick={onCopyLink} className="h-7 px-2 rounded-sm border border-border text-xs hover:bg-accent inline-flex items-center gap-1.5">
            <Copy className="h-3 w-3" />
            {copied ? t("rev.copied") : t("rev.copyLink")}
          </button>
          <button type="button" onClick={() => openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)} className="h-7 px-2 rounded-sm border border-border text-xs hover:bg-accent">Facebook</button>
          <button type="button" onClick={() => openShare(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`)} className="h-7 px-2 rounded-sm border border-border text-xs hover:bg-accent">X</button>
          <button type="button" onClick={() => openShare(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`)} className="h-7 px-2 rounded-sm border border-border text-xs hover:bg-accent">Telegram</button>
          <button type="button" onClick={() => openShare(`https://zalo.me/share?url=${encodeURIComponent(shareUrl)}`)} className="h-7 px-2 rounded-sm border border-border text-xs hover:bg-accent">Zalo</button>
        </div>
      </div>
      <div className="rounded-sm border border-border bg-background overflow-hidden">
        <PGNReviewContent game={game} />
        <div className="px-4 sm:px-5 pb-5">
          <MatchAnalysis game={game} />
        </div>
      </div>
    </div>
  );
}
