import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TTLab Chess";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #111827 0%, #1f2937 45%, #111827 100%)",
          color: "white",
          padding: "64px",
          fontFamily: "Arial",
        }}
      >
        <div style={{ fontSize: 26, opacity: 0.85 }}>TTLab Chess</div>
        <div style={{ fontSize: 72, fontWeight: 700, marginTop: 12 }}>Smart Chess Platform</div>
        <div style={{ fontSize: 30, marginTop: 20, opacity: 0.9 }}>
          Real-time Board • Match Review • PGN Analytics
        </div>
      </div>
    ),
    size
  );
}
