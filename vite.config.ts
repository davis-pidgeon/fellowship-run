import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    environmentMatchGlobs: [
      ["api/**", "node"],
    ],
    // Nested git worktrees ship their own node_modules (a second React copy);
    // scanning their tests breaks with dual-React "useState of null" errors.
    exclude: [...configDefaults.exclude, ".worktrees/**"],
  },
});
