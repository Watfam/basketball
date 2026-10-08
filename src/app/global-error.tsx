"use client";

/**
 * Last resort, when the app's own layout fails: it replaces the whole page,
 * so it can't rely on the stylesheet and is styled inline.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f2efe9",
          color: "#0d1526",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Hardwood Lab didn&rsquo;t load</h1>
          <p style={{ color: "#4a5872", lineHeight: 1.5, margin: "0 0 20px" }}>
            It&rsquo;s usually the signal. Anything you were in the middle of is still saved on this phone.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              width: "100%",
              padding: "14px 16px",
              border: 0,
              borderRadius: 12,
              background: "#c2410c",
              color: "#fff",
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
