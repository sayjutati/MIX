import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.BASE_URL": '"/dtm/"',
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
