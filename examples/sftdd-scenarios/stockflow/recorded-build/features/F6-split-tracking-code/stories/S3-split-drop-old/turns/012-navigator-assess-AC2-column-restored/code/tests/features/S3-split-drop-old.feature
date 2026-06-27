Feature: S3 Split Inventory Code - Drop the Old inventory_code Column

  Background:
    Given the S3 up migration has been applied

  Scenario: T21 stock table has no inventory_code column after the S3 up migration
    Then the stock table has no "inventory_code" column

  Scenario: T22 inventory_code column is restored after the S3 down migration
    When the S3 down migration has been run
    Then the stock table has the "inventory_code" column
