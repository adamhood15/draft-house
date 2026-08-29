import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node: most of src/lib is pure or server-side, and booting
    // jsdom for those costs ~20s a run. Component tests opt in per file with
    // a `// @vitest-environment jsdom` docblock at the top.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: true,
  },
  resolve: {
    alias: {
      // Mirrors the "@/*" -> "./src/*" path in tsconfig.json. The two have to
      // agree or imports resolve under tsc but not under vitest.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `import "server-only"` throws by default outside a React Server
      // Component, which makes every module under src/lib untestable. Next
      // swaps in this same empty module under the "react-server" export
      // condition; vitest has no such condition, so alias it explicitly.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url)
      ),
    },
  },
});
