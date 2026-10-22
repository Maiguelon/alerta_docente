export const SIME_BASE = "https://sime.educaciontuc.gov.ar";
export const BOARDS = [1, 2, 3, 4] as const;
export type Board = (typeof BOARDS)[number];

export interface Vacancy {
  id: number;
  codigo: string;
  caracter: string;
  fechaPublicacionInicio: string;
  fechaPublicacionFin: string;
  cargos: string;
  abierto: boolean;
  board: Board;
}

export interface Position {
  id: number;
  establecimiento: string;
  cargo: string;
  nivel: string;
  modalidad: string;
  materia: string;
  cargos_id: number;
  organismo_id: number;
}

export interface SchoolAddress {
  calle: string;
  nro: string;
  depto: string;
  localidad: string;
}

export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;
export class SourceError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "SourceError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SourceError("invalid_object");
  }
  return value as Record<string, unknown>;
}

function stringField(row: Record<string, unknown>, key: string): string {
  if (typeof row[key] !== "string")
    throw new SourceError("invalid_field_" + key);
  return row[key];
}

function idField(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new SourceError("invalid_field_" + key);
  }
  return value;
}

function arrayField(value: unknown, key: string): unknown[] {
  const rows = record(value)[key];
  if (!Array.isArray(rows)) throw new SourceError("invalid_array_" + key);
  return rows;
}

export function parseVacancies(value: unknown, board: Board): Vacancy[] {
  return arrayField(value, "vacantes").map((entry) => {
    const row = record(entry);
    if (typeof row.abierto !== "boolean")
      throw new SourceError("invalid_field_abierto");
    return {
      id: idField(row, "id"),
      codigo: stringField(row, "codigo"),
      caracter: stringField(row, "caracter"),
      fechaPublicacionInicio: stringField(row, "fechaPublicacionInicio"),
      fechaPublicacionFin: stringField(row, "fechaPublicacionFin"),
      cargos: stringField(row, "cargos"),
      abierto: row.abierto,
      board,
    };
  });
}

export function parsePositions(value: unknown): Position[] {
  return arrayField(value, "vacantes").map((entry) => {
    const row = record(entry);
    return {
      id: idField(row, "id"),
      establecimiento: stringField(row, "establecimiento"),
      cargo: stringField(row, "cargo"),
      nivel: stringField(row, "nivel"),
      modalidad: stringField(row, "modalidad"),
      materia: stringField(row, "materia"),
      cargos_id: idField(row, "cargos_id"),
      organismo_id: idField(row, "organismo_id"),
    };
  });
}

export function parseAddress(value: unknown): SchoolAddress {
  const row = record(record(value).domicilio);
  return {
    calle: stringField(row, "calle"),
    // SIME may represent street numbers as numbers or strings.
    nro:
      typeof row.nro === "number" ? String(row.nro) : stringField(row, "nro"),
    depto: stringField(row, "depto"),
    localidad: stringField(row, "localidad"),
  };
}

export class SimeClient {
  constructor(
    private readonly http: HttpFetch = (url, init) => fetch(url, init),
    private readonly pause: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  private async get(path: string): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await this.http(SIME_BASE + path, {
          headers: { Accept: "application/json" },
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        if (attempt === 0) {
          await this.pause(500);
          continue;
        }
        throw new SourceError("network_or_timeout");
      }
      if (!response.ok) {
        if (
          attempt === 0 &&
          (response.status === 429 || response.status >= 500)
        ) {
          await this.pause(500);
          continue;
        }
        throw new SourceError("http_" + response.status);
      }
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new SourceError("unexpected_content_type");
      }
      const body = await response.text();
      if (body.length > 1_000_000) throw new SourceError("response_too_large");
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new SourceError("invalid_json");
      }
    }
    throw new SourceError("request_failed");
  }

  async list(board: Board): Promise<Vacancy[]> {
    return parseVacancies(
      await this.get(
        "/Vacantes/ObtenerVacantes/" +
          board +
          "?caracter=-1&tab=1&mesBuscar=&anioBuscar=",
      ),
      board,
    );
  }

  async positions(id: number): Promise<Position[]> {
    return parsePositions(
      await this.get("/Vacantes/ObtenerDetalleVacante/" + id),
    );
  }

  async address(schoolId: number): Promise<SchoolAddress> {
    return parseAddress(
      await this.get("/Vacantes/ObtenerEstablecimientoDomicilio/" + schoolId),
    );
  }
}

export function detailUrl(vacancy: Vacancy): string {
  return (
    SIME_BASE +
    "/Vacantes/Detalle/" +
    vacancy.id +
    "?seleccionado=" +
    (vacancy.board - 1) +
    "&tab=1&accion=-1"
  );
}
