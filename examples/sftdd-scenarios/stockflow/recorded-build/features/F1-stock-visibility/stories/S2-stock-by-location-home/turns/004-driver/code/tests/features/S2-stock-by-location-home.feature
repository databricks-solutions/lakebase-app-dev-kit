Feature: Home screen lists stock by location
  As a warehouse operator
  I want to open a home screen that lists every filed stock record for a
  location, or an explicit empty state when there is none
  So that I can read back at a glance what is on the shelves

  Scenario: Opening the home screen for a location with stock returns one row per record
    Given a location with two seeded stock records at different SKUs
    When the home screen listing is requested for that location through the api boundary
    Then the response contains one JSON row per filed (sku, location) record
    And each row shows its sku, location, and quantity

  Scenario: Opening the home screen for a location with no stock returns an empty collection, not an error
    Given a location with no stock records
    When the home screen listing is requested for that location through the api boundary
    Then the response is a 2xx empty collection
