import type { Position, SchoolAddress, Vacancy } from "./sime";
import { SourceError } from "./sime";

export interface AlertPosition extends Position {
  address: SchoolAddress | null;
}
export interface Alert {
  vacancy: Vacancy;
  positions: AlertPosition[];
}

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
export function isArtSubject(text: string): boolean {
  return /\b(PLASTICA|ARTES VISUALES|EDUCACION VISUAL)\b/.test(normalize(text));
}
export function isAllowedLevel(text: string): boolean {
  return /^(INICIAL|PRIMARIO|PRIMARIA|SECUNDARIO|SECUNDARIA|MEDIO|POLIMODAL)$/.test(
    normalize(text).replace(/^(EDUCACION|NIVEL) /, ""),
  );
}
// SIME provides Argentina wall times; UTC-3 is explicit rather than host-dependent.
export function simeTimestamp(text: string): number {
  const parts = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(text);
  if (!parts) throw new SourceError("invalid_publication_date");
  const [day, month, year, hour, minute] = parts.slice(1).map(Number);
  if (
    day === undefined ||
    month === undefined ||
    year === undefined ||
    hour === undefined ||
    minute === undefined
  )
    throw new SourceError("invalid_publication_date");
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute
  )
    throw new SourceError("invalid_publication_date");
  return local.getTime() + 3 * 60 * 60 * 1000;
}
export function isCurrent(vacancy: Vacancy, now: number): boolean {
  const start = simeTimestamp(vacancy.fechaPublicacionInicio);
  const end = simeTimestamp(vacancy.fechaPublicacionFin);
  if (end <= start) throw new SourceError("invalid_publication_range");
  return start <= now && now < end;
}
export function selectPositions(positions: Position[]): Position[] {
  return positions.filter(
    (p) => isArtSubject(p.materia) && isAllowedLevel(p.nivel),
  );
}
export function vacancyKey(vacancy: Vacancy): string {
  return vacancy.board + ":" + vacancy.id;
}
export async function fingerprint(alert: Alert): Promise<string> {
  const canonical = JSON.stringify({
    code: alert.vacancy.codigo,
    character: alert.vacancy.caracter,
    start: alert.vacancy.fechaPublicacionInicio,
    end: alert.vacancy.fechaPublicacionFin,
    positions: [...alert.positions].sort((a, b) => a.id - b.id),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
