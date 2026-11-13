import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const appEntry = (name: string) =>
  fileURLToPath(new URL(`apps/mirror/${name}.html`, import.meta.url));

export default defineConfig(({ mode }) => {
  const hosted = mode === "pages";
  return {
    root: "apps/mirror",
    base: hosted ? "./" : "/",
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
      outDir: hosted ? "../../dist/pages" : "../../dist/mirror",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          directory: appEntry("index"),
          mole: appEntry("mole"),
          dodgeball: appEntry("dodgeball"),
          runner: appEntry("runner"),
          maze: appEntry("maze"),
          ...(!hosted && {
            diagnostics: appEntry("diagnostics"),
            rig: appEntry("rig"),
          }),
        },
      },
    },
  };
});
