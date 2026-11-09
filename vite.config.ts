import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "apps/mirror",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL(".", import.meta.url))] },
    proxy: { "/api": { target: "http://127.0.0.1:8765", ws: true } },
  },
  preview: {
    proxy: { "/api": { target: "http://127.0.0.1:8765", ws: true } },
  },
  build: { outDir: "../../dist/mirror", emptyOutDir: true },
});
