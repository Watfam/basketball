import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted rather than next/font/google: Google's loader fetches from
// fonts.googleapis.com at build time, which fails in network-restricted
// environments. These woff2 files (latin subset, ~43KB total) ship with
// the repo, so builds never depend on the network.
//
// Archivo carries UI + body: a grotesque with real weight range (400-900)
// that goes genuinely heavy without turning into a novelty face.
const archivo = localFont({
  src: "./fonts/archivo-variable.woff2",
  weight: "400 900",
  variable: "--font-sans-local",
  display: "swap",
});

// Bebas is the broadcast/jersey face — used only for big numerals and
// hero type (ratings, stat tiles, player name), never body copy.
const bebas = localFont({
  src: "./fonts/bebas-neue.woff2",
  weight: "400",
  variable: "--font-display-local",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f2efe9",
};

export const metadata: Metadata = {
  title: "Hardwood Lab",
  description: "Player and coach development app",
  // Makes "Add to Home Screen" open as a full-screen standalone app
  // (no Safari URL/tab chrome) instead of a bookmark that reopens a
  // regular cramped browser tab.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Hardwood Lab",
  },
  icons: {
    icon: "/app-icon",
    apple: "/app-icon",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${archivo.variable} ${bebas.variable}`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
