import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import worker from "../src/index";
const config = {
  DB: env.DB,
  EMAIL_PROVIDER: "disabled",
  ADMIN_TOKEN: "x".repeat(32),
};

describe("public surface", () => {
  it("does not expose an unauthenticated execution or email endpoint", async () => {
    for (const path of ["/", "/run", "/send", "/admin"]) {
      expect(
        (await worker.fetch(new Request("https://example.test" + path), config))
          .status,
      ).toBe(404);
    }
  });
  it("requires a strong server token for administrative status and execution", async () => {
    for (const path of ["/admin/run", "/admin/status"]) {
      expect(
        (await worker.fetch(new Request("https://example.test" + path), config))
          .status,
      ).toBe(401);
    }
    const response = await worker.fetch(
      new Request("https://example.test/admin/status", {
        headers: { Authorization: "Bearer " + config.ADMIN_TOKEN },
      }),
      config,
    );
    expect(response.status).toBe(200);
  });
  it("reports missing or stale successful scans without leaking recipient details", async () => {
    const response = await worker.fetch(
      new Request("https://example.test/healthz"),
      config,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("@");
  });
});
