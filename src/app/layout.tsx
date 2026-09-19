import type { Metadata } from "next";
import "./globals.css";

// Note: intentionally not using next/font/google here. That fetches font
// files from fonts.googleapis.com at build time, which fails in network-
// restricted environments (like this build sandbox) and adds an external
// network dependency to every build. For a "premium, sticky" app, self-
// hosting the chosen font (next/font/local) is the better long-term move
// anyway — swap this out once a type choice is made.

export const metadata: Metadata = {
  title: "Hardwood Lab",
  description: "Player and coach development app",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
