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
