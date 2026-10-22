import { fingerprint, vacancyKey, type Alert } from "./rules";
import type { Board } from "./sime";

export interface Delivery {
  event_id: string;
  payload: string;
  attempts: number;
  created_at: number;
}
export class Store {
  constructor(public readonly db: D1Database) {}
  async acquire(owner: string, now: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        "INSERT INTO leases(name,owner,expires_at) VALUES('monitor',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at < ?",
      )
      .bind(owner, now + 4 * 60_000, now)
      .run();
    return result.meta.changes === 1;
  }
  async release(owner: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM leases WHERE name='monitor' AND owner=?")
      .bind(owner)
      .run();
  }
  async observe(alert: Alert, now: number): Promise<boolean> {
    const key = vacancyKey(alert.vacancy);
    const hash = await fingerprint(alert);
    const previous = await this.db
      .prepare(
        "SELECT fingerprint,version,active FROM vacancies WHERE vacancy_key=?",
      )
      .bind(key)
      .first<{ fingerprint: string; version: number; active: number }>();
    if (previous?.active === 1 && previous.fingerprint === hash) return false;
    const version = (previous?.version ?? 0) + 1;
    const payload = JSON.stringify(alert);
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO vacancies(vacancy_key,board,fingerprint,version,active,payload,observed_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(vacancy_key) DO UPDATE SET fingerprint=excluded.fingerprint,version=excluded.version,active=1,payload=excluded.payload,observed_at=excluded.observed_at",
        )
        .bind(key, alert.vacancy.board, hash, version, payload, now),
      this.db
        .prepare(
          "UPDATE outbox SET state='expired',updated_at=? WHERE vacancy_key=? AND state='pending'",
        )
        .bind(now, key),
      this.db
        .prepare(
          "INSERT INTO outbox(event_id,vacancy_key,payload,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(key + ":" + version, key, payload, now, now, now),
    ]);
    return true;
  }
  async deactivate(key: string, now: number): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE vacancies SET active=0,observed_at=? WHERE vacancy_key=? AND active=1",
        )
        .bind(now, key),
      this.db
        .prepare(
          "UPDATE outbox SET state='expired',updated_at=? WHERE vacancy_key=? AND state='pending'",
        )
        .bind(now, key),
    ]);
  }
  // Reconcile only after a complete, valid snapshot of this board.
  async reconcile(
    board: Board,
    liveKeys: string[],
    now: number,
  ): Promise<void> {
    const condition = liveKeys.length
      ? " AND vacancy_key NOT IN (" + liveKeys.map(() => "?").join(",") + ")"
      : "";
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE vacancies SET active=0,observed_at=? WHERE board=? AND active=1" +
            condition,
        )
        .bind(now, board, ...liveKeys),
      this.db
        .prepare(
          "UPDATE outbox SET state='expired',updated_at=? WHERE state='pending' AND vacancy_key IN (SELECT vacancy_key FROM vacancies WHERE board=? AND active=0)",
        )
        .bind(now, board),
    ]);
  }
  async setState(key: string, value: string): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO monitor_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .bind(key, value)
      .run();
  }
  async getState(key: string): Promise<string | null> {
    return (
      (
        await this.db
          .prepare("SELECT value FROM monitor_state WHERE key=?")
          .bind(key)
          .first<{ value: string }>()
      )?.value ?? null
    );
  }
}
