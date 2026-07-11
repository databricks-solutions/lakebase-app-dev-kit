import { postJson } from "./client";

export interface StockRecordInput {
  sku: string;
  location: string;
  quantity: number;
  inventory_code: string;
}

export interface StockRecord {
  sku: string;
  location: string;
  quantity: number;
  inventory_code: string;
}

export interface FieldError {
  field: string;
  message: string;
}

export type FileStockRecordResult =
  | { ok: true; record: StockRecord }
  | { ok: false; errors: FieldError[] };

// FastAPI's default 422 validation body shape: { detail: [{ loc: [...], msg }] }.
interface ValidationErrorBody {
  detail?: Array<{ loc?: unknown[]; msg?: string }>;
}

function toFieldErrors(body: unknown): FieldError[] {
  const detail = (body as ValidationErrorBody | undefined)?.detail;
  if (!Array.isArray(detail) || detail.length === 0) {
    return [{ field: "form", message: "Could not save the stock record." }];
  }
  return detail.map((item) => {
    const loc = Array.isArray(item.loc) ? item.loc : [];
    const field = String(loc[loc.length - 1] ?? "form");
    return { field, message: item.msg ?? `${field} is invalid` };
  });
}

export async function fileStockRecord(
  input: StockRecordInput
): Promise<FileStockRecordResult> {
  const response = await postJson<StockRecord | ValidationErrorBody>(
    "/api/stock-records",
    input
  );
  if (response.ok) {
    return { ok: true, record: response.body as StockRecord };
  }
  return { ok: false, errors: toFieldErrors(response.body) };
}
