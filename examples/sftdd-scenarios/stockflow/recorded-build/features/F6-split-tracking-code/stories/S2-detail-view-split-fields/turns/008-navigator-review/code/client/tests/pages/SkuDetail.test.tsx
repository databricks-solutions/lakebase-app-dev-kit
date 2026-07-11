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

  // T12/AC1-batch-and-serial-shown-as-distinct-fields: the retired combined
  // inventory_code region is replaced by two separately labelled fields
  // sourced from the split batch_number/serial_number values.
  it("renders the returned batch_number and serial_number as two separately labelled fields", () => {
    render(
      <SkuDetailView
        sku="SKU-1"
        entries={[
          { location: "LOC-1", quantity: 5, batch_number: "B-1", serial_number: "S-1" },
        ]}
        parLevel={null}
      />
    );

    expect(screen.getByTestId("sku-detail-batch-0")).toHaveTextContent("B-1");
    expect(screen.getByTestId("sku-detail-serial-0")).toHaveTextContent("S-1");
  });

  // T14/AC2-combined-code-no-longer-shown: no combined-code element remains
  // anywhere on the page once the split fields replace it.
  it("renders no combined-code element anywhere on the page", () => {
    render(
      <SkuDetailView
        sku="SKU-1"
        entries={[
          { location: "LOC-1", quantity: 5, batch_number: "B-1", serial_number: "S-1" },
        ]}
        parLevel={null}
      />
    );

    expect(screen.queryByTestId(/inventory-code/)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/combined-code/)).not.toBeInTheDocument();
  });

  // T16/AC3-null-batch-shows-none: a JSON null batch_number renders an
  // explicit "none" state, leaving the serial field unaffected.
  it('renders an explicit "none" state for a null batch_number, leaving serial unaffected', () => {
    render(
      <SkuDetailView
        sku="SKU-1"
        entries={[
          { location: "LOC-1", quantity: 5, batch_number: null, serial_number: "S-2" },
        ]}
        parLevel={null}
      />
    );

    expect(screen.getByTestId("sku-detail-batch-0")).toHaveTextContent(/none/i);
    expect(screen.getByTestId("sku-detail-serial-0")).toHaveTextContent("S-2");
  });

  // T18/AC4-null-serial-shows-none: a JSON null serial_number renders an
  // explicit "none" state, leaving the batch field unaffected.
  it('renders an explicit "none" state for a null serial_number, leaving batch unaffected', () => {
    render(
      <SkuDetailView
        sku="SKU-1"
        entries={[
          { location: "LOC-1", quantity: 5, batch_number: "B-3", serial_number: null },
        ]}
        parLevel={null}
      />
    );

    expect(screen.getByTestId("sku-detail-serial-0")).toHaveTextContent(/none/i);
    expect(screen.getByTestId("sku-detail-batch-0")).toHaveTextContent("B-3");
  });
});
