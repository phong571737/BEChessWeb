"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── UUIDs ────────────────────────────────────────────────────────
export const BLE_SERVICE_UUID  = "3f0e0001-70a1-4f8a-a6a3-51e9590e9f20";
// 3f0e0002 (FEN): READ-only static placeholder — game data flows via WiFi/API, not BLE
export const BLE_CHAR_CMD_UUID = "3f0e0003-70a1-4f8a-a6a3-51e9590e9f20";
export const BLE_CHAR_LOG_UUID = "3f0e0004-70a1-4f8a-a6a3-51e9590e9f20";
export const BLE_CHAR_OTA_UUID = "3f0e0005-70a1-4f8a-a6a3-51e9590e9f20";

export type BleStatus = "idle" | "scanning" | "connecting" | "reconnecting" | "connected" | "error";

export interface BleDevice {
  id:         string;
  name:       string;
  raw:        BluetoothDevice;
  connected:  boolean;
  /** Previously granted in an earlier session (from getDevices) */
  remembered: boolean;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function isAck(s: string)  { return s.startsWith("OK:") || s.startsWith("ERR:"); }
function isGattDisconnectedError(msg: string) {
  return /gatt server is disconnected|not connected|failed to execute 'getprimaryservice'/i.test(msg);
}

export function isBleSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

// ─────────────────────────────────────────────────────────────────
export function useBle() {
  const [status,      setStatus]      = useState<BleStatus>("idle");
  const [devices,     setDevices]     = useState<BleDevice[]>([]);
  const [activeId,    setActiveId]    = useState<string | null>(null);
  const [logs,        setLogs]        = useState<string[]>([]);
  const [wifiNets,    setWifiNets]    = useState<{ ssid: string; rssi: number }[]>([]);
  // null = not yet checked (SSR), true/false = checked on client
  const [isSupported, setIsSupported] = useState<boolean | null>(null);

  // GATT characteristic refs for the currently-active device
  const cmdCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const otaCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const cmdInFlight = useRef(false);
  const disconnectIntentional = useRef(false);
  // Guard: prevent concurrent connectDevice calls (e.g. auto-reconnect + user click)
  const isConnectingRef = useRef(false);
  // Only auto-reconnect if we reached the fully-connected state at least once
  const wasFullyConnectedRef = useRef(false);
  // Store event listener references so we can remove them on reconnect (prevent duplicates)
  const cmdListenerRef = useRef<((e: Event) => void) | null>(null);
  const logListenerRef = useRef<((e: Event) => void) | null>(null);
  const otaListenerRef = useRef<((e: Event) => void) | null>(null);
  // Auto-reconnect: track attempt count and the current disconnect listener
  const reconnectCount = useRef(0);
  const disconnectHandlerRef = useRef<(() => void) | null>(null);

  const addLog = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLogs(prev => [...prev.slice(-499), `[${ts}] ${line}`]);
  }, []);

  // ── Device list helpers ────────────────────────────────────────
  const upsertDevice = useCallback((raw: BluetoothDevice, remembered = false) => {
    setDevices(prev => {
      const exists = prev.find(d => d.id === raw.id);
      if (exists) return prev.map(d =>
        d.id === raw.id ? { ...d, raw, remembered: d.remembered || remembered } : d
      );
      return [...prev, { id: raw.id, name: raw.name ?? raw.id, raw, connected: false, remembered }];
    });
  }, []);

  const setConnected = useCallback((id: string, connected: boolean) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, connected } : d));
  }, []);

  // ── Detect BLE support after mount (avoids SSR mismatch) ─────
  useEffect(() => {
    const supported = typeof navigator !== "undefined"
      && "bluetooth" in navigator
      && typeof window !== "undefined"
      && window.isSecureContext;
    setIsSupported(supported);
  }, []);

  // ── Load remembered devices on mount ──────────────────────────
  useEffect(() => {
    if (!isBleSupported()) return;
    const bt = (navigator as any).bluetooth;
    if (typeof bt?.getDevices !== "function") return;
    bt.getDevices()
      .then((list: BluetoothDevice[]) => {
        list.forEach(d => upsertDevice(d, true));
        if (list.length) addLog(`[BLE] ${list.length} thiết bị đã ghép trước đó`);
      })
      .catch(() => {});
  }, [upsertDevice, addLog]);

  // ── Core connect ───────────────────────────────────────────────
  const connectDevice = useCallback(async (raw: BluetoothDevice) => {
    // Guard: only one connectDevice at a time (prevents concurrent reconnect race)
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;

    setStatus("connecting");
    setActiveId(raw.id);
    disconnectIntentional.current = false;
    addLog(`[BLE] Đang kết nối → ${raw.name ?? raw.id}...`);

    // ── Disconnect handler ─────────────────────────────────────
    function onDisconnect() {
      cmdCharRef.current = null;
      otaCharRef.current = null;
      cmdInFlight.current = false;
      isConnectingRef.current = false;
      setConnected(raw.id, false);

      if (disconnectIntentional.current) {
        reconnectCount.current = 0;
        wasFullyConnectedRef.current = false;
        setStatus("idle");
        setActiveId(null);
        addLog("[BLE] Đã ngắt kết nối");
        return;
      }

      // Only auto-reconnect if we reached fully-connected state (avoid loop on initial fail)
      if (!wasFullyConnectedRef.current) {
        setStatus("idle");
        setActiveId(null);
        addLog("[BLE] Kết nối thất bại — không tự thử lại");
        return;
      }

      wasFullyConnectedRef.current = false;
      const attempt = reconnectCount.current + 1;
      if (attempt > 3) {
        reconnectCount.current = 0;
        setStatus("idle");
        setActiveId(null);
        addLog("[BLE] Không thể kết nối lại sau 3 lần thử");
        return;
      }
      reconnectCount.current = attempt;
      const delaySec = attempt * 2;
      setStatus("reconnecting");
      addLog(`[BLE] Mất kết nối — thử lại lần ${attempt}/3 sau ${delaySec}s...`);

      setTimeout(() => {
        if (disconnectIntentional.current) return;
        connectDevice(raw).catch(() => {});
      }, delaySec * 1000);
    }

    // Remove stale disconnect listener before adding new one
    if (disconnectHandlerRef.current) {
      raw.removeEventListener("gattserverdisconnected", disconnectHandlerRef.current);
    }
    disconnectHandlerRef.current = onDisconnect;
    raw.addEventListener("gattserverdisconnected", onDisconnect);

    // GATT connect with one retry
    const connectAndGetService = async () => {
      const server = await raw.gatt!.connect();
      return server.getPrimaryService(BLE_SERVICE_UUID);
    };

    let service: BluetoothRemoteGATTService;
    try {
      service = await connectAndGetService();
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      if (isGattDisconnectedError(msg)) {
        await sleep(120);
        try {
          service = await connectAndGetService();
        } catch (err2) {
          addLog(`[BLE] Kết nối thất bại: ${(err2 as Error).message ?? err2}`);
          setStatus("error");
          setActiveId(null);
          isConnectingRef.current = false;
          raw.removeEventListener("gattserverdisconnected", onDisconnect);
          return;
        }
      } else {
        addLog(`[BLE] Kết nối thất bại: ${msg}`);
        setStatus("error");
        setActiveId(null);
        isConnectingRef.current = false;
        raw.removeEventListener("gattserverdisconnected", onDisconnect);
        return;
      }
    }

    // ── CMD characteristic ─────────────────────────────────────
    function onCmd(e: Event) {
      const val = decoder.decode((e.target as BluetoothRemoteGATTCharacteristic).value!).trim();
      if (val) addLog(`← ${val}`);
    }
    try {
      const cmdChar = await service.getCharacteristic(BLE_CHAR_CMD_UUID);
      if (cmdListenerRef.current) {
        try { cmdChar.removeEventListener("characteristicvaluechanged", cmdListenerRef.current); } catch {}
      }
      cmdListenerRef.current = onCmd;
      cmdCharRef.current = cmdChar;
      await cmdChar.startNotifications();
      cmdChar.addEventListener("characteristicvaluechanged", onCmd);
      addLog("[BLE] CMD characteristic ready");
    } catch (e) {
      addLog(`[BLE] CMD characteristic không có: ${(e as Error).message}`);
    }

    // ── LOG characteristic ─────────────────────────────────────
    function onLog(e: Event) {
      const val = decoder.decode((e.target as BluetoothRemoteGATTCharacteristic).value!).trim();
      if (!val) return;
      if (val.startsWith("[WIFI_NET]")) {
        const body = val.slice("[WIFI_NET]".length).trim();
        const parts: Record<string, string> = {};
        for (const pair of body.split("|")) {
          const eq = pair.indexOf("=");
          if (eq >= 0) parts[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
        }
        if (parts.ssid) {
          setWifiNets(prev =>
            prev.some(n => n.ssid === parts.ssid)
              ? prev
              : [...prev, { ssid: parts.ssid, rssi: parseInt(parts.rssi ?? "-100", 10) }]
          );
        }
      } else {
        addLog(`[LOG] ${val}`);
      }
    }
    try {
      const logChar = await service.getCharacteristic(BLE_CHAR_LOG_UUID);
      if (logListenerRef.current) {
        try { logChar.removeEventListener("characteristicvaluechanged", logListenerRef.current); } catch {}
      }
      logListenerRef.current = onLog;
      await logChar.startNotifications();
      logChar.addEventListener("characteristicvaluechanged", onLog);
      addLog("[BLE] LOG characteristic ready");
    } catch { /* optional */ }

    // ── OTA characteristic ─────────────────────────────────────
    function onOta(e: Event) {
      const val = decoder.decode((e.target as BluetoothRemoteGATTCharacteristic).value!).trim();
      if (val) addLog(`[OTA] ${val}`);
    }
    try {
      const otaChar = await service.getCharacteristic(BLE_CHAR_OTA_UUID);
      if (otaListenerRef.current) {
        try { otaChar.removeEventListener("characteristicvaluechanged", otaListenerRef.current); } catch {}
      }
      otaListenerRef.current = onOta;
      otaCharRef.current = otaChar;
      await otaChar.startNotifications();
      otaChar.addEventListener("characteristicvaluechanged", onOta);
      addLog("[BLE] OTA characteristic ready");
    } catch { /* optional */ }

    reconnectCount.current = 0;
    wasFullyConnectedRef.current = true;
    isConnectingRef.current = false;
    setConnected(raw.id, true);
    setStatus("connected");
    addLog(`[BLE] Đã kết nối: ${raw.name ?? raw.id}`);
  }, [addLog, setConnected]);

  // ── Scan: open browser BLE picker ─────────────────────────────
  const scan = useCallback(async () => {
    if (!isBleSupported()) {
      addLog("[ERROR] Web Bluetooth không được hỗ trợ");
      setStatus("error");
      return;
    }
    setStatus("scanning");
    addLog("[BLE] Đang mở trình quét...");

    try {
      const device: BluetoothDevice = await (navigator as any).bluetooth.requestDevice({
        filters: [{ namePrefix: "SmartChess" }],
        optionalServices: [BLE_SERVICE_UUID],
      });
      upsertDevice(device, false);
      addLog(`[BLE] Tìm thấy: ${device.name ?? device.id}`);
      setStatus("idle");
      await connectDevice(device);
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err);
      if (/cancelled|chooser|User cancelled/i.test(msg)) {
        addLog("[BLE] Đã hủy quét");
        setStatus("idle");
      } else {
        addLog(`[BLE] Lỗi quét: ${msg}`);
        setStatus("error");
      }
    }
  }, [addLog, connectDevice, upsertDevice]);

  // ── Disconnect ─────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    disconnectIntentional.current = true;
    reconnectCount.current = 0;
    // Disconnect GATT
    try {
      cmdCharRef.current?.service?.device?.gatt?.disconnect();
    } catch {}
    cmdCharRef.current = null;
    otaCharRef.current = null;
    cmdInFlight.current = false;
    if (activeId) setConnected(activeId, false);
    setStatus("idle");
    setActiveId(null);
    addLog("[BLE] Đã ngắt kết nối");
  }, [activeId, setConnected, addLog]);

  // ── Send command with ACK polling (mirrors SmartChess web-client) ─
  const sendCmd = useCallback(async (cmd: string): Promise<string> => {
    const char = cmdCharRef.current;
    if (!char) { addLog("[BLE] Chưa kết nối"); return "ERR:NOT_CONNECTED"; }
    if (cmdInFlight.current) { addLog("[BLE] Lệnh đang chờ, thử lại sau"); return "ERR:IN_FLIGHT"; }

    cmdInFlight.current = true;
    addLog(`→ ${cmd}`);

    try {
      const payload = encoder.encode(cmd);
      if (typeof (char as any).writeValueWithoutResponse === "function") {
        await (char as any).writeValueWithoutResponse(payload);
      } else {
        await char.writeValueWithResponse(payload);
      }

      // ACK polling — up to 4 attempts (fast path)
      let ackText = "";
      for (let i = 0; i < 4; i++) {
        try {
          const raw = await char.readValue();
          const candidate = decoder.decode(raw).trim();
          if (isAck(candidate)) { ackText = candidate; break; }
          ackText = candidate;
        } catch (e) {
          const msg = (e as Error).message ?? String(e);
          if (isGattDisconnectedError(msg)) { ackText = "ERR:DISCONNECTED"; break; }
          const retryable = /already in progress|unknown reason|busy|operation failed/i.test(msg);
          if (!retryable || i === 3) { ackText = `ERR:READ_${msg}`; break; }
        }
        await sleep(50 + i * 35);
      }

      // Secondary polling if still no valid ACK (6 more attempts)
      if (!isAck(ackText)) {
        await sleep(80);
        for (let i = 0; i < 6; i++) {
          try {
            const raw2 = await char.readValue();
            const v2 = decoder.decode(raw2).trim();
            if (isAck(v2)) { ackText = v2; break; }
          } catch (e) {
            const msg = (e as Error).message ?? String(e);
            if (isGattDisconnectedError(msg)) { ackText = "ERR:DISCONNECTED"; break; }
            const retryable = /already in progress|unknown reason|busy|operation failed/i.test(msg);
            if (!retryable || i === 5) break;
          }
          await sleep(80 + i * 40);
        }
      }

      if (!ackText) ackText = "ERR:NO_ACK";
      addLog(`← ${ackText}`);
      return ackText;
    } finally {
      cmdInFlight.current = false;
    }
  }, [addLog]);

  const activeDevice = devices.find(d => d.id === activeId) ?? null;

  const clearWifiNets = useCallback(() => setWifiNets([]), []);

  return {
    status,
    devices,
    activeDevice,
    logs,
    wifiNets,
    clearWifiNets,
    scan,
    connectDevice,
    disconnect,
    sendCmd,
    otaCharRef,
    addLog,
    isSupported,
  };
}
