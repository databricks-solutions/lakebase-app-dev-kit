Feature: S4 Display batch and serial separately in stock views

  Scenario: T31 The home stock table renders a Batch Number column and a Serial Number column when records have populated batch_number and serial_number
    Given a stock record with populated batch and serial numbers is seeded for the home table
    When the user opens the home stock page for the split-display test
    Then the home stock table shows a Batch Number column and a Serial Number column with that record's batch and serial values

  Scenario: T32 The SKU detail view renders batch number and serial number as separate labeled fields for each location row when populated
    Given a SKU has stock at multiple locations with populated batch and serial numbers for the detail view
    When the user opens that SKU's detail page for the split-display test
    Then each location row in the detail view shows the batch number and serial number as separate labeled fields

  Scenario: T33 A home stock row with a NULL batch_number renders not tracked in the Batch Number column
    Given a stock record with a null batch number is seeded for the home table
    When the user opens the home stock page for the split-display test
    Then the Batch Number column for that home row shows "not tracked"

  Scenario: T34 A home stock row with a NULL serial_number renders not tracked in the Serial Number column
    Given a stock record with a null serial number is seeded for the home table
    When the user opens the home stock page for the split-display test
    Then the Serial Number column for that home row shows "not tracked"

  Scenario: T35 A detail-view stock record with a NULL batch_number renders not tracked in the batch number field
    Given a stock record at a location with a null batch number is seeded for the detail view
    When the user opens that SKU's detail page for the split-display test
    Then the batch number field for that detail location row shows "not tracked"

  Scenario: T36 A detail-view stock record with a NULL serial_number renders not tracked in the serial number field
    Given a stock record at a location with a null serial number is seeded for the detail view
    When the user opens that SKU's detail page for the split-display test
    Then the serial number field for that detail location row shows "not tracked"
