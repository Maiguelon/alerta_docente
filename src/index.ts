import { authorized, run, type Env } from "./app";
import { Store } from "./store";
import { testEmail } from "./setup-email";
import { ResendMailer } from "./email";
export type { Env } from "./app";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" && request.method === "GET") {
      try {
        const store = new Store(env.DB);
        const last = Number(await store.getState("last_scan_success"));
        const reportText = await store.getState("last_report");
        const report = reportText
          ? (JSON.parse(reportText) as { status?: string })
          : null;
        const attention = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM outbox WHERE state IN ('failed','uncertain')",
        ).first<{ count: number }>();
        const attentionRequired = (attention?.count ?? 0) > 0;
        const healthy =
          last > 0 &&
          Date.now() - last < 30 * 60_000 &&
          report?.status !== "degraded" &&
          !attentionRequired;
        return Response.json(
          {
            service: "alerta-docente",
            status: healthy ? "healthy" : "degraded",
            emailEnabled: env.EMAIL_PROVIDER === "resend",
            attentionRequired,
            lastSuccessfulScan: last || null,
          },
          {
            status: healthy ? 200 : 503,
            headers: { "Cache-Control": "no-store" },
          },
        );
      } catch {
        return Response.json({ status: "unavailable" }, { status: 503 });
      }
    }
    if (url.pathname.startsWith("/admin/")) {
      if (!(await authorized(request, env)))
        return new Response("Unauthorized", { status: 401 });
      if (url.pathname === "/admin/test-email" && request.method === "POST") {
        return Response.json(
          await testEmail(
            new Store(env.DB),
            env,
            new ResendMailer(env.RESEND_API_KEY ?? ""),
            Date.now(),
          ),
        );
      }
      if (url.pathname === "/admin/run" && request.method === "POST")
        return Response.json(await run(env));
      if (url.pathname === "/admin/status" && request.method === "GET") {
        const report = await new Store(env.DB).getState("last_report");
        return Response.json(
          { report: report ? JSON.parse(report) : null },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    return new Response("Not found", { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    if (env.MONITOR_ENABLED === "true") await run(env);
  },
} satisfies ExportedHandler<Env>;
