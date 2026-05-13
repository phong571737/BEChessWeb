import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:8080";

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/boards`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    // Backend unreachable — return empty list so the UI degrades gracefully
    return NextResponse.json([], { status: 200 });
  }
}
