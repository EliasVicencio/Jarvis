import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // El servidor de dev corre en 5173, Tauri lo abre en su webview
  server: {
    port: 5173,
    strictPort: true,
    // Proxy: todas las llamadas /api van al backend Flask en 5000
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  // Build de producción va a dist/, que Tauri empaqueta
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
