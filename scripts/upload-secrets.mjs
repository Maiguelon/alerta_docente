import { writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
process.loadEnvFile(".dev.vars");
const names = [
  "ADMIN_TOKEN",
  "ALERT_RECIPIENT",
  "EMAIL_FROM",
  "RESEND_API_KEY",
];
const secrets = Object.fromEntries(
  names
    .filter((name) => process.env[name])
    .map((name) => [name, process.env[name]]),
);
if (!secrets.ADMIN_TOKEN || !secrets.ALERT_RECIPIENT)
  throw new Error("Missing ADMIN_TOKEN or ALERT_RECIPIENT");
const file = resolve(".secrets.local.json");
try {
  writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
  execFileSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "secret", "bulk", file],
    { stdio: "inherit" },
  );
} finally {
  unlinkSync(file);
}
