import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Next.js 16 auto-generates AGENTS.md/CLAUDE.md on build/dev; this repo
  // doesn't want those regenerated and clobbering hand-maintained docs.
  agentRules: false,

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
