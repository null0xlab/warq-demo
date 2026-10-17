import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = (env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || "/").trim();
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;

  return {
    base: normalizedBase,
    plugins: [react()],
    optimizeDeps: { exclude: ["@electric-sql/pglite"] },
    build: {
      target: "es2022",
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 2048,
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: "0.0.0.0",
      port: 4173,
      strictPort: true,
    },
  };
});
