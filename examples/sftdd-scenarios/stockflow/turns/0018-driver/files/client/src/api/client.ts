// The api/ layer is the ONLY layer that issues fetch. Hooks call these typed
// wrappers; components and pages never fetch directly. Paths are relative
// (/api, /health) so the same code works behind the Vite dev proxy and against
// the backend that serves the built client in production.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new ApiError(`GET ${path} failed`, res.status);
  }
  return (await res.json()) as T;
}

export interface JsonResponse<T> {
  ok: boolean;
  status: number;
  body: T;
}

// Unlike getJson, postJson never throws on a non-2xx status: a validation
// failure (422) still carries a JSON body the caller needs to read
// (field-named errors), so the caller decides ok/not-ok from the response.
export async function postJson<T>(path: string, payload: unknown): Promise<JsonResponse<T>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as T;
  return { ok: res.ok, status: res.status, body };
}
