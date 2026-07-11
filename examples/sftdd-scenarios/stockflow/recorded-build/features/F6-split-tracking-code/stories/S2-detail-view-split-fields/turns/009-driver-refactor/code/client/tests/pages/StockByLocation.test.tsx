import { render, screen } from "@testing-library/react";
import { StockByLocationTable } from "../../src/pages/StockByLocation";

// AC1-stock-listing-displayed / T14 + T15, AC3-empty-state-shown / T17: the
// stock-by-location table is a pure presentational component driven by the
// listing response (sku, location, quantity rows). No server round-trip is
// asserted here (that is T13/T16's real-branch behavior test); this is
// client-component-only per NFR-F1-spa-json-boundary.
describe("StockByLocationTable", () => {
  it("renders one row per item from the listing response, each with its sku, location, and quantity data-testid seams", () => {
    render(
      <StockByLocationTable
        items={[
          { sku: "SKU-1", location: "LOC-1", quantity: 5 },
          { sku: "SKU-2", location: "LOC-1", quantity: 12 },
        ]}
      />
    );

    expect(screen.getByTestId("stock-by-location-table")).toBeInTheDocument();

    expect(screen.getByTestId("stock-by-location-sku-0")).toHaveTextContent("SKU-1");
    expect(screen.getByTestId("stock-by-location-location-0")).toHaveTextContent("LOC-1");
    expect(screen.getByTestId("stock-by-location-quantity-0")).toHaveTextContent("5");

    expect(screen.getByTestId("stock-by-location-sku-1")).toHaveTextContent("SKU-2");
    expect(screen.getByTestId("stock-by-location-location-1")).toHaveTextContent("LOC-1");
    expect(screen.getByTestId("stock-by-location-quantity-1")).toHaveTextContent("12");
  });

  it("right-aligns each quantity cell with the design-guide class / data-testid seam, never an inline style", () => {
    render(
      <StockByLocationTable
        items={[{ sku: "SKU-1", location: "LOC-1", quantity: 5 }]}
      />
    );

    const quantityCell = screen.getByTestId("stock-by-location-quantity-0");
    expect(quantityCell.className).toMatch(/quantity-right/);
    expect(quantityCell).not.toHaveAttribute("style");
  });

  it('renders the explicit "No stock at this location" message in place of the table when the listing response is empty', () => {
    render(<StockByLocationTable items={[]} />);

    expect(screen.getByTestId("stock-by-location-empty")).toHaveTextContent(
      "No stock at this location"
    );
    expect(screen.queryByTestId("stock-by-location-table")).not.toBeInTheDocument();
  });
});
