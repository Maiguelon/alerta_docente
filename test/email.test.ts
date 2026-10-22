import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { DeliveryError, renderEmail, ResendMailer } from "../src/email";
import { dispatch } from "../src/dispatch";
import { Store } from "../src/store";
import type { Alert } from "../src/rules";
import { parseVacancies, parsePositions } from "../src/sime";
import { vacancyFixture, positionFixture } from "./fixtures/sime";
const config = {
  ALERT_RECIPIENT: "recipient@example.test",
  EMAIL_FROM: "alerts@example.test",
  RESEND_API_KEY: "test-key",
};
const now = Date.parse("2026-10-22T12:00:00Z");
const store = new Store(env.DB);
const alert: Alert = {
  vacancy: { ...parseVacancies(vacancyFixture, 1)[0]!, abierto: true },
  positions: parsePositions(positionFixture).map((p) => ({
    ...p,
    address: null,
  })),
};
beforeEach(async () => {
  await env.DB.batch(
    ["outbox", "vacancies", "send_budget"].map((table) =>
      env.DB.prepare("DELETE FROM " + table),
    ),
  );
});
describe("email safety and provider", () => {
  it("escapes source content and includes the official deadline and link", () => {
    const message = renderEmail(
      {
        ...alert,
        positions: [
          {
            ...alert.positions[0]!,
            establecimiento: '<img src=x onerror="alert(1)">',
          },
        ],
      },
      config,
    );
    expect(message.html).not.toContain("<img");
    expect(message.html).toContain("&lt;img");
    expect(message.text).toContain("26/10/2026 08:00");
    expect(message.text).toContain(
      "https://sime.educaciontuc.gov.ar/Vacantes/Detalle/142900",
    );
  });
  it("uses stable idempotency and reports transient provider errors", async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ id: "delivery-1" }));
    const mailer = new ResendMailer("test-key", http);
    const message = renderEmail(alert, config);
    await expect(mailer.send("1:142900:1", message)).rejects.toMatchObject({
      retryable: true,
    });
    expect(await mailer.send("1:142900:1", message)).toBe("delivery-1");
    expect(http.mock.calls[0]?.[1].headers["Idempotency-Key"]).toBe(
      http.mock.calls[1]?.[1].headers["Idempotency-Key"],
    );
  });
  it("rejects invalid recipient configuration before any send", async () => {
    const send = vi.fn();
    await expect(
      dispatch(
        store,
        { ...config, ALERT_RECIPIENT: "bad\r\nBcc: other@example.test" },
        { send },
        now,
      ),
    ).rejects.toThrow("invalid_mail_configuration");
    expect(send).not.toHaveBeenCalled();
  });
});
describe("persistent delivery recovery", () => {
  it("sends a pending event once across repeated runs", async () => {
    await store.observe(alert, now);
    const send = vi.fn().mockResolvedValue("provider-1");
    expect(await dispatch(store, config, { send }, now)).toBe(1);
    expect(await dispatch(store, config, { send }, now + 600_000)).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("retries the same immutable envelope even if configuration changes", async () => {
    await store.observe(alert, now);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new DeliveryError("provider_timeout", true))
      .mockResolvedValueOnce("provider-1");
    expect(await dispatch(store, config, { send }, now)).toBe(0);
    expect(
      await dispatch(
        store,
        { ...config, ALERT_RECIPIENT: "changed@example.test" },
        { send },
        now + 600_000,
      ),
    ).toBe(1);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  });
  it("holds an ambiguous stale attempt rather than resending beyond the deduplication window", async () => {
    await store.observe(alert, now);
    await env.DB.prepare(
      "UPDATE outbox SET state='sending',first_attempt_at=?,lease_until=?",
    )
      .bind(now - 24 * 60 * 60_000, now - 1)
      .run();
    const send = vi.fn();
    expect(await dispatch(store, config, { send }, now)).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(
      (
        await env.DB.prepare("SELECT state FROM outbox").first<{
          state: string;
        }>()
      )?.state,
    ).toBe("uncertain");
  });
  it("does not send expired or superseded opportunities", async () => {
    await store.observe(alert, now);
    const send = vi.fn();
    expect(
      await dispatch(
        store,
        config,
        { send },
        Date.parse("2026-10-26T11:00:00Z"),
      ),
    ).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
  it("stops permanent failures and respects the daily budget", async () => {
    await store.observe(alert, now);
    const send = vi
      .fn()
      .mockRejectedValue(new DeliveryError("provider_http_403", false));
    await dispatch(store, config, { send }, now);
    expect(
      (
        await env.DB.prepare("SELECT state FROM outbox").first<{
          state: string;
        }>()
      )?.state,
    ).toBe("failed");
    await env.DB.prepare("UPDATE outbox SET state='pending'").run();
    await env.DB.prepare("UPDATE send_budget SET attempts=50").run();
    expect(await dispatch(store, config, { send }, now + 600_000)).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
