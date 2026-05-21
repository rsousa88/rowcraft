import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sql.js loads its WASM in the browser via dynamic import — no special bundler config needed
  turbopack: {},
};

export default nextConfig;
