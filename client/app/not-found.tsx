"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Castle } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-var(--header-h))] gap-4">
      <Castle className="h-12 w-12 text-muted-foreground/30" />
      <p className="text-sm font-medium">{t("notfound.title")}</p>
      <Button asChild variant="outline" size="sm">
        <Link href="/">{t("notfound.goHome")}</Link>
      </Button>
    </div>
  );
}
