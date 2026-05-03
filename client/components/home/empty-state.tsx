"use client";

import { Castle } from "lucide-react";
import { useT } from "@/lib/i18n";

export function EmptyState() {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-80 gap-4 p-8">
      <Castle className="w-16 h-16 text-muted-foreground/30" />
      <p className="text-sm font-medium text-muted-foreground">{t("home.noGames")}</p>
      <p className="text-xs text-muted-foreground/60 text-center">
        {t("home.noGamesHint")}
      </p>
    </div>
  );
}
