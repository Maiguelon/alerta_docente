import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          EMAIL_PROVIDER: "disabled",
          MONITOR_ENABLED: "false",
          ALERT_RECIPIENT: "recipient@example.test",
          EMAIL_FROM: "alerts@example.test",
          RESEND_API_KEY: "test-key",
          ADMIN_TOKEN: "test-only-".repeat(4),
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"], setupFiles: ["./test/setup.ts"] },
}));
