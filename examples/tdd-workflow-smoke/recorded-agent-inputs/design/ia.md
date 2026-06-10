# Bug Tracker Information Architecture

## Screens

### Create Bug
The primary entry screen where a user files a new bug.
- **Purpose:** Collect title and description from the user to create a bug report.
- **Elements:**
  - Page title: "Create Bug" (h1, `text-lg`)
  - Form fields: Title input (required), Description textarea (required)
  - Submit button: "Create Bug" (primary button, brand-red, full-width)
  - Each field is labeled and required; empty inputs are prevented from submission
  - On successful submission, the user is redirected to the bug detail view
- **Data displayed:** None; this is a form entry point
- **Entry point:** `/` or `/bugs/create`

### View Bug Detail
Display a single bug's information at a stable, shareable URL.
- **Purpose:** Show a bug's complete information so users can refer back to it and share its URL.
- **Elements:**
  - Page title: Bug identifier (e.g., "BUG-001") and bug title (h1, `text-lg`)
  - Bug metadata: Identifier, title, description, status
  - Status badge: Pill with status text (e.g., "open") and semantic color
  - Each field is explicitly labeled (e.g., "Identifier:", "Status:", "Description:")
  - Back button or navigation to return to create screen
  - All fields are labeled and visible; unowned bugs read "unowned"
- **Data displayed:** Bug ID, title, description (full text), status, timestamp (if available)
- **Entry point:** `/bugs/:bugId` where bugId is the stable bug identifier (e.g., BUG-001)
- **No edit interface at this stage; view-only**

## Navigation

- **Root entry:** Redirect `/` to `/bugs/create` (the create form is the primary entry)
- **Direct access:** Users can share a bug detail URL (`/bugs/:bugId`) and return to it
- **Navigation model:**
  - From Create Bug: successful form submission auto-navigates to the bug detail view
  - From Bug Detail: optional back button returns to create screen
- **No navbar or breadcrumbs required** for this minimal feature set (future iterations will add these)

## User Flows

### Flow 1: Create and View a New Bug
1. User opens the app and lands on Create Bug screen
2. User fills in Title field (e.g., "Login button unresponsive")
3. User fills in Description field (e.g., "On mobile, the login button does not respond to clicks")
4. User clicks "Create Bug" button
5. Form is submitted; button becomes disabled with loading state
6. Server creates the bug and returns an identifier
7. User is automatically navigated to the bug detail view (`/bugs/BUG-001`)
8. Bug Detail screen displays the title, description, status (open), and identifier
9. User can share the bug detail URL with teammates

### Flow 2: Access Bug via Direct URL
1. User receives a shared bug URL from a teammate (e.g., `https://app.example.com/bugs/BUG-001`)
2. User opens the URL in their browser
3. Bug Detail screen loads and displays the bug's complete information
4. User can navigate back to create new bugs if desired

### Flow 3: Empty State (Future)
When the list view is added in a future iteration, an empty list will show:
- "No bugs to display" message (centered, navy-300 text)
- A link or button to create the first bug
- Never a blank page
