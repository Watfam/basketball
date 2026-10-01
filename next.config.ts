import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Next.js 16 auto-generates AGENTS.md/CLAUDE.md on build/dev; this repo
  // doesn't want those regenerated and clobbering hand-maintained docs.
  agentRules: false,

  // Lets a page say which deploy it came from, so "is this phone running
  // the latest code?" can be answered from a screenshot.
  env: {
    NEXT_PUBLIC_BUILD: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  },

  // Cross-origin isolation, for a multi-threaded model.
  //
  // Threads share memory through a SharedArrayBuffer, which browsers hand
  // out only to pages that opt in to isolation with these two headers. They
  // apply everywhere (not just the camera pages) because moving between
  // pages inside the app never reloads the document, so an isolated page
  // would otherwise lose its isolation, or give it to pages that cannot
  // use it.
  //
  // The price: the page may not load another site's images, scripts or
  // frames unless that site opts in, and may not hold on to windows it
  // opens. This app has none of those today (the Film Room only links out,
  // and every outbound link already uses rel=noopener). Anything cross-origin
  // added later - an embedded video, a hosted image - will be blocked.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },

  experimental: {
    // Next's client router cache defaults to 0s for dynamic pages, so
    // even tapping Back or flipping between two tabs you just visited
    // re-runs the whole server round trip. Keeping a page for 30s makes
    // those revisits instant. Every mutation either calls revalidatePath
    // or router.refresh(), both of which purge this cache, so a save is
    // never hidden behind it.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
