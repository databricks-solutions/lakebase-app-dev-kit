// The api/ layer is the ONLY layer that issues fetch. Hooks call these typed
// wrappers; components and pages never fetch directly. Paths are relative
// (/api, /health) so the same code works behind the Vite dev proxy and against
// the backend that serves the built client in production.

/** The structured half of an RFC 9457 Problem Details validation refusal. */
export interface ProblemDetail {
  /** The field a validation refusal names, when the server returned a structured
   *  `detail: { field, message }`. This is what lets a form render its
   *  `field-<field>-error` seam instead of only a generic error. */
  field?: string;
  /** Human-readable message: the string `detail`, or the object's `.message`. */
  message?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The field a validation refusal named (from an object-shaped `detail`), if
     *  any. A form catches ApiError and, when `field` is set, renders the
     *  `field-<field>-error` seam; otherwise it renders the generic error seam. */
    readonly field?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// RFC 9457 Problem Details `detail` may be a STRING ("cart is empty") OR an OBJECT
// ({ field, message }) for a FIELD-SCOPED validation refusal. A client that only
// handles the string form DROPS the field + message and throws a generic error, so
// a form can never surface which field was rejected (its `field-<field>-error` seam
// never renders). Parse BOTH shapes so the field-level refusal survives to the UI.
export function _problemDetail(body: unknown): ProblemDetail {
  if (!body || typeof body !== "object") return {};
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return { message: detail };
  if (detail && typeof detail === "object") {
    const d = detail as { field?: unknown; message?: unknown };
    return {
      field: typeof d.field === "string" ? d.field : undefined,
      message: typeof d.message === "string" ? d.message : undefined,
    };
  }
  return {};
}

/** Build an ApiError from a non-ok response, preserving a field-scoped refusal. */
async function apiErrorFrom(res: Response, fallback: string): Promise<ApiError> {
  let pd: ProblemDetail = {};
  try {
    pd = _problemDetail(await res.json());
  } catch {
    // A non-JSON error body: fall back to the generic message + no field.
  }
  return new ApiError(pd.message ?? fallback, res.status, pd.field);
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw await apiErrorFrom(res, `GET ${path} failed`);
  }
  return (await res.json()) as T;
}

// Mutating request. On a validation refusal the thrown ApiError carries `.field`
// (when the server returned an object `detail`), so a form's catch can render the
// field-scoped error seam:
//
//   try { await postJson("/api/receipts", form); }
//   catch (e) {
//     if (e instanceof ApiError && e.field) setFieldError(e.field, e.message);
//     else setFormError(e instanceof Error ? e.message : String(e));
//   }
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await apiErrorFrom(res, `POST ${path} failed`);
  }
  return (await res.json()) as T;
}
