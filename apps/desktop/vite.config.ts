import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: false,
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    outDir: "dist-web",
    emptyOutDir: true
  }
});

