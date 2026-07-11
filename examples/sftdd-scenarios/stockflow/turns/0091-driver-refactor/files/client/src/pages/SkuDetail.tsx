export interface SkuDetailEntry {
  location: string;
  quantity: number;
  inventory_code?: string;
  batch_number?: string | null;
  serial_number?: string | null;
}

// AC1-detail-lists-all-locations / AC2-tracking-code-shown /
// AC3-par-level-not-tracked: a pure presentational view driven by the SKU
// detail response. One row per location entry (location, quantity,
// inventory_code or batch_number/serial_number) plus an explicit "not tracked"
// indication in place of a blank/null par level (NFR-F1-spa-json-boundary: no
// server round-trip here, the api/ layer owns that). For F6-split-tracking-code,
// batch_number and serial_number render as distinct fields; null values render
// "none" explicitly (NFR-F6-null-field-clean-render).
export interface SkuDetailViewProps {
  sku: string;
  entries: SkuDetailEntry[];
  parLevel: number | null;
}

function hasSplitFields(entry: SkuDetailEntry): boolean {
  return "batch_number" in entry || "serial_number" in entry;
}

export function SkuDetailView({ sku, entries, parLevel }: SkuDetailViewProps) {
  const usesSplitFields = entries.some(hasSplitFields);

  return (
    <section className="sku-detail" data-testid="sku-detail">
      <h1 className="sku-detail-sku" data-testid="sku-detail-sku">
        {sku}
      </h1>

      <p className="sku-detail-par-level" data-testid="sku-detail-par-level">
        Par level: {parLevel === null || parLevel === undefined ? "Not tracked" : parLevel}
      </p>

      <table className="stock-by-location-table" data-testid="sku-detail-table">
        <thead>
          <tr>
            <th>Location</th>
            <th>Quantity</th>
            {usesSplitFields ? (
              <>
                <th>Batch Number</th>
                <th>Serial Number</th>
              </>
            ) : (
              <th>Inventory code</th>
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.location}>
              <td className="sku-detail-location" data-testid={`sku-detail-location-${index}`}>
                {entry.location}
              </td>
              <td
                className="sku-detail-quantity quantity-right"
                data-testid={`sku-detail-quantity-${index}`}
              >
                {entry.quantity}
              </td>
              {usesSplitFields ? (
                <>
                  <td
                    className="sku-detail-batch"
                    data-testid={`sku-detail-batch-${index}`}
                  >
                    {entry.batch_number === null || entry.batch_number === undefined
                      ? "None"
                      : entry.batch_number}
                  </td>
                  <td
                    className="sku-detail-serial"
                    data-testid={`sku-detail-serial-${index}`}
                  >
                    {entry.serial_number === null || entry.serial_number === undefined
                      ? "None"
                      : entry.serial_number}
                  </td>
                </>
              ) : (
                <td
                  className="sku-detail-inventory-code"
                  data-testid={`sku-detail-inventory-code-${index}`}
                >
                  {entry.inventory_code}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
