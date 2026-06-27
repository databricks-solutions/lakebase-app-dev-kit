Feature: S2 Home Stock Table

  Scenario: T12 Navigating to the stock home page when records exist renders a table with one row per seeded stock record
    Given two stock records are seeded for the home table display test
    When the user navigates to the stock home page
    Then the stock table is visible and each seeded record has exactly one row

  Scenario: T13 Navigating to the stock home page when no records exist shows an explicit empty-state guidance message instead of a blank or empty table
    Given no stock records exist in the database
    When the user navigates to the stock home page
    Then the empty-state guidance message is shown instead of a blank table

  Scenario: T14 When records span multiple locations the table rows are grouped so all rows for one location appear together before rows for the next location
    Given stock records exist across two distinct locations for the grouping test
    When the user navigates to the stock home page
    Then all stock rows for the first test location appear before any row for the second test location

  Scenario: T15 Each table row displays the SKU location quantity and inventory_code values from the corresponding seeded stock record
    Given a stock record with known SKU location quantity and inventory code is seeded
    When the user navigates to the stock home page
    Then the stock row for that record shows the correct SKU location quantity and inventory code

  Scenario: T16 A stock record whose inventory_code is null renders the literal text not tracked in the inventory_code column rather than an empty cell
    Given a stock record with a null inventory code is seeded
    When the user navigates to the stock home page
    Then the inventory code cell for that record shows "not tracked"

  Scenario: T17 The rendered quantity cell carries a right-align CSS style so the numeric column is visually scannable
    Given two stock records are seeded for the home table display test
    When the user navigates to the stock home page
    Then the quantity cell in each visible stock row is right-aligned
