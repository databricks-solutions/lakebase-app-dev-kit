Feature: SKU detail view shows a SKU's stock across all its locations
  As a warehouse operator
  I want to open a SKU detail view showing that SKU's stock across all its
  locations, including its tracking code
  So that I can see everywhere one SKU is held, with untracked detail such
  as par level shown clearly rather than as a blank or a crash

  Scenario: Opening the SKU detail view for a SKU held at more than one location lists every location
    Given a SKU seeded with stock at two different locations
    When the SKU detail view is requested for that SKU through the api boundary
    Then the response contains one JSON entry per location holding only that SKU's records
    And each entry shows its location and quantity

  Scenario: Each SKU detail entry surfaces its combined inventory_code (tracking code)
    Given a SKU seeded with stock at two different locations
    When the SKU detail view is requested for that SKU through the api boundary
    Then each entry displays the combined inventory_code recorded for that location's stock record

  Scenario: Opening the SKU detail view for a SKU whose par level is not tracked never errors
    Given a SKU seeded with stock whose par level is not tracked
    When the SKU detail view is requested for that SKU through the api boundary
    Then the response is a 2xx response
    And the par level field is serialized as null or absent
