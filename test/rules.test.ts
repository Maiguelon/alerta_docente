import { describe, expect, it } from "vitest";
import {
  isArtSubject,
  isAllowedLevel,
  simeTimestamp,
  isCurrent,
  selectPositions,
} from "../src/rules";
import { parseVacancies, parsePositions } from "../src/sime";
import { vacancyFixture, positionFixture } from "./fixtures/sime";

describe("subject and level boundaries", () => {
  it("matches spelling variations without including technical drawing or music", () => {
    for (const value of ["Plástica", "EDUCACION PLASTICA", "Artes visuales"])
      expect(isArtSubject(value)).toBe(true);
    for (const value of ["DIBUJO TECNICO", "MUSICA", "EDUCACION ARTISTICA"])
      expect(isArtSubject(value)).toBe(false);
  });
  it("includes initial through secondary and excludes higher or unknown levels", () => {
    for (const value of [
      "INICIAL",
      "PRIMARIO",
      "SECUNDARIO",
      "Educación Secundaria",
    ])
      expect(isAllowedLevel(value)).toBe(true);
    for (const value of ["SUPERIOR", "UNIVERSITARIO", "", "OTRO"])
      expect(isAllowedLevel(value)).toBe(false);
    const p = parsePositions(positionFixture)[0]!;
    expect(
      selectPositions([
        p,
        { ...p, id: 2, nivel: "SUPERIOR" },
        { ...p, id: 3, materia: "MUSICA" },
      ]),
    ).toEqual([p]);
  });
});
describe("Argentina publication times", () => {
  it("uses UTC-3 and an exclusive close boundary", () => {
    expect(simeTimestamp("22/10/2026 08:00")).toBe(
      Date.parse("2026-10-22T11:00:00Z"),
    );
    const v = parseVacancies(vacancyFixture, 1)[0]!;
    expect(isCurrent(v, Date.parse("2026-10-22T10:59:59Z"))).toBe(false);
    expect(isCurrent(v, Date.parse("2026-10-22T11:00:00Z"))).toBe(true);
    expect(isCurrent(v, Date.parse("2026-10-26T11:00:00Z"))).toBe(false);
  });
  it("rejects impossible dates", () => {
    for (const value of ["31/02/2026 08:00", "22/10/2026 24:00", "2026-10-22"])
      expect(() => simeTimestamp(value)).toThrow("invalid_publication_date");
  });
});
