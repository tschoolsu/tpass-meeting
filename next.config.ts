import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg 含原生相依，交由 Node 於執行期載入，避免被打包
  serverExternalPackages: ["pg"],
  experimental: {
    // BGM 與匯入最多 10 MB，保留 multipart 的額外開銷
    serverActions: {
      bodySizeLimit: "11mb",
    },
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
