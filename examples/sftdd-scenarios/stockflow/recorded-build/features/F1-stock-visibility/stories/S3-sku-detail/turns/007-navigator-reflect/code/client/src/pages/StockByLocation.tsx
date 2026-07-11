import type { StockRecord } from "../api/stockRecords";

// AC1-stock-listing-displayed / AC3-empty-state-shown: a pure presentational
// table driven by the listing response. Renders an explicit empty-state
// message in place of the table when there is nothing to show, never a
// blank region (NFR-F1-empty-state-clean-render).
export interface StockByLocationTableProps {
  items: StockRecord[];
}

export function StockByLocationTable({ items }: StockByLocationTableProps) {
  if (items.length === 0) {
    return (
      <p
        className="stock-by-location-empty"
        data-testid="stock-by-location-empty"
        role="status"
      >
        No stock at this location
      </p>
    );
  }

  return (
    <table className="stock-by-location-table" data-testid="stock-by-location-table">
      <thead>
        <tr>
          <th>SKU</th>
          <th>Location</th>
          <th>Quantity</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={`${item.sku}-${item.location}`}>
            <td className="stock-by-location-sku" data-testid={`stock-by-location-sku-${index}`}>
              {item.sku}
            </td>
            <td
              className="stock-by-location-location"
              data-testid={`stock-by-location-location-${index}`}
            >
              {item.location}
            </td>
            <td
              className="stock-by-location-quantity quantity-right"
              data-testid={`stock-by-location-quantity-${index}`}
            >
              {item.quantity}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
