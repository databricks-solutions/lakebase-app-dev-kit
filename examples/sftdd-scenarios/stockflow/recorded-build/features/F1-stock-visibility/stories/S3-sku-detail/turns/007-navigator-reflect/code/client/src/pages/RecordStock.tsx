import { useState, type FormEvent } from "react";
import { useRecordStock } from "../hooks/useRecordStock";

// The record-stock form (ia.md, AC1-record-form-displayed): files a SKU's
// quantity and combined inventory_code at a location. Re-filing the same
// (sku, location) updates the existing record rather than duplicating or
// erroring (AC3/AC4), reflected here only as a save confirmation, never an
// error page, for a successful 2xx response.
export function RecordStockPage() {
  const { state, submit } = useRecordStock();
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [inventoryCode, setInventoryCode] = useState("");

  const fieldErrors = state.status === "error" ? state.fieldErrors : {};

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit({
      sku,
      location,
      quantity: Number(quantity),
      inventory_code: inventoryCode,
    });
  }

  if (state.status === "success") {
    return (
      <main className="page">
        <p className="record-stock-success" data-testid="record-stock-success" role="status">
          Stock record saved.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Record Stock</h1>
      <form
        className="form"
        data-testid="record-stock-form"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="form-field">
          <label htmlFor="record-stock-sku">SKU</label>
          <input
            id="record-stock-sku"
            data-testid="record-stock-field-sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
          {fieldErrors.sku && (
            <span
              className="form-field-error"
              data-testid="record-stock-field-error-sku"
              role="alert"
            >
              {fieldErrors.sku}
            </span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="record-stock-location">Location</label>
          <input
            id="record-stock-location"
            data-testid="record-stock-field-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          {fieldErrors.location && (
            <span
              className="form-field-error"
              data-testid="record-stock-field-error-location"
              role="alert"
            >
              {fieldErrors.location}
            </span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="record-stock-quantity">Quantity</label>
          <input
            id="record-stock-quantity"
            type="number"
            data-testid="record-stock-field-quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {fieldErrors.quantity && (
            <span
              className="form-field-error"
              data-testid="record-stock-field-error-quantity"
              role="alert"
            >
              {fieldErrors.quantity}
            </span>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="record-stock-inventory-code">Inventory code</label>
          <input
            id="record-stock-inventory-code"
            data-testid="record-stock-field-inventory-code"
            value={inventoryCode}
            onChange={(e) => setInventoryCode(e.target.value)}
          />
          {fieldErrors.inventory_code && (
            <span
              className="form-field-error"
              data-testid="record-stock-field-error-inventory_code"
              role="alert"
            >
              {fieldErrors.inventory_code}
            </span>
          )}
        </div>

        {fieldErrors.form && (
          <span className="form-field-error" data-testid="record-stock-field-error-form" role="alert">
            {fieldErrors.form}
          </span>
        )}

        <button
          type="submit"
          className="button button--primary"
          data-testid="record-stock-submit"
          disabled={state.status === "saving"}
        >
          {state.status === "saving" ? "Saving..." : "File stock record"}
        </button>
      </form>
    </main>
  );
}
