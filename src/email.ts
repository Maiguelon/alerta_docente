import type { Alert } from "./rules";
import { detailUrl, type HttpFetch } from "./sime";

export interface EmailMessage {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}
export interface MailConfig {
  ALERT_RECIPIENT?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
}
export class DeliveryError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
  }
}
export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}
export function validateMailConfig(config: MailConfig): {
  recipient: string;
  from: string;
  key: string;
} {
  const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
  if (
    !config.ALERT_RECIPIENT ||
    !email.test(config.ALERT_RECIPIENT) ||
    !config.EMAIL_FROM ||
    !email.test(config.EMAIL_FROM) ||
    !config.RESEND_API_KEY
  ) {
    throw new DeliveryError("invalid_mail_configuration", false);
  }
  return {
    recipient: config.ALERT_RECIPIENT,
    from: config.EMAIL_FROM,
    key: config.RESEND_API_KEY,
  };
}
export function renderEmail(alert: Alert, config: MailConfig): EmailMessage {
  const { recipient, from } = validateMailConfig(config);
  const vacancy = alert.vacancy;
  const groups = new Map<
    string,
    {
      school: string;
      level: string;
      subject: string;
      address: string;
      count: number;
    }
  >();
  for (const position of alert.positions) {
    const key =
      position.organismo_id + ":" + position.nivel + ":" + position.materia;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      continue;
    }
    const address = position.address;
    groups.set(key, {
      school: position.establecimiento,
      level: position.nivel,
      subject: position.materia,
      address: address
        ? [
            address.calle + " " + address.nro,
            address.localidad,
            address.depto,
          ].join(" · ")
        : "Ubicación pendiente de confirmar en SIME",
      count: 1,
    });
  }
  const sections = [...groups.values()].map(
    (group) =>
      group.school +
      "\n" +
      group.subject +
      " · " +
      group.level +
      "\n" +
      group.address +
      "\n" +
      group.count +
      " cargo(s) / sección(es)",
  );
  const url = detailUrl(vacancy);
  const text = [
    "Llamado abierto de Plástica: nuevo o actualizado",
    "Trámite: " + vacancy.codigo,
    "Carácter: " + vacancy.caracter,
    "Publicado: " + vacancy.fechaPublicacionInicio,
    "Cierra: " + vacancy.fechaPublicacionFin + " (hora de Tucumán)",
    "",
    ...sections,
    "",
    "Ver publicación oficial: " + url,
    "",
    "Coincidencia por materia y nivel. Revisá requisitos, horarios y condiciones en SIME antes de postularte.",
    "Podés pedir a Miguel que pause o ajuste estos avisos.",
  ].join("\n");
  return {
    from: "Alerta Docente <" + from + ">",
    to: [recipient],
    subject: "[Alerta Docente] Plástica · " + vacancy.codigo,
    text,
    html:
      '<!doctype html><html lang="es"><body><div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;line-height:1.6"><h1 style="font-size:22px">Llamado abierto de Plástica</h1>' +
      text
        .split("\n")
        .map((line) => "<div>" + (escapeHtml(line) || "&nbsp;") + "</div>")
        .join("") +
      '<p><a href="' +
      escapeHtml(url) +
      '">Abrir en SIME</a></p></div></body></html>',
  };
}
export class ResendMailer {
  constructor(
    private readonly apiKey: string,
    private readonly http: HttpFetch = (url, init) => fetch(url, init),
  ) {}
  async send(eventId: string, message: EmailMessage): Promise<string> {
    let response: Response;
    try {
      response = await this.http("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.apiKey,
          "Content-Type": "application/json",
          "Idempotency-Key": "alerta-docente/" + eventId,
        },
        body: JSON.stringify(message),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new DeliveryError("provider_network_or_timeout", true);
    }
    if (!response.ok)
      throw new DeliveryError(
        "provider_http_" + response.status,
        response.status === 429 || response.status >= 500,
      );
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DeliveryError("provider_invalid_response", true);
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("id" in body) ||
      typeof body.id !== "string" ||
      !body.id
    ) {
      throw new DeliveryError("provider_invalid_response", true);
    }
    return body.id;
  }
}
