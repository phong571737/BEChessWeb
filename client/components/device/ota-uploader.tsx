"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/lib/i18n";

/** Bytes per BLE write chunk.
 *  512 bytes is the GATT maximum; Web Bluetooth + ESP32 BLE 5.0 handle it fine. */
const CHUNK_SIZE = 512;

const decoder = new TextDecoder();

interface Props {
  otaCharRef: React.MutableRefObject<BluetoothRemoteGATTCharacteristic | null>;
  onLog: (line: string) => void;
  disabled?: boolean;
}

type OtaStatus = "idle" | "uploading" | "done" | "error";

/** Wait for the next characteristicvaluechanged notification on `char`.
 *  Resolves with the decoded string value, or rejects on timeout. */
function waitForOtaResp(
  char: BluetoothRemoteGATTCharacteristic,
  timeoutMs = 8_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => {
      char.removeEventListener("characteristicvaluechanged", handler);
      reject(new Error(`OTA timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    function handler(e: Event) {
      clearTimeout(tid);
      char.removeEventListener("characteristicvaluechanged", handler);
      const val = decoder.decode(
        (e.target as BluetoothRemoteGATTCharacteristic).value!
      ).trim();
      resolve(val);
    }

    char.addEventListener("characteristicvaluechanged", handler);
  });
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function OtaUploader({ otaCharRef, onLog, disabled = false }: Props) {
  const { t } = useT();
  const fileRef                     = useRef<HTMLInputElement>(null);
  const abortRef                    = useRef(false);
  const [progress,  setProgress]    = useState(0);
  const [status,    setStatus]      = useState<OtaStatus>("idle");
  const [errorMsg,  setErrorMsg]    = useState("");
  const [transferred, setTransferred] = useState(0);
  const [totalSize,   setTotalSize]   = useState(0);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { onLog("[OTA] Chưa chọn file"); return; }

    const otaChar = otaCharRef.current;
    if (!otaChar) { onLog("[OTA] Chưa kết nối BLE"); return; }

    abortRef.current = false;
    setStatus("uploading");
    setProgress(0);
    setTransferred(0);
    setErrorMsg("");

    const enc   = new TextEncoder();
    const buf   = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const total = bytes.length;
    setTotalSize(total);

    onLog(`[OTA] File: ${file.name} (${fmtBytes(total)})`);

    try {
      // ── 1. OTA_BEGIN — wait for OTA_READY notification ─────────────
      onLog("[OTA] Gửi OTA_BEGIN...");
      const readyPromise = waitForOtaResp(otaChar, 8_000);
      await otaChar.writeValueWithResponse(enc.encode(`OTA_BEGIN:${total}`));
      const beginResp = await readyPromise;
      onLog(`[OTA] ${beginResp}`);
      if (beginResp !== "OTA_READY") {
        throw new Error(`OTA_BEGIN thất bại: ${beginResp}`);
      }

      // ── 2. Send binary chunks ───────────────────────────────────────
      const t0 = Date.now();
      let offset = 0;
      while (offset < total) {
        if (abortRef.current) {
          onLog("[OTA] Đã huỷ");
          setStatus("idle");
          return;
        }
        const end   = Math.min(offset + CHUNK_SIZE, total);
        const chunk = bytes.slice(offset, end);
        await otaChar.writeValueWithResponse(chunk);
        offset = end;
        setTransferred(offset);
        setProgress(Math.round((offset / total) * 100));
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      onLog(`[OTA] Đã gửi ${fmtBytes(total)} trong ${elapsed}s`);

      // ── 3. OTA_END — wait for OTA_OK notification ───────────────────
      onLog("[OTA] Gửi OTA_END...");
      const donePromise = waitForOtaResp(otaChar, 15_000);
      await otaChar.writeValueWithResponse(enc.encode("OTA_END"));
      const endResp = await donePromise;
      onLog(`[OTA] ${endResp}`);
      if (!endResp.startsWith("OTA_OK")) {
        throw new Error(`OTA_END thất bại: ${endResp}`);
      }

      onLog("[OTA] Thành công — thiết bị đang khởi động lại...");
      setStatus("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog(`[OTA] Lỗi: ${msg}`);
      setErrorMsg(msg);
      setStatus("error");
    }
  };

  const canUpload = !disabled && !!otaCharRef.current && status !== "uploading";

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Upload className="size-4" />
        {t("dev.otaTitle")}
      </h3>

      <p className="text-[11px] text-muted-foreground">
        File: <code className="font-mono">.pio/build/esp32s3/firmware.bin</code>
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".bin"
        className="text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
        disabled={status === "uploading"}
      />

      {status === "uploading" && (
        <div className="space-y-1.5">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground tabular-nums">
            {fmtBytes(transferred)} / {fmtBytes(totalSize)} — {progress}%
          </p>
        </div>
      )}

      {status === "done" && (
        <p className="text-xs text-green-500">{t("dev.otaSuccess")}</p>
      )}

      {status === "error" && (
        <p className="text-xs text-destructive">{t("dev.otaError")}: {errorMsg}</p>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleUpload} disabled={!canUpload}>
          {status === "uploading" ? t("dev.otaUploading") : t("dev.otaFlash")}
        </Button>
        {status === "uploading" && (
          <Button size="sm" variant="outline" onClick={() => { abortRef.current = true; }}>
            {t("dev.otaAbort")}
          </Button>
        )}
        {(status === "done" || status === "error") && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setStatus("idle"); setProgress(0); setTransferred(0); }}
          >
            {t("dev.otaReset")}
          </Button>
        )}
      </div>
    </section>
  );
}
