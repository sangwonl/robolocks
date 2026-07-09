import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  // Pyodide's ESM loader references Node built-ins behind runtime guards; let
  // Vite bundle it as-is (into the lazy worker chunk) instead of pre-bundling
  // it as a dependency, which otherwise trips esbuild over those built-ins.
  optimizeDeps: {
    exclude: ["pyodide"],
  },
  worker: {
    format: "es",
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) {
            return "three";
          }
          if (id.includes("/node_modules/react") || id.includes("/node_modules/react-dom")) {
            return "react";
          }
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
