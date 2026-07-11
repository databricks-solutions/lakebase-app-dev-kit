Feature: Split the combined inventory_code into batch_number and serial_number
  As an inventory manager
  I want the combined inventory_code column split into first-class
  batch_number and serial_number columns by a reversible migration that
  backfills by delimiter, leaves nonconforming codes NULL, drops the
  combined column, and reports how many rows did not parse
  So that batch and serial become separately queryable without losing or
  corrupting any existing stock row, and the change can be reviewed and
  rolled back safely

  Scenario: A conforming inventory_code backfills batch_number and serial_number
    Given a stock row seeded pre-migration with an inventory_code that parses as location-batch-serial
    When the split migration's up migration runs
    Then the row's batch_number and serial_number match the parsed segments

  Scenario: A nonconforming inventory_code leaves batch_number and serial_number NULL
    Given stock rows seeded pre-migration with inventory_codes that lack a batch or serial segment
    When the split migration's up migration runs
    Then each row's batch_number and serial_number are left NULL

  Scenario: Every marked row survives the split migration with location and quantity unchanged
    Given a marked set of stock rows snapshotted before the split migration
    When the split migration's up migration runs
    Then every marked row still exists afterward with its location and quantity unchanged

  Scenario: The combined inventory_code column is dropped after the split migration
    Given the split migration has run
    When the stock_records schema is inspected
    Then the inventory_code column is absent and batch_number and serial_number are separately queryable

  Scenario: The integrity probe reports exactly the marked nonconforming count
    Given a marked set of stock rows seeded with a known mix of conforming and nonconforming inventory_codes
    When the integrity probe is run for review scoped to the marked rows
    Then it reports a count matching exactly the marked nonconforming subset
