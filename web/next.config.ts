import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Pin the project root to THIS directory. Without this, Next infers the
// workspace root from the nearest lockfile and picks the parent vista2026/
// project (a different Next app), pulling in its middleware/files by mistake.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// Proxy API calls to the NestJS backend so the browser talks same-origin
// (no CORS) and the backend URL stays configurable per environment.
const API_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
