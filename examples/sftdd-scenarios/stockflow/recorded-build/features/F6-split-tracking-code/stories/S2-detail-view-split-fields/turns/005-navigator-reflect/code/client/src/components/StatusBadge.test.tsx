import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

// Component tests exercise what the user sees (text + accessible seams), not
// implementation. Meaning must be carried by text, not color alone.
describe("StatusBadge", () => {
  it("renders the label text", () => {
    render(<StatusBadge tone="ok" label="Backend ok" />);
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Backend ok");
  });

  it("exposes the tone as a data attribute (not color alone)", () => {
    render(<StatusBadge tone="error" label="Backend unreachable" />);
    expect(screen.getByTestId("status-badge")).toHaveAttribute(
      "data-tone",
      "error"
    );
  });
});
