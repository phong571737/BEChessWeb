import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TTLab Chess Match Review";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function Image({ params }: Props) {
  const { id } = await params;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          color: "white",
          padding: "64px",
          fontFamily: "Arial",
        }}
      >
        <div style={{ fontSize: 24, opacity: 0.85 }}>TTLab Chess</div>
        <div style={{ fontSize: 64, fontWeight: 700, marginTop: 8 }}>Match Review</div>
        <div style={{ fontSize: 28, marginTop: 18, opacity: 0.95 }}>Game ID: {id}</div>
      </div>
    ),
    size
  );
}
