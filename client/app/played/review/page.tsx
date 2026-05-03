import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PlayedReviewIndexPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-5 py-4 sm:py-5 space-y-3">
      <h1 className="text-lg font-semibold">Review</h1>
      <p className="text-sm text-muted-foreground">Chọn một ván trong lịch sử để xem phân tích chi tiết.</p>
      <Link href="/played" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Played
      </Link>
    </div>
  );
}
