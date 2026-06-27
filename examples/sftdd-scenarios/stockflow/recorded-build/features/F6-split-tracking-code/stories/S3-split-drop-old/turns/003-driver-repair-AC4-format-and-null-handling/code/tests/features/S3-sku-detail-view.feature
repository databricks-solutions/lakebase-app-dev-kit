Feature: S3 SKU Detail View

  Scenario: T20 Navigating to the detail page for a SKU that has stock at multiple locations renders one row per location with the location name and current quantity
    Given a SKU has stock seeded at multiple locations for the detail view display test
    When the user navigates to that SKU's detail page
    Then the detail view shows one row per seeded location with the location name and current quantity

  Scenario: T21 Each location row in the SKU detail view displays the inventory tracking code stored on that location's stock record
    Given stock records with distinct tracking codes exist for a SKU at multiple locations for the tracking code display test
    When the user navigates to that SKU's detail page
    Then each location row in the detail view shows the tracking code stored for that location

  Scenario: T22 A location row whose optional fields have no stored value displays the literal text not tracked rather than a blank cell or raw null
    Given a stock record exists for a SKU at a location with no optional field value stored
    When the user navigates to that SKU's detail page
    Then the optional field cell for that location row displays the text not tracked
