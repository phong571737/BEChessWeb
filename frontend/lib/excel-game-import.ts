/**
 * Small browser-side XLSX reader for the tournament pairing export used by
 * the application. It intentionally reads only shared strings and the first
 * worksheet, keeping the import dependency-free and safe for client bundles.
 */

export interface ExcelGameRow {
  boardNumber: string;
  whiteName: string;
  blackName: string;
  whitePlayerNumber?: string;
  blackPlayerNumber?: string;
  location?: string;
  tournament?: string;
  scheduledAt?: string;
}

export interface ExcelGameImport {
  rows: ExcelGameRow[];
  tournament?: string;
  scheduledAt?: string;
  location?: string;
}

const LOCAL_FILE_HEADER = 0x04034b50;

function columnNumber(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "";
  return letters.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("deflate-raw");
  const copy = new Uint8Array(data);
  const response = new Response(new Blob([copy.buffer as ArrayBuffer]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

async function readZipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = new Map<string, Uint8Array>();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== LOCAL_FILE_HEADER) break;
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    const compressed = bytes.slice(start, start + compressedSize);
    const content = method === 0 ? compressed : await inflateRaw(compressed);
    entries.set(name, content);
    offset = start + compressedSize;
  }
  return entries;
}

function xmlText(data: Uint8Array): Document {
  return new DOMParser().parseFromString(new TextDecoder().decode(data), "application/xml");
}

function textFrom(element: Element | null): string {
  return element?.textContent?.trim() ?? "";
}

function parseSchedule(value: string): string | undefined {
  const match = value.match(/(\d{4}\/\d{2}\/\d{2})\s*(?:lúc|at)\s*(\d{1,2}:\d{2})/i);
  return match ? `${match[1]} ${match[2]}` : undefined;
}

function normalizedHeader(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Parse the tournament pairing worksheet into rows usable by the game form. */
export async function parseExcelGameFile(file: File): Promise<ExcelGameImport> {
  const entries = await readZipEntries(await file.arrayBuffer());
  const shared = entries.get("xl/sharedStrings.xml");
  const sheet = entries.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("The workbook does not contain a first worksheet.");

  const sharedStrings = shared
    ? Array.from(xmlText(shared).getElementsByTagNameNS("*", "si"), (item) =>
        Array.from(item.getElementsByTagNameNS("*", "t"), (text) => textFrom(text)).join(""),
      )
    : [];
  const document = xmlText(sheet);
  const rows: ExcelGameRow[] = [];
  let tournament: string | undefined;
  let scheduledAt: string | undefined;
  let location: string | undefined;
  let locationColumn: number | undefined;
  let boardColumn: number | undefined;
  let whiteColumn: number | undefined;
  let blackColumn: number | undefined;

  for (const row of Array.from(document.getElementsByTagNameNS("*", "row"))) {
    const cells = new Map<number, string>();
    for (const cell of Array.from(row.getElementsByTagNameNS("*", "c"))) {
      const reference = cell.getAttribute("r") ?? "";
      const value = cell.getElementsByTagNameNS("*", "v")[0];
      const inline = cell.getElementsByTagNameNS("*", "t")[0];
      const raw = value ? textFrom(value) : textFrom(inline);
      const parsed = cell.getAttribute("t") === "s" ? sharedStrings[Number(raw)] ?? "" : raw;
      if (reference) cells.set(columnNumber(reference), parsed.trim());
    }

    const firstCell = cells.get(1) ?? "";
    for (const [column, value] of cells) {
      const header = normalizedHeader(value);

      if (/^(white|trang|quan trang)$/.test(header)) whiteColumn = column;
      if (/^(black|den|quan den)$/.test(header)) blackColumn = column;
      if (/^(dia diem|location|venue)$/.test(header)) locationColumn = column;
      if (/^(ban|board|board number|ban so)$/.test(header)) boardColumn = column;
    }
    if (firstCell.startsWith("Giải ")) tournament = firstCell;
    const locationMatch = firstCell.match(/^Địa điểm(?: thi đấu)?\s*:\s*(.+)$/i);
    if (locationMatch?.[1]?.trim()) location = locationMatch[1].trim();
    const schedule = parseSchedule(firstCell);
    if (schedule) scheduledAt = schedule;

    const whiteName = whiteColumn !== undefined ? cells.get(whiteColumn) ?? "" : "";
    const blackName = blackColumn !== undefined ? cells.get(blackColumn) ?? "" : "";
    if (!whiteName && !blackName) continue;
    rows.push({
      boardNumber: cells.get(boardColumn ?? 1) ?? "",
      whitePlayerNumber: cells.get(2) || undefined,
      whiteName,
      blackPlayerNumber: cells.get(14) || undefined,
      blackName,
      location: (locationColumn ? cells.get(locationColumn) : undefined) || location,
      tournament,
      scheduledAt,
    });
  }

  return { rows, tournament, scheduledAt, location };
}
