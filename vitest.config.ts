import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Both the root suite and tests colocated next to the module they cover.
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    // Setting `exclude` replaces Vitest's defaults, so node_modules has to be
    // restated. `.next` is not in those defaults and holds compiled copies of
    // application code after a build — exactly what the glob above would catch.
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
