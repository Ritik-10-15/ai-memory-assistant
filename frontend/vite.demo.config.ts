import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Public portfolio build: `npm run build:demo` → dist-demo/, a static site
// with the homepage and the simulated demo only (see src/demo-main.tsx).
export default defineConfig({
  root: fileURLToPath(new URL("./demo", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  define: { "import.meta.env.VITE_PUBLIC_DEMO": JSON.stringify("true") },
  build: { outDir: fileURLToPath(new URL("./dist-demo", import.meta.url)), emptyOutDir: true, sourcemap: false },
});
