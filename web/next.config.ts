import type { NextConfig } from "next";

// Proxy API calls to the NestJS backend so the browser talks same-origin
// (no CORS) and the backend URL stays configurable per environment.
const API_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
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
