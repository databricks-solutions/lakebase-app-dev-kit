Feature: S2 Validate Split Migration - Count Unparseable Inventory Codes

  Background:
    Given the S1 split migration is applied and the batch_number column exists

  Scenario: T15 the validation probe can be called against the stock table without error
    When the validation probe is called against the stock table
    Then it returns a result without raising an error

  Scenario: T16 the probe returns 0 when all inventory codes are three-segment
    Given the stock table has only S2 seeded rows with three-segment codes
    When the S2 validation probe runs
    Then the S2 probe count is 0

  Scenario: T17 the probe count equals rows with NULL batch_number or serial_number
    Given the stock table has 2 S2 seeded rows with non-conforming codes
    When the S2 validation probe runs
    Then the S2 probe count is 2

  Scenario: T18 the probe result is a scalar integer the DBA can read and record
    When the S2 validation probe runs
    Then the S2 probe result is a scalar integer
