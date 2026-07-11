Feature: SKU detail JSON boundary exposes batch and serial as distinct fields
  As a warehouse operator
  I want the SKU detail response to carry batch_number and serial_number as
  two separate fields, with no retired combined inventory_code field, and an
  explicit JSON null (never a crash) when either half is untracked
  So that the SKU detail screen can render batch and serial each on its own

  Scenario: A stock row with both batch and serial populated returns them as two distinct fields
    Given a SKU seeded with a stock row carrying both a batch_number and a serial_number
    When the SKU detail view is requested for that SKU through the api boundary
    Then the response's entry shows the seeded batch_number and serial_number as two separate fields

  Scenario: The SKU detail response no longer exposes the retired combined inventory_code field
    Given a SKU seeded with a stock row carrying both a batch_number and a serial_number
    When the SKU detail view is requested for that SKU through the api boundary
    Then the response's entry contains no inventory_code key

  Scenario: A stock row with a NULL batch_number returns JSON null for batch while serial passes through unaffected
    Given a SKU seeded with a stock row whose batch_number is NULL and serial_number is set
    When the SKU detail view is requested for that SKU through the api boundary
    Then the response's entry shows batch_number as JSON null and serial_number unaffected

  Scenario: A stock row with a NULL serial_number returns JSON null for serial while batch passes through unaffected
    Given a SKU seeded with a stock row whose serial_number is NULL and batch_number is set
    When the SKU detail view is requested for that SKU through the api boundary
    Then the response's entry shows serial_number as JSON null and batch_number unaffected
