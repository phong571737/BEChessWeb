"use client"

import * as React from "react";
import { Tooltip, type TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label: string;
    color: string;
    icon?: React.ComponentType<{ className?: string }>;
  }
>;

const ChartContext = React.createContext<ChartConfig | null>(null);

export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: React.ReactNode;
}) {
  const styleVars = Object.fromEntries(
    Object.entries(config).map(([key, item]) => [`--color-${key}`, item.color])
  ) as React.CSSProperties;

  return (
    <ChartContext.Provider value={config}>
      <div className={cn("w-full", className)} style={styleVars}>
        {children}
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = Tooltip;

export function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel,
  className,
  formatter,
}: TooltipProps<ValueType, NameType> & {
  hideLabel?: boolean;
  className?: string;
  formatter?: (
    value: ValueType,
    name: NameType,
    item: NonNullable<TooltipProps<ValueType, NameType>["payload"]>[number],
    index: number
  ) => React.ReactNode;
}) {
  const config = React.useContext(ChartContext);
  if (!active || !payload?.length) return null;

  return (
    <div className={cn("min-w-[160px] rounded-sm border border-border bg-popover px-2.5 py-2 text-xs shadow-sm", className)}>
      {!hideLabel && label != null && (
        <div className="mb-1 text-muted-foreground">{String(label)}</div>
      )}
      <div className="space-y-1">
        {payload.map((item, index) => {
          const key = String(item.dataKey ?? item.name ?? "");
          const cfg = config?.[key];
          const Icon = cfg?.icon;

          if (formatter) {
            return (
              <div key={`${key}-${index}`} className="flex flex-wrap items-center gap-1.5">
                {formatter(item.value ?? 0, item.name ?? key, item, index)}
              </div>
            );
          }

          return (
            <div key={`${key}-${index}`} className="flex items-center gap-1.5">
              {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: item.color }} />}
              <span className="text-muted-foreground">{cfg?.label ?? key}</span>
              <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
                {item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}