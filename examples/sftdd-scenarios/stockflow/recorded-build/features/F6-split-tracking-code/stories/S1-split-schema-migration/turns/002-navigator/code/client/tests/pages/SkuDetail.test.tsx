import { render, screen } from "@testing-library/react";
import { SkuDetailView } from "../../src/pages/SkuDetail";

// AC1-detail-lists-all-locations / T19, AC2-tracking-code-shown / T22,
// AC3-par-level-not-tracked / T24: the SKU detail view is a pure
// presentational component driven by the detail response (one entry per
// location, each with its inventory_code, plus the untracked par level). No
// server round-trip is asserted here (that is T18/T21/T23's real-branch
// behavior tests); this is client-component-only per NFR-F1-spa-json-boundary.
describe("SkuDetailView", () => {
  it("renders one row per location entry from the detail response, each showing its location and quantity", () => {
    render(
      <SkuDetailView
        sku="SKU-1"
        entries={[
          { location: "LOC-1", quantity: 5, inventory_code: "INV-A" },
          { location: "LOC-2", quantity: 12, inventory_code: "INV-B" },
        ]}
        parLevel={null}
      />
    );

    expect(screen.getByTestId("sku-detail-location-0")).toHaveTextContent("LOC-1");
    expect(screen.getByTestId("sku-detail-quantity-0")).toHaveTextContent("5");

    expect(screen.getByTestId("sku-detail-location-1")).toHaveTextContent("LOC-2");
    expect(screen.getByTestId("sku-detail-quantity-1")).toHaveTextContent("12");
  });

  it("renders the combined inventory_code (tracking code) for each location entry", () => {
    render(
      <SkuDetailView
        sku="SKU-1"
        entries={[
          { location: "LOC-1", quantity: 5, inventory_code: "INV-A" },
          { location: "LOC-2", quantity: 12, inventory_code: "INV-B" },
        ]}
        parLevel={null}
      />
    );

    expect(screen.getByTestId("sku-detail-inventory-code-0")).toHaveTextContent("INV-A");
    expect(screen.getByTestId("sku-detail-inventory-code-1")).toHaveTextContent("INV-B");
  });

  it('renders an explicit "not tracked" indication in place of the par level when it is null, with no blank region', () => {
    render(
      <SkuDetailView
        sku="SKU-1"
        entries={[{ location: "LOC-1", quantity: 5, inventory_code: "INV-A" }]}
        parLevel={null}
      />
    );

    const parLevelSeam = screen.getByTestId("sku-detail-par-level");
    expect(parLevelSeam).toHaveTextContent(/not tracked/i);
    expect(parLevelSeam.textContent?.trim().length).toBeGreaterThan(0);
  });
});
