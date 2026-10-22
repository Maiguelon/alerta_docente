import {
  BOARDS,
  type Board,
  type Position,
  type SchoolAddress,
  type Vacancy,
  type SimeClient,
  SourceError,
} from "./sime";
import { isArtSubject, isCurrent, selectPositions, vacancyKey } from "./rules";
import type { Store } from "./store";

type Source = Pick<SimeClient, "list" | "positions" | "address">;
export interface ScanReport {
  checkedAt: number;
  status: "healthy" | "degraded" | "skipped";
  boardsCompleted: number;
  publications: number;
  matching: number;
  deferred: number;
  newEvents: number;
  sent: number;
  errors: string[];
}
export async function monitor(
  store: Store,
  source: Source,
  now: number,
  deliver: (keys: string[]) => Promise<number> = async () => 0,
): Promise<ScanReport> {
  const report: ScanReport = {
    checkedAt: now,
    status: "healthy",
    boardsCompleted: 0,
    publications: 0,
    matching: 0,
    deferred: 0,
    newEvents: 0,
    sent: 0,
    errors: [],
  };
  const owner = crypto.randomUUID();
  if (!(await store.acquire(owner, now)))
    return { ...report, status: "skipped" };
  try {
    const snapshots = await Promise.allSettled(
      BOARDS.map(async (board) => ({ board, rows: await source.list(board) })),
    );
    const candidates: Vacancy[] = [];
    const live = new Map<Board, string[]>();
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i]!;
      if (snapshot.status === "rejected") {
        const reason =
          snapshot.reason instanceof SourceError
            ? snapshot.reason.reason
            : "unknown";
        report.errors.push("board_" + BOARDS[i] + "_" + reason);
        continue;
      }
      const { board, rows } = snapshot.value;
      report.publications += rows.length;
      try {
        const eligible = rows.filter(
          (v) => isArtSubject(v.cargos) && v.abierto && isCurrent(v, now),
        );
        candidates.push(...eligible);
        live.set(
          board,
          eligible.map((v) => vacancyKey(v)),
        );
        report.boardsCompleted++;
      } catch {
        report.errors.push("board_" + board + "_invalid_dates");
      }
    }
    candidates.sort((a, b) => vacancyKey(a).localeCompare(vacancyKey(b)));
    report.matching = candidates.length;
    const cursor = Number((await store.getState("scan_cursor")) ?? "0");
    const offset = candidates.length
      ? (Number.isFinite(cursor) ? cursor : 0) % candidates.length
      : 0;
    // Bound external and D1 subrequests on Workers Free; round-robin avoids starvation.
    const selected = Array.from(
      { length: Math.min(2, candidates.length) },
      (_, index) => candidates[(offset + index) % candidates.length]!,
    );
    report.deferred = candidates.length - selected.length;
    const ready: string[] = [];
    for (const vacancy of selected) {
      try {
        const positions = await source.positions(vacancy.id);
        if (!positions.length) throw new SourceError("empty_position_details");
        const allowed = selectPositions(positions);
        if (!allowed.length) {
          await store.deactivate(vacancyKey(vacancy), now);
          continue;
        }
        const addresses = new Map<number, SchoolAddress | null>();
        const schools = [...new Set(allowed.map((p) => p.organismo_id))]
          .sort((a, b) => a - b)
          .slice(0, 1);
        for (const school of schools) {
          try {
            addresses.set(school, await source.address(school));
          } catch {
            addresses.set(school, null);
          }
        }
        const alert = {
          vacancy,
          positions: allowed.map((p: Position) => ({
            ...p,
            address: addresses.get(p.organismo_id) ?? null,
          })),
        };
        if (await store.observe(alert, now)) report.newEvents++;
        ready.push(vacancyKey(vacancy));
      } catch {
        report.errors.push("vacancy_" + vacancy.id + "_detail_unavailable");
      }
    }
    for (const [board, keys] of live) await store.reconcile(board, keys, now);
    await store.setState("scan_cursor", String(offset + selected.length));
    if (report.boardsCompleted === BOARDS.length && !report.errors.length) {
      await store.setState("last_scan_success", String(now));
    }
    // Deliver only opportunities whose details were successfully revalidated in this run.
    try {
      report.sent = await deliver(ready);
    } catch {
      report.errors.push("email_dispatch_unavailable");
    }
    if (report.errors.length) report.status = "degraded";
    await store.setState("last_report", JSON.stringify(report));
    return report;
  } finally {
    await store.release(owner);
  }
}
