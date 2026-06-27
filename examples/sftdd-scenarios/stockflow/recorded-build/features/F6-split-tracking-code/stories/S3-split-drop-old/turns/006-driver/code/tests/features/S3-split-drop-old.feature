Feature: S3 Split Inventory Code - Drop the Old inventory_code Column

  Background:
    Given the S3 up migration has been applied

  Scenario: T21 stock table has no inventory_code column after the S3 up migration
    Then the stock table has no "inventory_code" column

  Scenario: T22 inventory_code column is restored after the S3 down migration
    When the S3 down migration has been run
    Then the stock table has the "inventory_code" column

  Scenario: T23 every stock row has a non-NULL inventory_code after the S3 down migration
    Given the stock table has S3 seeded rows with populated batch_number and serial_number
    When the S3 down migration has been run
    Then every stock row has a non-NULL inventory_code value

  Scenario: T24 a NULL batch_number reconstructs with an empty batch segment in inventory_code
    Given the stock table has an S3 row with a NULL batch_number and serial_number "S001" at location "LOC"
    When the S3 down migration has been run
    Then the reconstructed inventory_code for that row is "LOC--S001"

  Scenario: T25 a NULL serial_number reconstructs with an empty serial segment in inventory_code
    Given the stock table has an S3 row with a NULL serial_number and batch_number "B7" at location "LOC"
    When the S3 down migration has been run
    Then the reconstructed S3 inventory_code for that row is "LOC-B7-"

  Scenario: T26 batch_number column is preserved after the S3 down migration
    When the S3 down migration has been run
    Then the stock table still has the "batch_number" column owned by the S1 split migration
