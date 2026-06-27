Feature: S3 Split Inventory Code - Drop the Old inventory_code Column

  Background:
    Given the S3 up migration has been applied

  Scenario: T21 stock table has no inventory_code column after the S3 up migration
    Then the stock table has no "inventory_code" column
