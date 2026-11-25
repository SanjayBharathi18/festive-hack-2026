import { globSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("./src/", import.meta.url));
const publicDir = "public";

const pages = Object.fromEntries(
  globSync("*/index.html", { cwd: root })
    .map((file) => dirname(file))
    .filter((page) => page !== publicDir)
    .map((page) => [page, join(root, page, "index.html")]),
);

export default defineConfig({
  root,
  publicDir,
  appType: "custom",
  build: {
    outDir: fileURLToPath(new URL("./dist/", import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: { input: pages },
  },
});
