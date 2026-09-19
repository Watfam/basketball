import type { Metadata, Viewport } from "next";
import "./globals.css";

// Note: intentionally not using next/font/google here. That fetches font
// files from fonts.googleapis.com at build time, which fails in network-
// restricted environments (like this build sandbox) and adds an external
// network dependency to every build. For a "premium, sticky" app, self-
// hosting the chosen font (next/font/local) is the better long-term move
// anyway — swap this out once a type choice is made.

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a1120",
};

export const metadata: Metadata = {
  title: "Hardwood Lab",
  description: "Player and coach development app",
  // Makes "Add to Home Screen" open as a full-screen standalone app
  // (no Safari URL/tab chrome) instead of a bookmark that reopens a
  // regular cramped browser tab.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hardwood Lab",
  },
  icons: {
    icon: "/app-icon",
    apple: "/app-icon",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
