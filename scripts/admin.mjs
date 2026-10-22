import { existsSync } from "node:fs";
if (existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");
const command = process.argv[2] ?? "status";
if (!["status", "run"].includes(command))
  throw new Error("Use: node scripts/admin.mjs status|run");
if (!process.env.ADMIN_TOKEN)
  throw new Error("Configure ADMIN_TOKEN in .dev.vars");
const base =
  process.env.WORKER_URL ??
  "https://alerta-docente.miguel-carretero.workers.dev";
const url = new URL("/admin/" + command, base);
const response = await fetch(url, {
  method: command === "run" ? "POST" : "GET",
  headers: { Authorization: "Bearer " + process.env.ADMIN_TOKEN },
  signal: AbortSignal.timeout(120_000),
});
if (!response.ok) throw new Error("Worker HTTP " + response.status);
console.log(JSON.stringify(await response.json(), null, 2));
