"use client";

import { useState } from "react";
import { MockGameEndView } from "@/components/board/mock-game-end-view";

export default function EndgameDemoPage() {
    const [scenario, setScenario] = useState<"white-win" | "black-win" | "draw">("white-win");

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-4">Endgame Demo</h1>
                    <p className="text-muted-foreground mb-6">
                        Chọn một kịch bản để preview trang endgame:
                    </p>

                    <div className="flex gap-3 flex-wrap">
                        {(
                            [
                                { id: "white-win", label: "White Win (Đầu hàng)" },
                                { id: "black-win", label: "Black Win (Đầu hàng)" },
                                { id: "draw", label: "Draw (Hoà)" },
                            ] as const
                        ).map((option) => (
                            <button
                                key={option.id}
                                onClick={() => setScenario(option.id)}
                                className={`px-4 py-2 rounded-md font-medium transition-all ${
                                    scenario === option.id
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-foreground hover:bg-muted/80"
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Preview */}
                <div className="border border-border rounded-lg overflow-hidden bg-card">
                    <div className="p-4 border-b border-border bg-muted/50">
                        <p className="text-sm font-medium">
                            Preview: {scenario === "white-win" ? "Trắng thắng" : scenario === "black-win" ? "Đen thắng" : "Hoà"}
                        </p>
                    </div>
                    <MockGameEndView scenario={scenario} />
                </div>

                <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <h3 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">💡 Hướng dẫn:</h3>
                    <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Chọn kịch bản bên trên</li>
                        <li>• Xem preview trang endgame</li>
                        <li>• Để xem đầy đủ: chạy <code className="bg-muted px-2 py-1 rounded">npm run dev</code></li>
                        <li>• Truy cập: <code className="bg-muted px-2 py-1 rounded">http://localhost:3000/endgame-demo</code></li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
