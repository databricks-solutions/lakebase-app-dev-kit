import { describe, it, expect, vi } from "vitest";
import { getHealth } from "./health";
import { ApiError } from "./client";

describe("getHealth", () => {
  it("GETs /health and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getHealth()).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith("/health", expect.anything());
  });

  it("throws ApiError with the status when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    );
    await expect(getHealth()).rejects.toBeInstanceOf(ApiError);
  });
});
