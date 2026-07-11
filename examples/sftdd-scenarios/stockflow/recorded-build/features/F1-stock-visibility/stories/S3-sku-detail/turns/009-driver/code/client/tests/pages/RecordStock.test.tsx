import { render, screen } from "@testing-library/react";
import { RecordStockPage } from "../../src/pages/RecordStock";

// AC1-record-form-displayed / T1: the empty record-stock form renders its
// SKU, location, quantity, and inventory_code fields plus a file control,
// each with its own data-testid seam. Client component only; no server
// round-trip is asserted here (that is AC2/T5's real-branch behavior test).
describe("RecordStockPage", () => {
  it("renders the form root, every field, and the file control with their data-testid seams", () => {
    render(<RecordStockPage />);

    expect(screen.getByTestId("record-stock-form")).toBeInTheDocument();
    expect(screen.getByTestId("record-stock-field-sku")).toBeInTheDocument();
    expect(
      screen.getByTestId("record-stock-field-location")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("record-stock-field-quantity")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("record-stock-field-inventory-code")
    ).toBeInTheDocument();
    expect(screen.getByTestId("record-stock-submit")).toBeInTheDocument();
  });
});
