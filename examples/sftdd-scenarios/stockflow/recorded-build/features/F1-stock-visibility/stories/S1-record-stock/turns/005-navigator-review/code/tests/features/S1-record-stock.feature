Feature: Record stock for a SKU at a location
  As a warehouse operator
  I want to file a SKU's stock level at a physical location through a form,
  capturing its quantity and combined inventory_code
  So that what is on the shelf is recorded once per (sku, location) with no
  duplicate and no error page

  Scenario: Filing a new stock record persists it and confirms the save
    Given a (sku, location) pair with no existing stock record
    When the operator files a quantity and inventory_code for that pair
    Then a stock record exists for that pair with the entered quantity and inventory_code
    And a save confirmation is returned

  Scenario: Refiling an existing pair updates it in place rather than duplicating
    Given an existing stock record for a (sku, location) pair
    When the operator files that same pair again with a different quantity and inventory_code
    Then exactly one stock record exists for that pair
    And it holds the newly filed quantity and inventory_code

  Scenario: Refiling the same pair a second time returns a save confirmation, not an error page
    Given an existing stock record for a (sku, location) pair
    When the operator files that same pair again
    Then the response is a save confirmation, not an error page
