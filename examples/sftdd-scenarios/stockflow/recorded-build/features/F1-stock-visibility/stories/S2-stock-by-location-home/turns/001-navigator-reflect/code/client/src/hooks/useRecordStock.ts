import { useState } from "react";
import { fileStockRecord, type StockRecordInput } from "../api/stockRecords";

export type RecordStockState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success" }
  | { status: "error"; fieldErrors: Record<string, string> };

// Hooks hold data-fetching + UI state; they call the api/ layer and never
// fetch directly. The page renders the resulting state.
export function useRecordStock() {
  const [state, setState] = useState<RecordStockState>({ status: "idle" });

  async function submit(input: StockRecordInput) {
    setState({ status: "saving" });
    const result = await fileStockRecord(input);
    if (result.ok) {
      setState({ status: "success" });
      return;
    }
    const fieldErrors: Record<string, string> = {};
    for (const err of result.errors) {
      fieldErrors[err.field] = err.message;
    }
    setState({ status: "error", fieldErrors });
  }

  return { state, submit };
}
