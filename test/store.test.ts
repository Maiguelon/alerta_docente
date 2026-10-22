import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { Store } from "../src/store";
import type { Alert } from "../src/rules";
import { parsePositions, parseVacancies } from "../src/sime";
import { positionFixture, vacancyFixture } from "./fixtures/sime";
const store = new Store(env.DB);
const now = Date.parse("2026-10-22T12:00:00Z");
const alert: Alert = {
  vacancy: { ...parseVacancies(vacancyFixture, 1)[0]!, abierto: true },
  positions: parsePositions(positionFixture).map((p) => ({
    ...p,
    address: null,
  })),
};
beforeEach(async () => {
  await env.DB.batch(
    ["outbox", "vacancies", "leases", "monitor_state"].map((table) =>
      env.DB.prepare("DELETE FROM " + table),
    ),
  );
});
describe("D1 event persistence", () => {
  it("queues once, detects changes and expires superseded unsent versions", async () => {
    expect(await store.observe(alert, now)).toBe(true);
    expect(await store.observe(alert, now + 1)).toBe(false);
    expect(
      await store.observe(
        {
          ...alert,
          vacancy: {
            ...alert.vacancy,
            fechaPublicacionFin: "27/10/2026 08:00",
          },
        },
        now + 2,
      ),
    ).toBe(true);
    const rows = await env.DB.prepare(
      "SELECT state FROM outbox ORDER BY event_id",
    ).all<{ state: string }>();
    expect(rows.results.map((row) => row.state)).toEqual([
      "expired",
      "pending",
    ]);
  });
  it("recognizes reopening of the same publication", async () => {
    await store.observe(alert, now);
    await store.deactivate("1:142900", now + 1);
    expect(await store.observe(alert, now + 2)).toBe(true);
    expect(
      (
        await env.DB.prepare("SELECT version FROM vacancies").first<{
          version: number;
        }>()
      )?.version,
    ).toBe(2);
  });
  it("keeps independent boards separate during reconciliation", async () => {
    await store.observe(alert, now);
    await store.reconcile(2, [], now + 1);
    expect(
      (
        await env.DB.prepare("SELECT active FROM vacancies").first<{
          active: number;
        }>()
      )?.active,
    ).toBe(1);
    await store.reconcile(1, [], now + 2);
    expect(
      (
        await env.DB.prepare("SELECT state FROM outbox").first<{
          state: string;
        }>()
      )?.state,
    ).toBe("expired");
  });
  it("prevents overlapping jobs and recovers expired leases", async () => {
    expect(await store.acquire("first", now)).toBe(true);
    expect(await store.acquire("second", now + 1)).toBe(false);
    await store.release("second");
    expect(await store.acquire("third", now + 2)).toBe(false);
    expect(await store.acquire("fourth", now + 5 * 60_000)).toBe(true);
  });
});
