export type BadgeTone = "ok" | "warn" | "error";

interface StatusBadgeProps {
  tone: BadgeTone;
  label: string;
}

// Presentational only: receives props, emits nothing, never fetches. Meaning is
// carried by TEXT (the label), not color alone (an accessibility rule from the
// design brief); the tone only tints via a CSS custom property.
export function StatusBadge({ tone, label }: StatusBadgeProps) {
  return (
    <span
      className={`status-badge status-badge--${tone}`}
      data-testid="status-badge"
      data-tone={tone}
    >
      {label}
    </span>
  );
}
