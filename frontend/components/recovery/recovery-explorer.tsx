"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { chooseRecoveryLine, recoveryChoices, treeGroups, type RecoveryTreeLine } from "@/lib/recovery-tree";

interface Props {
  lines: RecoveryTreeLine[];
  selectedIndex: number;
  onSelect: (index: number, cursor: number) => void;
  fullyRecovered?: boolean;
  recoveredCount?: number;
}

export function RecoveryExplorer({ lines, selectedIndex, onSelect, fullyRecovered, recoveredCount }: Props) {
  const { t } = useT();
  const [point, setPoint] = useState(0);
  const groups = useMemo(() => treeGroups(lines), [lines]);
  const selected = lines[selectedIndex] ?? lines[0];
  const effectiveIndex = lines[selectedIndex] ? selectedIndex : 0;
  const group = groups.find(item => item.id === selected?.groupId);
  const points = group?.paddingIndices ?? [];
  const pointIndex = Math.min(point, Math.max(0, points.length - 1));
  const ply = points[pointIndex];
  const choices = useMemo(() => ply === undefined ? [] : recoveryChoices(lines, effectiveIndex, ply), [lines, effectiveIndex, ply]);
  if (!selected || !group) return null;

  function go(index: number) {
    setPoint(index);
    onSelect(effectiveIndex, points[index]); // Cursor before the padding move.
  }

  function scoreLabel(score: number | null) {
    if (score === null) return t("recoveryTree.unscored");
    // V4's integer mate encoding has no explicit mate-distance metadata.
    if (Math.abs(score) >= 99000) return t("recoveryTree.encodedScore", { value: score });
    return t("recoveryTree.score", { value: `${score >= 0 ? "+" : "−"}${(Math.abs(score) / 100).toFixed(2)}` });
  }

  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-3" aria-label={t("recoveryTree.title")}>
      <h3 className="text-sm font-semibold">{t("recoveryTree.title")}</h3>
      {fullyRecovered === false && <p role="status" className="text-xs text-warning">{t("recoveryTree.partial", { count: recoveredCount ?? 0 })}</p>}
      <label className="block space-y-1 text-xs">
        <span>{t("recoveryTree.group")}</span>
        <select className="h-10 w-full rounded border border-input bg-background px-2" value={group.id}
          onChange={event => {
            const next = groups.find(item => item.id === event.target.value);
            if (!next) return;
            setPoint(0);
            onSelect(next.lineIndices[0], next.paddingIndices[0] ?? 0);
          }}>
          {groups.map((item, index) => <option key={item.id} value={item.id}>
            {t("recoveryTree.groupOption", { number: index + 1, count: item.paddingIndices.length, paths: item.lineIndices.length })}
          </option>)}
        </select>
      </label>
      {points.length === 0 ? <p className="text-xs text-muted-foreground">{t("recoveryTree.noPadding")}</p> : <>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={pointIndex === 0} onClick={() => go(pointIndex - 1)}>{t("recoveryTree.previous")}</Button>
          <label className="min-w-0 flex-1 text-xs">
            <span className="sr-only">{t("recoveryTree.point")}</span>
            <select className="h-9 w-full rounded border border-input bg-background px-2" value={pointIndex} onChange={event => go(Number(event.target.value))}>
              {points.map((position, index) => <option key={position} value={index}>{t("recoveryTree.pointOption", { number: index + 1, ply: position + 1 })}</option>)}
            </select>
          </label>
          <Button size="sm" variant="outline" disabled={pointIndex === points.length - 1} onClick={() => go(pointIndex + 1)}>{t("recoveryTree.next")}</Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("recoveryTree.perspective")}</p>
        <div className="flex flex-col gap-2" role="group" aria-label={t("recoveryTree.choices")}>
          {choices.map((choice, rank) => <button type="button" key={choice.uci}
            aria-pressed={selected.uciMoves[ply!] === choice.uci}
            className={`flex min-h-11 items-center justify-between gap-3 rounded border px-3 py-2 text-left text-sm ${selected.uciMoves[ply!] === choice.uci ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}
            onClick={() => onSelect(chooseRecoveryLine(lines, effectiveIndex, ply!, choice.uci), ply! + 1)}>
            <span><span className="font-mono font-semibold">{choice.san}</span><span className="ml-2 text-xs text-muted-foreground">{t("recoveryTree.continuations", { count: choice.lineIndices.length })}</span></span>
            <span className="text-right"><span className="block font-mono">{scoreLabel(choice.score)}</span>
              {choice.side && <span className="block text-xs text-muted-foreground">{t(choice.side === "b" ? "recoveryTree.black" : "recoveryTree.white")}</span>}
              {rank === 0 && <span className="text-xs text-muted-foreground">{t("recoveryTree.suggested")}</span>}</span>
          </button>)}
        </div>
        <p className="text-xs text-muted-foreground">{t("recoveryTree.hint")}</p>
      </>}
    </section>
  );
}
