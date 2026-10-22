import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { setupMessage, testEmail } from "../src/setup-email";
import { Store } from "../src/store";
const config = {
  ALERT_RECIPIENT: "recipient@example.test",
  EMAIL_FROM: "alerts@example.test",
  RESEND_API_KEY: "test-key",
};
const store = new Store(env.DB);
const now = Date.parse("2026-10-22T12:00:00Z");
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM monitor_state").run();
});
describe("configuration email", () => {
  it("clearly identifies a test and does not invent a vacancy", () => {
    const message = setupMessage(config);
    expect(message.subject).toContain("Prueba de configuración");
    expect(message.text).toContain("Esta prueba no corresponde a una vacante");
  });
  it("records successful acceptance and does not send twice", async () => {
    const send = vi.fn().mockResolvedValue("provider-test");
    expect(
      (await testEmail(store, config, { send }, now)).alreadyAccepted,
    ).toBe(false);
    expect(
      (await testEmail(store, config, { send }, now + 1)).alreadyAccepted,
    ).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("recovers a timeout with the same request and stops before idempotency expires", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue("provider-test");
    await expect(testEmail(store, config, { send }, now)).rejects.toThrow(
      "timeout",
    );
    await testEmail(store, config, { send }, now + 600_000);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    await env.DB.prepare("DELETE FROM monitor_state").run();
    const failed = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(
      testEmail(store, config, { send: failed }, now),
    ).rejects.toThrow("timeout");
    await expect(
      testEmail(store, config, { send: failed }, now + 24 * 60 * 60_000),
    ).rejects.toThrow("manual_reconciliation");
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
