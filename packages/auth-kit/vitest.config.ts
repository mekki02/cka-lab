import { defineConfig } from "vitest/config";

// Unit tests construct classes directly (no Nest DI), so decorator metadata is not needed.
export default defineConfig({
  esbuild: { tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } },
  test: { globals: true, environment: "node", include: ["src/**/*.spec.ts"] },
});
