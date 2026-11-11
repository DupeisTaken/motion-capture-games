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
  build: {
    outDir: "../../dist/mirror",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        diagnostics: fileURLToPath(
          new URL("apps/mirror/index.html", import.meta.url),
        ),
        rig: fileURLToPath(new URL("apps/mirror/rig.html", import.meta.url)),
        maze: fileURLToPath(new URL("apps/mirror/maze.html", import.meta.url)),
        mole: fileURLToPath(new URL("apps/mirror/mole.html", import.meta.url)),
        dodgeball: fileURLToPath(
          new URL("apps/mirror/dodgeball.html", import.meta.url),
        ),
        runner: fileURLToPath(
          new URL("apps/mirror/runner.html", import.meta.url),
        ),
      },
    },
  },
});
