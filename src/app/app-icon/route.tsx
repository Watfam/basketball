import { ImageResponse } from "next/og";

export const contentType = "image/png";

// Generated in code rather than a static asset — nothing to swap out
// once there's a real Hardwood Lab logo, just replace this route.
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a1120",
        }}
      >
        <div
          style={{
            color: "#ff6a1a",
            fontSize: 300,
            fontWeight: 800,
            fontFamily: "sans-serif",
            letterSpacing: -10,
          }}
        >
          HL
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
