import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * The smoke suite, kept in its own config rather than behind a flag in the main
 * one.
 *
 * These tests reach real catalogues over the network, so they are slow, they
 * consume rate limit, and they fail for reasons that have nothing to do with
 * the commit under test. Running them on every push would teach everyone to
 * ignore a red build. `npm test` excludes this directory; `npm run test:smoke`
 * runs nothing else.
 */
export default defineConfig({
  test: {
    // Node, not jsdom: nothing here renders, and jsdom's fetch would only get
    // in the way of testing the real one.
    environment: "node",
    include: ["__tests__/smoke/**/*.smoke.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    // Each test retries up to three times behind a growing pause.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // One catalogue at a time. Running five files in parallel would burst
    // straight through Jikan's three-per-second limit.
    fileParallelism: false,
    // A catalogue being down is one failure to read, not fifty.
    bail: 0,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
