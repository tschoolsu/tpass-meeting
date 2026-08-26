import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg 含原生相依，交由 Node 於執行期載入，避免被打包
  serverExternalPackages: ["pg"],
};

export default nextConfig;
