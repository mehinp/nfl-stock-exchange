import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const rootDir = import.meta.dirname;
const liveStreamProxyTarget =
  process.env.VITE_STREAM_PROXY_TARGET ?? "https://sunshine-laughable-unbriefly.ngrok-free.dev";

export default defineConfig({
  root: rootDir,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  build: {
    outDir: path.resolve(rootDir, "dist"),
    emptyOutDir: true,
  },
  server: {
    cors: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/live-stream": {
        target: liveStreamProxyTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/live-stream/, ""),
      },
    },
  },
});
