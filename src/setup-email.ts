import {
  validateMailConfig,
  escapeHtml,
  type EmailMessage,
  type MailConfig,
} from "./email";
import type { Mailer } from "./dispatch";
import type { Store } from "./store";

export function setupMessage(config: MailConfig): EmailMessage {
  const { recipient, from } = validateMailConfig(config);
  const text = [
    "Hola:",
    "",
    "Este mensaje verifica la configuración de Alerta Docente.",
    "Miguel preparó avisos de llamados abiertos de Plástica y Artes Visuales de Tucumán, desde nivel inicial hasta secundario.",
    "La herramienta revisa SIME cada diez minutos y avisa por correo cuando encuentra una publicación nueva o un cambio relevante.",
    "Cada aviso incluye la escuela, la fecha de cierre y el enlace oficial para revisar requisitos y horarios.",
    "",
    "Esta prueba no corresponde a una vacante.",
    "Para ajustar o pausar los avisos, comunicate con Miguel.",
    "",
    "Fuente oficial: https://sime.educaciontuc.gov.ar/Vacantes/Index",
  ].join("\n");
  return {
    from: "Alerta Docente <" + from + ">",
    to: [recipient],
    subject: "[Alerta Docente] Prueba de configuración",
    text,
    html:
      '<!doctype html><html lang="es"><body><div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;line-height:1.6"><h1 style="font-size:22px">Alerta Docente</h1>' +
      text
        .split("\n")
        .map((line) => "<div>" + (escapeHtml(line) || "&nbsp;") + "</div>")
        .join("") +
      "</div></body></html>",
  };
}
export async function testEmail(
  store: Store,
  config: MailConfig,
  mailer: Mailer,
  now: number,
): Promise<{ providerId: string; alreadyAccepted: boolean }> {
  const message = setupMessage(config);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(message)),
  );
  const key =
    "setup/" +
    [...new Uint8Array(digest)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
  const existing = await store.getState(key);
  const previous = existing
    ? (JSON.parse(existing) as { firstAttempt: number; providerId?: string })
    : null;
  if (previous?.providerId)
    return { providerId: previous.providerId, alreadyAccepted: true };
  if (previous && now - previous.firstAttempt >= 23 * 60 * 60_000)
    throw new Error("setup_delivery_requires_manual_reconciliation");
  const firstAttempt = previous?.firstAttempt ?? now;
  // Persist before network I/O so a timeout can be retried with the same provider key.
  await store.setState(key, JSON.stringify({ firstAttempt }));
  const providerId = await mailer.send(key, message);
  await store.setState(key, JSON.stringify({ firstAttempt, providerId }));
  return { providerId, alreadyAccepted: false };
}
