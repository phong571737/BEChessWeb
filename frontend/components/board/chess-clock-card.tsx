import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatClockMs } from "@/hooks/use-chess-clock";

interface ChessClockCardProps {
  label: string;
  timeMs: number;
  active: boolean;
}

export function ChessClockCard({ label, timeMs, active }: ChessClockCardProps) {
  return (
    <Card
      className={cn(
        "rounded-sm border border-border bg-card text-card-foreground",
        active && "bg-accent font-semibold text-foreground"
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className={cn("text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>
          {label}
        </span>
        <span className={cn("font-mono text-sm tabular-nums", active ? "text-foreground" : "text-muted-foreground")}>
          {formatClockMs(timeMs)}
        </span>
      </div>
    </Card>
  );
}
