import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "server-only", replacement: fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)) },
      { find: "@yola/sdk/react", replacement: fileURLToPath(new URL("./src/sdk/react/index.ts", import.meta.url)) },
      { find: "@yola/sdk", replacement: fileURLToPath(new URL("./src/sdk/index.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
