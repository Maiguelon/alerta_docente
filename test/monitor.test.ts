import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { monitor } from "../src/monitor";
import { Store } from "../src/store";
import { parsePositions, parseVacancies } from "../src/sime";
import {
  vacancyFixture,
  positionFixture,
  addressFixture,
} from "./fixtures/sime";
const now = Date.parse("2026-10-22T12:00:00Z");
const store = new Store(env.DB);
const vacancy = { ...parseVacancies(vacancyFixture, 1)[0]!, abierto: true };
function source() {
  return {
    list: vi.fn(async (board: number) => (board === 1 ? [vacancy] : [])),
    positions: vi.fn(async () => parsePositions(positionFixture)),
    address: vi.fn(async () => addressFixture.domicilio),
  };
}
beforeEach(async () => {
  await env.DB.batch(
    ["outbox", "vacancies", "leases", "monitor_state", "send_budget"].map((t) =>
      env.DB.prepare("DELETE FROM " + t),
    ),
  );
});
describe("monitor lifecycle", () => {
  it("does not generate another alert when optional address lookup fails", async () => {
    await monitor(store, source(), now);
    const s = source();
    s.address.mockRejectedValue(new Error("address unavailable"));
    expect((await monitor(store, s, now + 600_000)).newEvents).toBe(0);
  });
  it("finds a real-shaped open call and queues a single event over repeated scans", async () => {
    const s = source();
    expect((await monitor(store, s, now)).newEvents).toBe(1);
    expect((await monitor(store, s, now + 600_000)).newEvents).toBe(0);
    expect(await store.getState("last_scan_success")).toBe(
      String(now + 600_000),
    );
  });
  it("preserves existing vacancies when their source board fails and does not send unvalidated records", async () => {
    await monitor(store, source(), now);
    const broken = source();
    broken.list.mockRejectedValue(new Error("offline"));
    const deliver = vi.fn(async () => 0);
    const report = await monitor(store, broken, now + 600_000, deliver);
    expect(report.status).toBe("degraded");
    expect(
      (
        await env.DB.prepare("SELECT active FROM vacancies").first<{
          active: number;
        }>()
      )?.active,
    ).toBe(1);
    expect(deliver).toHaveBeenCalledWith([]);
    expect(await store.getState("last_scan_success")).toBe(String(now));
  });
  it("expires a withdrawn call only after a valid source snapshot", async () => {
    await monitor(store, source(), now);
    const empty = source();
    empty.list.mockResolvedValue([]);
    await monitor(store, empty, now + 600_000);
    expect(
      (
        await env.DB.prepare("SELECT state FROM outbox").first<{
          state: string;
        }>()
      )?.state,
    ).toBe("expired");
  });
  it("detects a change from ordinary publication to open call", async () => {
    const s = source();
    s.list.mockImplementation(async (board) =>
      board === 1 ? [{ ...vacancy, abierto: false }] : [],
    );
    expect((await monitor(store, s, now)).newEvents).toBe(0);
    expect((await monitor(store, source(), now + 600_000)).newEvents).toBe(1);
  });
  it("excludes higher education even in the art classification board", async () => {
    const s = source();
    s.positions.mockResolvedValue(
      parsePositions(positionFixture).map((p) => ({ ...p, nivel: "SUPERIOR" })),
    );
    expect((await monitor(store, s, now)).newEvents).toBe(0);
  });
  it("round-robins bounded work without starving later vacancies", async () => {
    const s = source();
    s.list.mockImplementation(async (board) =>
      board === 1
        ? [vacancy, { ...vacancy, id: 142901 }, { ...vacancy, id: 142902 }]
        : [],
    );
    expect((await monitor(store, s, now)).deferred).toBe(1);
    await monitor(store, s, now + 600_000);
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS count FROM vacancies").first<{
          count: number;
        }>()
      )?.count,
    ).toBe(3);
  });
});
