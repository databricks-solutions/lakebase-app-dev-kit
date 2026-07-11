import { getJson } from "./client";

// The backend's /health endpoint (app/main.py) is the one contract that exists
// in a fresh scaffold, so it is the example the client is wired against. Replace
// this with your feature's typed endpoints as the API grows.
export interface Health {
  status: string;
}

export function getHealth(): Promise<Health> {
  return getJson<Health>("/health");
}
