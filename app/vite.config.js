import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/app/",
  build: {
    outDir:    "dist",
    assetsDir: "assets",
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          icons:  ["lucide-react"],
        },
      },
    },
  },
  server: {
    port: 3000,
    // Proxy /api/* → Worker (avoid CORS in dev)
    proxy: {
      "/api": {
        target:      "https://mr.yinboran.workers.dev",
        changeOrigin: true,
        secure:      true,
      },
      "/webhook": {
        target:      "https://mr.yinboran.workers.dev",
        changeOrigin: true,
      },
    },
  },
});
