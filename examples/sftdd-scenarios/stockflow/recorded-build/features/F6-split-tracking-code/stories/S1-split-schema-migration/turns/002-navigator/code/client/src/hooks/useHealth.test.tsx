import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useHealth } from "./useHealth";

describe("useHealth", () => {
  it("starts loading, then resolves to ok with the backend status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) })
    );
    const { result } = renderHook(() => useHealth());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ok"));
    if (result.current.status === "ok") {
      expect(result.current.backend).toBe("ok");
    }
  });

  it("resolves to error when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { result } = renderHook(() => useHealth());
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});
