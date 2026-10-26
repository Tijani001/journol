import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js loads its worker module at runtime; keeping it out of the server
  // bundle lets that import resolve from node_modules in route handlers.
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
