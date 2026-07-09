import { useHealth } from "../hooks/useHealth";
import { StatusBadge, type BadgeTone } from "../components/StatusBadge";

// Pages are the only place hooks and components are wired together. Every state
// (loading, success, error) is an explicit component state, never a blank
// region, per the design brief's no-silent-states rule.
export function HomePage() {
  const health = useHealth();

  let tone: BadgeTone = "warn";
  let label = "Checking backend...";
  if (health.status === "ok") {
    tone = "ok";
    label = `Backend ${health.backend}`;
  } else if (health.status === "error") {
    tone = "error";
    label = `Backend unreachable: ${health.message}`;
  }

  return (
    <main className="page">
      <h1>{{PROJECT_NAME}}</h1>
      <p>
        This is the React SPA scaffold. It talks to the JSON API over
        <code> /api</code> and is served by the backend in production.
      </p>
      <p>
        Backend health: <StatusBadge tone={tone} label={label} />
      </p>
    </main>
  );
}
