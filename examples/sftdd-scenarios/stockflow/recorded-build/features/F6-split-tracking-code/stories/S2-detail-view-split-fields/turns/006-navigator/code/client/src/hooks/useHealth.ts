import { useEffect, useState } from "react";
import { getHealth } from "../api/health";

export type HealthState =
  | { status: "loading" }
  | { status: "ok"; backend: string }
  | { status: "error"; message: string };

// Hooks hold data-fetching + UI state; they call the api/ layer and never fetch
// directly. Components receive the resulting state as props/return values.
export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((h) => {
        if (!cancelled) setState({ status: "ok", backend: h.status });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "unknown error",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
