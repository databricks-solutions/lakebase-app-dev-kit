Feature: S1 Record Stock

  Scenario: T1 Record stock form renders input fields for SKU location quantity and tracking code
    Given the user is on the record stock page
    Then a form is visible with inputs for SKU, location, quantity, and tracking code

  Scenario: T2 Submitting form with blank required field shows named inline validation error
    Given the user is on the record stock page
    When the user submits the form without filling in SKU
    Then an inline validation error names the SKU field

  Scenario: T3 Submitting form with valid inputs creates a stock record in the database
    Given the user is on the record stock page
    When the user fills in the form with SKU "T3-SKU", location "LOC-T3", quantity "10", and tracking code "TRK-T3"
    And the user clicks the submit button
    Then a stock record exists in the database with SKU "T3-SKU" at location "LOC-T3" with quantity 10

  Scenario: T7 Submitting a negative quantity is rejected and no row is stored
    Given the user is on the record stock page
    When the user fills in the form with SKU "T7-SKU", location "LOC-T7", quantity "-5", and tracking code "-"
    And the user clicks the submit button
    Then the page shows a validation error for the quantity field
    And no stock row with negative quantity exists for SKU "T7-SKU" at location "LOC-T7"

  Scenario: T4 After successful submission a confirmation message is shown
    Given the user is on the record stock page
    When the user fills in the form with SKU "T4-SKU", location "LOC-T4", quantity "20", and tracking code "TRK-T4"
    And the user clicks the submit button
    Then a confirmation message is visible indicating the record was saved

  Scenario: T5 Tracking code submitted on the form is retrievable without loss or truncation
    Given the stock write API receives SKU "T5-SKU", location "LOC-T5", quantity 1, and tracking code "TRACK-ROUNDTRIP-XYZ-001"
    Then the database record for SKU "T5-SKU" at location "LOC-T5" has tracking code "TRACK-ROUNDTRIP-XYZ-001"

  Scenario: T6 Submitting form for existing SKU and location updates the existing record
    Given a stock record exists for SKU "T6-SKU" at location "LOC-T6" with quantity 5
    And the user is on the record stock page
    When the user fills in the form with SKU "T6-SKU", location "LOC-T6", quantity "99", and tracking code "-"
    And the user clicks the submit button
    Then the stock record for SKU "T6-SKU" at location "LOC-T6" has quantity 99
    And no error message is visible on the page
