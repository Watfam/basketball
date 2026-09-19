import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Next.js 16 auto-generates AGENTS.md/CLAUDE.md on build/dev; this repo
  // doesn't want those regenerated and clobbering hand-maintained docs.
  agentRules: false,
};

export default nextConfig;
