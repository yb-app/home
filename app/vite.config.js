import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/home/",
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
    proxy: {
      "/api": {
        target:       "https://mr.yinboran.workers.dev",
        changeOrigin: true,
        secure:       true,
      },
    },
  },
});
