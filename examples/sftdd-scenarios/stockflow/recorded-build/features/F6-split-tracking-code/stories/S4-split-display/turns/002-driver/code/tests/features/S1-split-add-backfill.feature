Feature: S1 Split Inventory Code - Add Columns and Backfill

  Background:
    Given the S1 split migration has been applied

  Scenario: T1 stock table has a batch_number column after the migration
    Then the stock table has a "batch_number" column

  Scenario: T2 stock table has a serial_number column after the migration
    Then the stock table has a "serial_number" column

  Scenario: T3 three-segment inventory code A12-B7-S001 backfills to batch_number B7 and serial_number S001
    Then the stock row with inventory code "A12-B7-S001" has batch number "B7" and serial number "S001"

  Scenario: T4 two-segment inventory code A12-B7 backfills to batch_number B7 with NULL serial_number
    Then the stock row with inventory code "A12-B7" has batch number "B7" and no serial number

  Scenario: T5 one-segment inventory code A12 backfills with NULL batch_number and NULL serial_number
    Then the stock row with inventory code "A12" has no batch number and no serial number

  Scenario: T6 every row in a 100-row seeded stock table has batch_number and serial_number after migration
    Then all 100 seeded T6 rows have batch_number and serial_number present

  Scenario: T7 location column value is unchanged for a row after the migration
    Then the seeded row for sku "SPLIT-T3-3SEG" still has location "LOC-SPLIT-T3"

  Scenario: T8 sku and quantity are unchanged for a row after the migration
    Then the seeded row for sku "SPLIT-T3-3SEG" still has sku "SPLIT-T3-3SEG" and quantity 42
