"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { encodeGameID } from "@/lib/id-utils";
import {
  AlertCircle, Bluetooth, BluetoothOff, CheckCircle2, Cpu, ExternalLink,
  Loader2, PlayCircle, RefreshCw, ScanSearch, StopCircle,
  Terminal, Wifi, WifiOff, Zap,
} from "lucide-react";
import { useBle, type BleDevice } from "@/hooks/use-ble";
import { usePhysicalBoards } from "@/hooks/use-physical-boards";
import { BleConfigForm } from "@/components/device/ble-config-form";
import { OtaUploader } from "@/components/device/ota-uploader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// ── helpers ──────────────────────────────────────────────────────
function fmtLastSeen(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5)    return "vừa xong";
  if (sec < 60)   return `${sec}s trước`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m trước`;
  return `${Math.floor(sec / 3600)}h trước`;
}

// ── WiFi board card ───────────────────────────────────────────────
function WifiBoardCard({ board }: {
  board: { boardID: string; gameID: string | null; online: boolean; lastSeen: number; ip?: string | null };
}) {
  const { t } = useT();
  const [age, setAge] = useState(() => fmtLastSeen(board.lastSeen));
  useEffect(() => {
    const id = setInterval(() => setAge(fmtLastSeen(board.lastSeen)), 5_000);
    return () => clearInterval(id);
  }, [board.lastSeen]);

  const inGame = !!board.gameID;
  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-lg border bg-card transition-all duration-150",
      inGame
        ? "border-blue-500/25"
        : "border-border"
    )}>
      <div className={cn(
        "w-2.5 h-2.5 rounded-full shrink-0",
        inGame
          ? "bg-blue-500 shadow-[0_0_6px_1px_rgba(59,130,246,0.5)]"
          : "bg-green-500 shadow-[0_0_6px_1px_rgba(34,197,94,0.5)] animate-pulse"
      )} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-mono font-medium">{board.boardID}</span>
          <Badge variant={inGame ? "default" : "secondary"} className="text-[10px] h-4.5 px-1.5">
            {inGame ? t("dev.inGame") : t("dev.ready")}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
          {board.ip && <span className="font-mono opacity-70">{board.ip}</span>}
          <span className="flex items-center gap-1">
            <Wifi className="w-3 h-3 opacity-60" />{age}
          </span>
        </div>
      </div>
      {board.gameID && (
        <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1.5 shrink-0">
          <Link href={`/board?id=${encodeGameID(board.gameID)}`}>
            <ExternalLink className="w-3 h-3" />
            {t("dev.viewGame")}
          </Link>
        </Button>
      )}
    </div>
  );
}

// ── BLE device card ───────────────────────────────────────────────
function BleDeviceCard({ device, active, onConnect, onDisconnect }: {
  device:      BleDevice;
  active:      boolean;
  onConnect:   (d: BleDevice) => void;
  onDisconnect: () => void;
}) {
  const { t } = useT();
  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-150",
      device.connected
        ? "border-green-500/30 bg-green-500/5"
        : "border-border bg-card"
    )}>
      {/* BLE icon + connection dot */}
      <div className="relative shrink-0">
        <div className={cn(
          "size-9 rounded-md flex items-center justify-center",
          device.connected ? "bg-green-500/10" : "bg-muted"
        )}>
          <Bluetooth className={cn(
            "w-4 h-4",
            device.connected ? "text-green-500" : "text-muted-foreground/50"
          )} />
        </div>
        {device.connected && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_4px_1px_rgba(34,197,94,0.6)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{device.name}</span>
          {device.remembered && !device.connected && (
            <span className="text-[10px] text-muted-foreground border border-border rounded-md px-1.5 py-px">{t("dev.paired")}</span>
          )}
          {device.connected && (
            <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-green-600">{t("dev.connected")}</Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/60 font-mono mt-0.5 truncate">{device.id}</p>
      </div>

      <div className="shrink-0">
        {device.connected ? (
          <Button size="sm" variant="outline" className="h-8 px-3 text-xs gap-1.5" onClick={onDisconnect}>
            <BluetoothOff className="w-3 h-3" />
            {t("dev.disconnect")}
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            disabled={active}
            onClick={() => onConnect(device)}
          >
            {active ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            {active ? t("dev.connecting") : t("dev.connect")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Chess board for missing-piece feedback ────────────────────────
const FILES  = ["a","b","c","d","e","f","g","h"] as const;
const RANKS_VISUAL = [8,7,6,5,4,3,2,1] as const;

/** Standard starting position — only ranks 1,2,7,8 have pieces */
const STARTING_PIECES: Record<string, string> = {
  a1:"♖", b1:"♘", c1:"♗", d1:"♕", e1:"♔", f1:"♗", g1:"♘", h1:"♖",
  a2:"♙", b2:"♙", c2:"♙", d2:"♙", e2:"♙", f2:"♙", g2:"♙", h2:"♙",
  a7:"♟", b7:"♟", c7:"♟", d7:"♟", e7:"♟", f7:"♟", g7:"♟", h7:"♟",
  a8:"♜", b8:"♞", c8:"♝", d8:"♛", e8:"♚", f8:"♝", g8:"♞", h8:"♜",
};

function MissingBoard({ missing }: { missing: string[] }) {
  const missingSet = new Set(missing);
  return (
    <div className="inline-grid grid-cols-8 gap-px rounded-md overflow-hidden border border-border bg-border">
      {RANKS_VISUAL.flatMap(rank =>
        FILES.map((file, fi) => {
          const sq      = `${file}${rank}`;
          const piece   = STARTING_PIECES[sq];
          const isDark  = (fi + rank) % 2 === 0;
          const absent  = missingSet.has(sq);
          return (
            <div
              key={sq}
              title={sq}
              className={cn(
                "w-8 h-8 flex items-center justify-center text-[15px] select-none font-serif",
                absent
                  ? "bg-red-500 text-white"
                  : piece
                  ? isDark
                    ? "bg-amber-800/75 text-amber-50"
                    : "bg-amber-100   text-amber-900"
                  : isDark
                  ? "bg-stone-600/30"
                  : "bg-stone-100/10"
              )}
            >
              {absent ? "?" : (piece ?? "")}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Game control section ──────────────────────────────────────────
type GameState = "idle" | "ok" | "missing" | "duplicate" | "error";

function GameControl({
  onSend, disabled,
}: {
  onSend:   (cmd: string) => Promise<string>;
  disabled: boolean;
}) {
  const { t } = useT();
  const [scanning,   setScanning]   = useState(false);
  const [gameState,  setGameState]  = useState<GameState>("idle");
  const [missing,    setMissing]    = useState<string[]>([]);

  const handleStart = async () => {
    setScanning(true);
    setGameState("idle");
    setMissing([]);
    const resp = await onSend("START");
    setScanning(false);

    if (resp.startsWith("OK:")) {
      // OK: STARTED
      setGameState("ok");
    } else if (resp.includes("MISSING_PIECES:")) {
      const detail = resp.slice(resp.indexOf("MISSING_PIECES:") + "MISSING_PIECES:".length);
      setMissing(detail.split(",").map(s => s.trim()).filter(Boolean));
      setGameState("missing");
    } else if (resp.includes("DUPLICATE_UID")) {
      setGameState("duplicate");
    } else {
      setGameState("error");
    }
  };

  const handleStop = async () => {
    await onSend("STOP");
    setGameState("idle");
    setMissing([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <PlayCircle className="w-4 h-4 text-muted-foreground" />
          {t("dev.gameTitle")}
        </h3>
        {gameState === "ok" && (
          <span className="text-[11px] text-green-500 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> RUNNING
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t("dev.gameHint")}</p>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          onClick={handleStart}
          disabled={disabled || scanning}
        >
          {scanning
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{t("dev.gameScanning")}</>
            : <><PlayCircle className="w-3.5 h-3.5 mr-1.5" />{t("dev.gameScan")}</>
          }
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleStop}
          disabled={disabled || gameState === "idle"}
        >
          <StopCircle className="w-3.5 h-3.5 mr-1.5" />
          {t("dev.gameStop")}
        </Button>
      </div>

      {/* ── Success ──────────────────────────────────────────────── */}
      {gameState === "ok" && (
        <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/8 px-3 py-2.5 text-sm text-green-500">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {t("dev.gameReady")}
        </div>
      )}

      {/* ── Missing pieces ────────────────────────────────────────── */}
      {gameState === "missing" && (
        <div className="space-y-3">
          <div className="rounded-md border border-red-500/30 bg-red-500/8 px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-2 text-sm text-red-500 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {t("dev.gameMissing", { n: missing.length })}
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-red-400/80">{t("dev.gameMissingAt")}</p>
              <div className="flex flex-wrap gap-1">
                {missing.map(sq => (
                  <span
                    key={sq}
                    className="inline-block px-1.5 py-0.5 rounded text-[11px] font-mono
                               bg-red-500/15 text-red-400 border border-red-500/30"
                  >
                    {sq}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <MissingBoard missing={missing} />
        </div>
      )}

      {/* ── Duplicate UID ────────────────────────────────────────── */}
      {gameState === "duplicate" && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-sm text-amber-500">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t("dev.gameDuplicate")}
        </div>
      )}
    </div>
  );
}

// ── page skeleton ─────────────────────────────────────────────────
function DeviceSkeleton() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-background/60">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>

      <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-md shrink-0" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg bg-card">
                <Skeleton className="w-2.5 h-2.5 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-md shrink-0" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
          <div className="space-y-2">
            {[0].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg bg-card">
                <Skeleton className="size-9 rounded-md shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-52" />
                </div>
                <Skeleton className="h-8 w-20 shrink-0 rounded-md" />
              </div>
            ))}
          </div>
        </section>

        <Separator />

        <section className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="size-7 rounded-md shrink-0" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-56 w-full rounded-lg" />
        </section>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────
export default function DevicePage() {
  const {
    status, devices, activeDevice, logs,
    wifiNets, clearWifiNets,
    scan, connectDevice, disconnect, sendCmd, otaCharRef, addLog, isSupported,
    lastButtonPressTs, buttonPressCount, buttonPressed,
  } = useBle();

  const { t } = useT();
  const { boards: wifiBoards, loading: wifiBoardsLoading } = usePhysicalBoards();
  const logRef     = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const connected      = status === "connected";
  const scanning       = status === "scanning";
  const connecting     = status === "connecting";
  const reconnecting   = status === "reconnecting";

  const sortedWifi = [...wifiBoards].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return b.lastSeen - a.lastSeen;
  });

  if (wifiBoardsLoading) return <DeviceSkeleton />;

  const onlineCount = sortedWifi.filter(b => b.online).length;

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-background/60">
        <div>
          <h1 className="text-sm font-semibold">{t("nav.device")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("dev.wifiOnline", { n: onlineCount })}
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-6">

      {/* ── Section 1: WiFi boards ────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span className="size-7 rounded-md bg-muted flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
            {t("dev.wifiTitle")}
          </h2>
          <span className="text-[11px] text-muted-foreground tabular-nums bg-muted px-2 py-0.5 rounded-full">
            {t("dev.wifiOnline", { n: sortedWifi.filter(b => b.online).length })}
          </span>
        </div>

        {sortedWifi.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 border border-dashed border-border rounded-lg text-muted-foreground">
            <WifiOff className="w-6 h-6 opacity-30" />
            <p className="text-sm">{t("dev.noWifi")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedWifi.map(b => <WifiBoardCard key={b.boardID} board={b} />)}
          </div>
        )}
      </section>

      <Separator />

      {/* ── Section 2: BLE scan + device list ───────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span className="size-7 rounded-md bg-muted flex items-center justify-center">
              <Bluetooth className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
            {t("dev.bleTitle")}
            {devices.length > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {t("dev.bleCount", { n: devices.length })}
              </span>
            )}
          </h2>

          {isSupported === false ? (
            <Badge variant="destructive" className="text-xs">{t("dev.notSupported")}</Badge>
          ) : isSupported === null ? (
            <Badge variant="secondary" className="text-xs">{t("dev.checking")}</Badge>
          ) : (
            <Button
              size="sm"
              onClick={scan}
              disabled={scanning || connecting || reconnecting || isSupported !== true}
              className="h-8 px-3 text-xs gap-1.5"
            >
              {scanning
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <ScanSearch className="w-3.5 h-3.5" />
              }
              {scanning ? t("dev.scanning") : t("dev.scan")}
            </Button>
          )}
        </div>

        {/* Browser not supported warning */}
        {isSupported === false && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-4 py-3.5 space-y-2">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              {t("dev.bleUnavailable")}
            </p>
            <ul className="text-xs text-amber-600/80 dark:text-amber-400/70 space-y-1.5 list-disc list-inside">
              {typeof window !== "undefined" && !window.isSecureContext && (
                <li className="font-semibold text-red-500 dark:text-red-400">
                  {t("dev.bleHttpWarn")}
                </li>
              )}
              <li>{t("dev.bleChrome")}</li>
              <li>
                {t("dev.bleFlag").split("chrome://flags/#enable-experimental-web-platform-features").map((part, i, arr) =>
                  i < arr.length - 1 ? (
                    <span key={i}>{part}<code className="bg-black/20 px-1 rounded-md font-mono">chrome://flags/#enable-experimental-web-platform-features</code></span>
                  ) : part
                )}
              </li>
              <li>{t("dev.bleSafari")}</li>
            </ul>
          </div>
        )}

        {/* Device list */}
        {devices.length === 0 && isSupported !== false ? (
          <div className="flex flex-col items-center gap-2 py-10 border border-dashed border-border rounded-lg text-muted-foreground">
            <Bluetooth className="w-6 h-6 opacity-30" />
            <p className="text-sm">{t("dev.noDevices")}</p>
            <p className="text-xs opacity-60">{t("dev.noDevicesHint")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map(d => (
              <BleDeviceCard
                key={d.id}
                device={d}
                active={(connecting || reconnecting) && activeDevice?.id === d.id}
                onConnect={(d) => connectDevice(d.raw)}
                onDisconnect={disconnect}
              />
            ))}
          </div>
        )}

        {/* Config form — only when BLE connected */}
        {connected && activeDevice && (
          <div className="space-y-4 pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {t("dev.configuring")}: <span className="font-mono font-medium text-foreground">{activeDevice.name}</span>
            </p>

            {/* ── Button status ───────────────────────────────────── */}
            <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
              <div className={cn(
                "size-9 rounded-md flex items-center justify-center shrink-0",
                buttonPressed ? "bg-green-500/10" : "bg-muted"
              )}>
                <span className={cn(
                  "text-lg",
                  buttonPressed ? "text-green-500" : "text-muted-foreground/40"
                )}>
                  {buttonPressed ? "◉" : "○"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {t("dev.buttonStatus")}
                  </span>
                  {buttonPressed ? (
                    <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-green-600 animate-pulse">
                      {t("dev.buttonPressed")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                      {t("dev.buttonIdle")}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {buttonPressCount === 0
                    ? t("dev.buttonNoPress")
                    : t("dev.buttonCount", { n: buttonPressCount })
                  }
                  {lastButtonPressTs !== null && (
                    <> &middot; {t("dev.buttonLast")}: <span className="font-mono text-foreground/70">{new Date(lastButtonPressTs).toLocaleTimeString("en-GB", { hour12: false })}</span></>
                  )}
                </p>
              </div>
            </div>

            <BleConfigForm
              onSend={sendCmd}
              wifiNets={wifiNets}
              onClearNets={clearWifiNets}
              disabled={!connected}
            />
            <Separator />
            <GameControl onSend={sendCmd} disabled={!connected} />
            <Separator />
            <OtaUploader otaCharRef={otaCharRef} onLog={addLog} disabled={!connected} />
          </div>
        )}
      </section>

      <Separator />

      {/* ── Section 3: Terminal ──────────────────────────────────── */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <span className="size-7 rounded-md bg-muted flex items-center justify-center">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          </span>
          {t("dev.terminal")}
        </h2>
        <div
          ref={logRef}
          className="h-56 overflow-y-auto rounded-lg border border-border bg-[#0d0d0d] p-3.5 font-mono text-xs space-y-0.5 shadow-inner"
        >
          {logs.length === 0 ? (
            <p className="text-muted-foreground/50">{t("dev.terminalHint")}</p>
          ) : (
            logs.map((line, i) => (
              <p key={i} className={cn(
                line.includes("[ERROR]") || line.includes("Lỗi") ? "text-red-400" :
                line.includes("[OTA]")   ? "text-blue-400" :
                line.includes("[LOG]")   ? "text-yellow-300/80" :
                line.includes("→")       ? "text-white/70" :
                line.includes("←")       ? "text-cyan-300" :
                "text-green-400"
              )}>
                {line}
              </p>
            ))
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
