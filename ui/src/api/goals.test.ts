import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goalsApi } from "./goals";

describe("goalsApi.list", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the company goals list from the relative API path", async () => {
    await goalsApi.list("company-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/companies/company-1/goals", {
      credentials: "include",
      headers: expect.any(Headers),
    });
  });

  it("trims the search query and appends query params once", async () => {
    await goalsApi.list("company 1", { q: "  launch  ", limit: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/companies/company%201/goals?q=launch&limit=5",
      {
        credentials: "include",
        headers: expect.any(Headers),
      },
    );
  });
});
