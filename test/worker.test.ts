import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("public surface", () => {
  it("does not expose an unauthenticated execution or email endpoint", () => {
    for (const path of ["/", "/run", "/send", "/admin"]) {
      expect(
        worker.fetch(new Request("https://example.test" + path)).status,
      ).toBe(404);
    }
  });
});
