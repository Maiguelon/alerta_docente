import { dispatch } from "./dispatch";
import { ResendMailer, type MailConfig } from "./email";
import { monitor } from "./monitor";
import { SimeClient } from "./sime";
import { Store } from "./store";

export interface Env extends MailConfig {
  DB: D1Database;
  EMAIL_PROVIDER: string;
  MONITOR_ENABLED?: string;
  ADMIN_TOKEN?: string;
}
export async function run(env: Env, now = Date.now()) {
  const store = new Store(env.DB);
  const report = await monitor(store, new SimeClient(), now, async (keys) => {
    if (env.EMAIL_PROVIDER !== "resend") return 0;
    return dispatch(
      store,
      env,
      new ResendMailer(env.RESEND_API_KEY ?? ""),
      now,
      keys,
    );
  });
  console.log(JSON.stringify({ event: "monitor_run", ...report }));
  return report;
}
export async function authorized(request: Request, env: Env): Promise<boolean> {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32) return false;
  const received = request.headers.get("Authorization") ?? "";
  const encode = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(received)),
    crypto.subtle.digest("SHA-256", encode.encode("Bearer " + env.ADMIN_TOKEN)),
  ]);
  return crypto.subtle.timingSafeEqual(actual, expected);
}
