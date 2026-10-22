import { describe, expect, it, vi } from "vitest";
import {
  parseVacancies,
  parsePositions,
  parseAddress,
  SimeClient,
  SourceError,
  detailUrl,
} from "../src/sime";
import {
  vacancyFixture,
  positionFixture,
  addressFixture,
} from "./fixtures/sime";

describe("SIME public schema", () => {
  it("reads real public examples and preserves the open-call flag", () => {
    const [vacancy] = parseVacancies(vacancyFixture, 1);
    expect(vacancy?.abierto).toBe(false);
    expect(parsePositions(positionFixture)[0]?.materia).toBe("PLASTICA");
    expect(parseAddress(addressFixture).localidad).toBe(
      "SAN MIGUEL DE TUCUMAN",
    );
    expect(detailUrl(vacancy!)).toContain("/142900?seleccionado=0");
  });

  it("distinguishes valid empty results from schema changes and missing fields", () => {
    expect(parseVacancies({ vacantes: [] }, 1)).toEqual([]);
    for (const invalid of [null, {}, { vacantes: null }, { vacantes: [{}] }]) {
      expect(() => parseVacancies(invalid, 1)).toThrow(SourceError);
    }
    expect(() =>
      parseVacancies(
        {
          vacantes: [{ ...vacancyFixture.vacantes[0], abierto: "true" }],
        },
        1,
      ),
    ).toThrow("invalid_field_abierto");
  });
});

describe("SIME HTTP failures", () => {
  it("handles redirects explicitly without following a login or other destination", async () => {
    const http = vi.fn().mockResolvedValue(
      new Response("", {
        status: 302,
        headers: { Location: "https://example.test/login" },
      }),
    );
    await expect(new SimeClient(http).list(1)).rejects.toThrow("http_302");
    expect(http.mock.calls[0]?.[1].redirect).toBe("manual");
  });
  it("retries a transient failure once and sends no credentials", async () => {
    const http = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(Response.json(vacancyFixture));
    const pause = vi.fn().mockResolvedValue(undefined);
    const rows = await new SimeClient(http, pause).list(1);
    expect(rows).toHaveLength(1);
    expect(http).toHaveBeenCalledTimes(2);
    expect(http.mock.calls[0]?.[1]).not.toHaveProperty("credentials");
  });

  it("rejects HTML/login responses instead of interpreting them as no vacancies", async () => {
    const http = vi.fn().mockResolvedValue(
      new Response("<html>login</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    );
    await expect(new SimeClient(http).list(1)).rejects.toThrow(
      "unexpected_content_type",
    );
    expect(http).toHaveBeenCalledTimes(1);
  });

  it("limits retries and reports network timeouts", async () => {
    const http = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(new SimeClient(http, async () => {}).list(2)).rejects.toThrow(
      "network_or_timeout",
    );
    expect(http).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent HTTP failure", async () => {
    const http = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(new SimeClient(http).positions(142900)).rejects.toThrow(
      "http_404",
    );
    expect(http).toHaveBeenCalledTimes(1);
  });
});
