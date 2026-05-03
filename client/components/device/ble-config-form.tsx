"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useT } from "@/lib/i18n";

interface Props {
  onSend: (cmd: string) => Promise<string>;
  /** Networks pushed from ESP32 via BLE LOG characteristic ([WIFI_NET] messages) */
  wifiNets: { ssid: string; rssi: number }[];
  onClearNets: () => void;
  disabled?: boolean;
}

// Parse pipe-delimited firmware response into key/value map.
// Input:  "OK: WIFI|ver=1|ssid=MyNet|status=CONNECTED|ip=192.168.1.5|err="
// Output: { ver: "1", ssid: "MyNet", status: "CONNECTED", ip: "192.168.1.5", err: "" }
// Strategy: skip everything up to (and including) the first "|", then parse key=value pairs.
function parseKV(resp: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pipeIdx = resp.indexOf("|");
  if (pipeIdx < 0) return out;
  const body = resp.slice(pipeIdx + 1);
  for (const part of body.split("|")) {
    const eq = part.indexOf("=");
    if (eq >= 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

// RSSI → bars 0-4  (>= -55: 4, >= -65: 3, >= -75: 2, >= -85: 1, else: 0)
function rssiToBars(rssi: number): 0 | 1 | 2 | 3 | 4 {
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -85) return 1;
  return 0;
}

function rssiToColor(bars: number) {
  if (bars >= 3) return "text-green-500";
  if (bars === 2) return "text-amber-400";
  return "text-red-400";
}

function SignalBars({ rssi }: { rssi: number }) {
  const bars = rssiToBars(rssi);
  const color = rssiToColor(bars);
  const heights = ["h-1", "h-1.5", "h-2.5", "h-3.5"];
  return (
    <span className={`inline-flex items-end gap-px ${color}`} title={`${rssi} dBm`}>
      {heights.map((h, i) => (
        <span
          key={i}
          className={`w-1 rounded-sm ${h} ${i < bars ? "opacity-100" : "opacity-20"}`}
          style={{ background: "currentColor" }}
        />
      ))}
    </span>
  );
}

export function BleConfigForm({ onSend, wifiNets, onClearNets, disabled = false }: Props) {
  const { t } = useT();

  // ── WiFi state ─────────────────────────────────────────────────
  const [ssid,           setSsid]           = useState("");
  const [pass,           setPass]           = useState("");
  const [scanningNets,   setScanningNets]   = useState(false);
  const [wifiSaving,     setWifiSaving]     = useState(false);
  const [wifiConnecting, setWifiConnecting] = useState(false);
  const [wifiStatus,     setWifiStatus]     = useState<Record<string, string> | null>(null);
  const pollAbortRef  = useRef(false);
  // Guard against React Strict Mode double-mount: only run the initial fetch once.
  const fetchedRef    = useRef(false);

  // Abort poll on unmount OR when BLE disconnects (disabled becomes true)
  useEffect(() => {
    if (disabled) {
      pollAbortRef.current = true;
      setWifiConnecting(false);
    }
  }, [disabled]);
  useEffect(() => () => { pollAbortRef.current = true; }, []);

  // ── CFG state ──────────────────────────────────────────────────
  const [cfgVerbose,    setCfgVerbose]    = useState(false);
  const [cfgContinuous, setCfgContinuous] = useState(false);
  const [cfgLetters,    setCfgLetters]    = useState(false);
  const [cfgLoaded,     setCfgLoaded]     = useState(false);
  const [cfgLoading,    setCfgLoading]    = useState(false);
  const [cfgSaving,     setCfgSaving]     = useState(false);

  // ── Web server state ───────────────────────────────────────────
  const [url,           setUrl]           = useState("http://192.168.1.100:8080");
  const [game,          setGame]          = useState("");
  const [boardID,       setBoardID]       = useState("");
  const [enabled,       setEnabled]       = useState(true);
  const [webSaving,     setWebSaving]     = useState(false);
  const [webStatus,     setWebStatus]     = useState<Record<string, string> | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  // boardID is only valid once it contains "-" (MAC format: dc-b4-d9-14-56-5c).
  // Block Save Config until the auto-fetch populates it, so WEB_SET never sends board_01.
  const boardIdReady = boardID.includes("-");

  // ── On mount: fetch all stored config from ESP32 and populate form ──
  // Component is only rendered when BLE is connected, so this runs once on connect.
  // fetchedRef guards against React Strict Mode's intentional double-mount in dev.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;

    // Retry up to `retries` times if firmware responds ERR:IN_FLIGHT
    // (happens when another command is queued right after BLE connect)
    const sendWithRetry = async (cmd: string, retries = 5): Promise<string> => {
      for (let i = 0; i < retries; i++) {
        if (cancelled) return "ERR:CANCELLED";
        const r = await onSend(cmd);
        if (r !== "ERR:IN_FLIGHT") return r;
        await new Promise<void>(res => setTimeout(res, 400 + i * 200));
      }
      return "ERR:IN_FLIGHT";
    };

    (async () => {
      // 1. WIFI — get saved SSID, connection status, MAC address
      const wifiResp = await sendWithRetry("WIFI");
      if (cancelled) return;
      if (wifiResp.startsWith("OK:")) {
        const wifiKV = parseKV(wifiResp);
        if (wifiKV.mac) {
          // Use MAC as default boardID: "AA:BB:CC:DD:EE:FF" → "aa-bb-cc-dd-ee-ff"
          setBoardID(wifiKV.mac.replace(/:/g, "-").toLowerCase());
        }
        if (wifiKV.ssid && wifiKV.ssid !== "-") setSsid(wifiKV.ssid);
        setWifiStatus(wifiKV);
      }

      // 2. WEB — get stored server URL, boardID, gameID, enabled state
      const webResp = await sendWithRetry("WEB");
      if (cancelled) return;
      if (webResp.startsWith("OK:")) {
        const webKV = parseKV(webResp);
        if (webKV.url  && webKV.url  !== "-") setUrl(webKV.url);
        if (webKV.game && webKV.game !== "-") setGame(webKV.game);
        // boardID stays as MAC — do not override from stored WEB value
        setEnabled(webKV.enabled === "1");
        setWebStatus(webKV);
      }

      // 3. CFG — get device settings (verbose, continuous, letters)
      const cfgResp = await sendWithRetry("CFG");
      if (cancelled) return;
      if (cfgResp.startsWith("OK:")) {
        const cfgKV = parseKV(cfgResp);
        setCfgVerbose(cfgKV.verbose === "1");
        setCfgContinuous(cfgKV.continuous === "1");
        setCfgLetters(cfgKV.letters === "1");
        setCfgLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  // onSend is a stable useCallback; run once on mount (component only mounts when connected)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WiFi handlers ──────────────────────────────────────────────
  const pollWifiUntilConnected = async () => {
    const INTERVAL_MS = 2_000;
    const MAX_POLLS   = 20; // 40s total timeout
    setWifiConnecting(true);
    pollAbortRef.current = false;
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise<void>(r => setTimeout(r, INTERVAL_MS));
      if (pollAbortRef.current) break;
      const resp = await onSend("WIFI");
      if (pollAbortRef.current) break;
      // Stop if BLE disconnected
      if (resp === "ERR:NOT_CONNECTED" || resp === "ERR:DISCONNECTED") break;
      const kv = parseKV(resp);
      setWifiStatus(kv);
      if (kv.status === "CONNECTED") break;
      // Stop polling if firmware reports an actual error string
      if (kv.err && kv.err !== "" && kv.status !== "CONNECTING") break;
    }
    setWifiConnecting(false);
  };

  const sendWifi = async () => {
    if (!ssid.trim()) return;
    setWifiSaving(true);
    pollAbortRef.current = true; // cancel any in-flight poll
    const resp = await onSend(`WIFI_SET|SSID=${ssid}|PASS=${pass}|CONNECT=1`);
    // Show the immediate CONNECTING status from the WIFI_SAVED ACK
    const kv = parseKV(resp);
    if (kv.status) setWifiStatus(kv);
    setWifiSaving(false);
    // Start background polling to track connection progress
    pollWifiUntilConnected();
  };

  const scanNetworks = async () => {
    setScanningNets(true);
    onClearNets(); // reset previous results
    // ESP32 scans, then pushes each network via LOG char as [WIFI_NET] messages.
    // use-ble.ts intercepts them and updates wifiNets prop automatically.
    await onSend("WIFI_SCAN");
    setScanningNets(false);
  };

  // ── CFG handlers ───────────────────────────────────────────────
  const loadCfg = async () => {
    setCfgLoading(true);
    const resp = await onSend("CFG");
    const fields = parseKV(resp);
    setCfgVerbose(fields.verbose === "1");
    setCfgContinuous(fields.continuous === "1");
    setCfgLetters(fields.letters === "1");
    setCfgLoaded(true);
    setCfgLoading(false);
  };

  const saveCfg = async () => {
    setCfgSaving(true);
    await onSend(
      `CFG_SET|VERBOSE=${cfgVerbose ? 1 : 0}|CONTINUOUS=${cfgContinuous ? 1 : 0}|LETTERS=${cfgLetters ? 1 : 0}`
    );
    setCfgSaving(false);
  };

  // ── Web server handlers ────────────────────────────────────────
  const sendWebConfig = async () => {
    setWebSaving(true);
    await onSend(`WEB_SET|URL=${url}|GAME=${game}|BOARD=${boardID}|ENABLED=${enabled ? 1 : 0}`);
    setWebSaving(false);
  };

  const sendGetStatus = async () => {
    setStatusLoading(true);
    const wifiResp = await onSend("WIFI");
    if (wifiResp.startsWith("OK:")) {
      const kv = parseKV(wifiResp);
      setWifiStatus(kv);
      // Re-sync boardID from MAC in case it was lost
      if (kv.mac) setBoardID(kv.mac.replace(/:/g, "-").toLowerCase());
    }
    const webResp = await onSend("WEB");
    if (webResp.startsWith("OK:")) setWebStatus(parseKV(webResp));
    await onSend("CFG");
    setStatusLoading(false);
  };

  return (
    <div className="space-y-6">

      {/* ── WiFi ──────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("dev.wifiSection")}</h3>

        {/* Scanned network list — pushed by ESP32 via BLE, sorted by RSSI */}
        {wifiNets.length > 0 && (() => {
          const sorted = [...wifiNets]
            .filter(n => n.rssi > -88)
            .sort((a, b) => b.rssi - a.rssi);
          return (
            <div className="rounded-md border border-border bg-muted/40 p-1.5 space-y-0.5 max-h-44 overflow-y-auto">
              {sorted.map((net, i) => {
                const bars = rssiToBars(net.rssi);
                return (
                  <button
                    key={i}
                    onClick={() => setSsid(net.ssid)}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent flex items-center gap-2 font-mono transition-colors"
                  >
                    <SignalBars rssi={net.rssi} />
                    <span className="flex-1 truncate">{net.ssid}</span>
                    <span className={`text-[10px] tabular-nums shrink-0 ${
                      bars >= 3 ? "text-green-500" : bars === 2 ? "text-amber-400" : "text-red-400"
                    }`}>
                      {net.rssi} dBm
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="bc-ssid">{t("dev.ssid")}</Label>
            <Input
              id="bc-ssid"
              placeholder={t("dev.ssidPlaceholder")}
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-pass">{t("dev.password")}</Label>
            <Input
              id="bc-pass"
              type="password"
              placeholder={t("dev.passwordPlaceholder")}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={sendWifi}
            disabled={disabled || !ssid.trim() || wifiSaving || wifiConnecting}
          >
            {(wifiSaving || wifiConnecting) && (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            )}
            {t("dev.updateWifi")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={scanNetworks}
            disabled={disabled || scanningNets}
          >
            {scanningNets
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{t("dev.scanningNets")}</>
              : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />{t("dev.scanNetworks")}</>
            }
          </Button>
        </div>

        {/* WiFi inline status */}
        {wifiStatus && (
          <div className={`rounded-md border px-3 py-2.5 text-xs font-mono space-y-1.5 transition-colors ${
            wifiStatus.status === "CONNECTED"
              ? "border-green-500/30 bg-green-500/5"
              : wifiConnecting
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-border bg-muted/40"
          }`}>
            {/* Status row */}
            <div className="flex items-center gap-2">
              {wifiStatus.status === "CONNECTED" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
              ) : wifiConnecting ? (
                <Loader2 className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-spin" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
              <span className={
                wifiStatus.status === "CONNECTED"
                  ? "text-green-500 font-semibold"
                  : wifiConnecting
                  ? "text-amber-500 font-semibold"
                  : "text-muted-foreground"
              }>
                {wifiConnecting && wifiStatus.status !== "CONNECTED"
                  ? `${wifiStatus.status || "CONNECTING"}…`
                  : wifiStatus.status || "DISCONNECTED"
                }
              </span>
            </div>
            {wifiStatus.ssid && (
              <div className="text-muted-foreground pl-5">
                SSID: <span className="text-foreground">{wifiStatus.ssid}</span>
              </div>
            )}
            {wifiStatus.ip && wifiStatus.ip !== "0.0.0.0" && (
              <div className="text-muted-foreground pl-5">
                IP: <span className="text-green-400 font-semibold">{wifiStatus.ip}</span>
              </div>
            )}
            {wifiStatus.err && (
              <div className="text-red-400 pl-5">err: {wifiStatus.err}</div>
            )}
          </div>
        )}
      </section>

      <Separator />

      {/* ── CFG / Device Settings ─────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("dev.cfgSection")}</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={loadCfg}
            disabled={disabled || cfgLoading}
            className="h-7 text-xs"
          >
            {cfgLoading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : t("dev.cfgLoad")
            }
          </Button>
        </div>

        <div className="space-y-3">
          {(
            [
              { id: "cfg-verbose",    checked: cfgVerbose,    set: setCfgVerbose,    label: "dev.cfgVerbose",    hint: "dev.cfgVerboseHint"    },
              { id: "cfg-continuous", checked: cfgContinuous, set: setCfgContinuous, label: "dev.cfgContinuous", hint: "dev.cfgContinuousHint" },
              { id: "cfg-letters",    checked: cfgLetters,    set: setCfgLetters,    label: "dev.cfgLetters",    hint: "dev.cfgLettersHint"    },
            ] as const
          ).map(({ id, checked, set, label, hint }) => (
            <div key={id} className="flex items-start gap-3">
              <Switch
                id={id}
                checked={checked}
                onCheckedChange={set}
                disabled={disabled || !cfgLoaded}
                className="mt-0.5 shrink-0"
              />
              <div>
                <Label htmlFor={id} className="cursor-pointer text-sm leading-none">
                  {t(label)}
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t(hint)}</p>
              </div>
            </div>
          ))}
        </div>

        <Button
          size="sm"
          onClick={saveCfg}
          disabled={disabled || !cfgLoaded || cfgSaving}
        >
          {cfgSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          {t("dev.cfgSave")}
        </Button>
      </section>

      <Separator />

      {/* ── Web Server ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("dev.webServer")}</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bc-url">{t("dev.serverUrl")}</Label>
            <Input
              id="bc-url"
              placeholder="http://192.168.1.100:8080"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bc-board">{t("dev.boardId")}</Label>
              <div className="relative">
                <Input
                  id="bc-board"
                  value={boardID}
                  placeholder="loading…"
                  readOnly
                  className="font-mono text-xs bg-muted/60 cursor-default select-all"
                />
                {!boardIdReady && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-game">{t("dev.gameIdOpt")}</Label>
              <Input
                id="bc-game"
                placeholder={t("dev.gameIdPlaceholder")}
                value={game}
                onChange={(e) => setGame(e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="bc-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={disabled}
            />
            <Label htmlFor="bc-enabled" className="cursor-pointer">
              {t("dev.enableSend")}
            </Label>
          </div>
        </div>

        {/* Web inline status */}
        {webStatus && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-mono space-y-1">
            <div className="flex items-center gap-2">
              <span className={webStatus.enabled === "1" ? "text-green-500 font-medium" : "text-muted-foreground font-medium"}>
                ● {webStatus.enabled === "1" ? "Enabled" : "Disabled"}
              </span>
              {webStatus.state && (
                <span className="text-muted-foreground">{webStatus.state}</span>
              )}
            </div>
            {webStatus.url && (
              <div className="text-muted-foreground truncate">
                URL: <span className="text-foreground">{webStatus.url}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={sendWebConfig}
            disabled={disabled || !url.trim() || webSaving || !boardIdReady}
            title={!boardIdReady ? "Đợi Board ID (MAC) load xong" : undefined}
          >
            {webSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {t("dev.saveConfig")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={sendGetStatus}
            disabled={disabled || statusLoading}
          >
            {statusLoading
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{t("dev.readingStatus")}</>
              : t("dev.readStatus")
            }
          </Button>
        </div>
      </section>
    </div>
  );
}
