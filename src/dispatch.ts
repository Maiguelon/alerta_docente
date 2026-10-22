import {
  DeliveryError,
  renderEmail,
  validateMailConfig,
  type EmailMessage,
  type MailConfig,
} from "./email";
import { isCurrent, type Alert } from "./rules";
import type { Store } from "./store";

export interface Mailer {
  send(eventId: string, message: EmailMessage): Promise<string>;
}
interface Pending {
  event_id: string;
  payload: string;
  attempts: number;
  first_attempt_at: number | null;
  request_json: string | null;
}
export async function dispatch(
  store: Store,
  config: MailConfig,
  mailer: Mailer,
  now: number,
  allowedKeys?: string[],
): Promise<number> {
  validateMailConfig(config);
  if (allowedKeys && !allowedKeys.length) return 0;
  const restriction = allowedKeys
    ? " AND vacancy_key IN (" + allowedKeys.map(() => "?").join(",") + ")"
    : "";
  const day = new Date(now + -3 * 60 * 60_000).toISOString().slice(0, 10);
  const used = await store.db
    .prepare("SELECT attempts FROM send_budget WHERE day=?")
    .bind(day)
    .first<{ attempts: number }>();
  const available = Math.min(2, 50 - (used?.attempts ?? 0));
  if (available <= 0) return 0;
  const rows = await store.db
    .prepare(
      "SELECT event_id,payload,attempts,first_attempt_at,request_json FROM outbox WHERE ((state='pending' AND next_attempt_at<=?) OR (state='sending' AND lease_until<=?))" +
        restriction +
        " ORDER BY created_at LIMIT ?",
    )
    .bind(now, now, ...(allowedKeys ?? []), available)
    .all<Pending>();
  let sent = 0;
  for (const row of rows.results) {
    const alert = JSON.parse(row.payload) as Alert;
    if (!isCurrent(alert.vacancy, now)) {
      await store.db
        .prepare(
          "UPDATE outbox SET state='expired',updated_at=? WHERE event_id=?",
        )
        .bind(now, row.event_id)
        .run();
      continue;
    }
    // Provider idempotency lasts 24h. Stop before its expiry rather than risk duplicate delivery.
    if (
      row.first_attempt_at !== null &&
      now - row.first_attempt_at >= 23 * 60 * 60_000
    ) {
      await store.db
        .prepare(
          "UPDATE outbox SET state='uncertain',error_code='idempotency_window_elapsed',updated_at=? WHERE event_id=?",
        )
        .bind(now, row.event_id)
        .run();
      continue;
    }
    const message = row.request_json
      ? (JSON.parse(row.request_json) as EmailMessage)
      : renderEmail(alert, config);
    const claim = await store.db
      .prepare(
        "UPDATE outbox SET state='sending',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?),request_json=COALESCE(request_json,?),lease_until=?,updated_at=? WHERE event_id=? AND ((state='pending' AND next_attempt_at<=?) OR (state='sending' AND lease_until<=?))",
      )
      .bind(
        now,
        JSON.stringify(message),
        now + 60_000,
        now,
        row.event_id,
        now,
        now,
      )
      .run();
    if (claim.meta.changes !== 1) continue;
    await store.db
      .prepare(
        "INSERT INTO send_budget(day,attempts) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET attempts=attempts+1",
      )
      .bind(day)
      .run();
    try {
      const providerId = await mailer.send(row.event_id, message);
      await store.db
        .prepare(
          "UPDATE outbox SET state='sent',provider_id=?,lease_until=NULL,error_code=NULL,updated_at=? WHERE event_id=?",
        )
        .bind(providerId, now, row.event_id)
        .run();
      sent++;
    } catch (error) {
      const failure =
        error instanceof DeliveryError
          ? error
          : new DeliveryError("unknown_delivery_failure", true);
      const retry = failure.retryable && row.attempts + 1 < 5;
      await store.db
        .prepare(
          "UPDATE outbox SET state=?,error_code=?,next_attempt_at=?,lease_until=NULL,updated_at=? WHERE event_id=?",
        )
        .bind(
          retry ? "pending" : "failed",
          failure.code,
          now + Math.min(60, 2 ** row.attempts) * 10 * 60_000,
          now,
          row.event_id,
        )
        .run();
    }
  }
  return sent;
}
