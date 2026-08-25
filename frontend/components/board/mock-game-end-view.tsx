"use client";

import { Trophy, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface MockGameEndViewProps {
    scenario: "white-win" | "black-win" | "draw";
}

export function MockGameEndView({ scenario }: MockGameEndViewProps) {
    const isDraw = scenario === "draw";
    const whiteWins = scenario === "white-win";
    const blackWins = scenario === "black-win";

    const result = isDraw ? "1/2-1/2" : whiteWins ? "1-0" : "0-1";
    const resultLabel = isDraw ? "Hoà" : whiteWins ? "Trắng thắng" : "Đen thắng";

    const whiteName = "Player A";
    const blackName = "Player B";

    const winnerName = isDraw ? null : whiteWins ? whiteName : blackName;
    const loserName = isDraw ? null : whiteWins ? blackName : whiteName;

    return (
        <div className="flex items-center justify-center min-h-screen p-4 sm:p-6 bg-background">
            <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 lg:gap-8 w-full max-w-[860px]">
                {/* Board Area */}
                <div className="w-full max-w-[480px] shrink-0 rounded overflow-hidden ring-2 ring-border/40">
                    <div className="w-full aspect-square bg-gradient-to-br from-primary/10 via-muted to-muted flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground mb-2">Bàn cờ cuối cùng</p>
                            <div className="text-4xl">♔</div>
                        </div>
                    </div>
                </div>

                {/* Info Panel */}
                <div className="flex flex-col gap-5 lg:pt-3 items-center lg:items-start text-center lg:text-left w-full max-w-[320px]">
                    {/* Names */}
                    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full bg-[#f0f0f0] border border-black/15 shrink-0" />
                            {whiteName}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-50">
                            vs
                        </span>
                        <span className="flex items-center gap-1.5">
                            {blackName}
                            <span className="size-2.5 rounded-full bg-[#1a1a1a] border border-white/10 shrink-0" />
                        </span>
                    </div>

                    {/* Result */}
                    <div className="flex flex-col items-center lg:items-start gap-3">
                        {/* Trophy Icon */}
                        <div
                            className={cn(
                                "size-14 rounded-full flex items-center justify-center",
                                isDraw ? "bg-yellow-500/10" : "bg-green-500/10"
                            )}
                        >
                            <Trophy
                                className={cn(
                                    "size-7",
                                    isDraw ? "text-yellow-500" : "text-green-500"
                                )}
                            />
                        </div>

                        {/* Text */}
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold">Ván cờ kết thúc</h2>
                            <p className="text-sm font-medium">
                                {result} — {resultLabel}
                            </p>
                            {isDraw ? (
                                <p className="text-xs text-muted-foreground">Hoà được đồng ý</p>
                            ) : winnerName && loserName ? (
                                <p className="text-xs text-muted-foreground">đầu hàng</p>
                            ) : null}
                        </div>

                        {/* Winner/Loser Info */}
                        {!isDraw && winnerName && loserName && (
                            <div className="space-y-1 w-full">
                                {/* Winner */}
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="size-2.5 rounded-full bg-green-500/80 shrink-0" />
                                    <span className="font-medium">{winnerName}</span>
                                    <span className="text-muted-foreground">thắng</span>
                                </div>
                                {/* Loser */}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="size-2.5 rounded-full bg-red-500/60 shrink-0" />
                                    <span className="font-medium text-foreground">{loserName}</span>
                                    <span>đầu hàng</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-2 flex-wrap justify-center lg:justify-start">
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/">
                                <Home className="size-3.5 mr-1.5" />
                                Trang chủ
                            </Link>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/played">Xem lịch sử</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
