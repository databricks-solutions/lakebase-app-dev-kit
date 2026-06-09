# Bug Tracker Information Architecture

## Screens

**List View (`/`)**
The primary interface. Displays all bugs in a single-column, scannable list. Each row shows: bug ID, title, status pill (Open/Closed/In Progress), owner pill (name or "Unowned"). Rows are sortable by status or owner (future). Empty state shows centered card ("No bugs filed yet", icon, call to action). Floating action button or top bar button to create a new bug.

**Detail View (`/bug/{id}`)**
Shows a single bug in full: title (text-xxl), ID, description (text-base), status (semantic pill, text-md), owner (pill, text-md), created timestamp. Read-only view for v5 (edit and reassign arrive in v6+). Back link or breadcrumb to list. No action buttons visible in v5.

**Create Bug Form (modal or page `/new`)**
A form with fields: Title (text input, required), Description (textarea, required). Submit button (primary, brand-red). Cancel button (secondary). Error feedback inline below each field (red border, error-color text). Loading state while submitting (spinner next to button). Success: navigate to the bug detail view showing the newly created bug.

## Navigation

**Entry point:** `/` (list view). The app starts here.

**Router structure:**
- `/` > list view
- `/bug/{id}` > detail view
- `/new` > create bug form (or modal overlay, TBD by Navigator)

**Navbar:** static, top, navy-900 background, 64px. Left: app title/logo. Right: (future) user menu, settings. No nav links in v5; navigation is via buttons in the list and detail views.

**List view navigation:**
- "Create Bug" button (brand-red, primary) > navigate to `/new` or open modal
- Click a bug row > navigate to `/bug/{id}`
- Clicking bug ID (e.g., "#1") > navigate to `/bug/{id}`

**Detail view navigation:**
- Back button or "Back to list" link > navigate to `/`

**Create form navigation:**
- Cancel button > navigate to `/`
- Submit > navigate to `/bug/{newId}` (show the bug just created)

## User Flows

**Flow 1: File a bug (S1, S2)**
1. User lands on list view (`/`)
2. User clicks "Create Bug" button
3. Form opens (`/new` or modal)
4. User fills title and description
5. User clicks Submit
6. Form validates (all fields required); if invalid, show error inline
7. Submit succeeds; user is taken to bug detail view (`/bug/{id}`)
8. User sees the bug they just created with a stable ID they can share

**Flow 2: View a bug (S2)**
1. User lands on list view (`/`)
2. User clicks a bug row or bug ID
3. Detail view opens (`/bug/{id}`)
4. User reads the bug title, description, status, owner, ID
5. User can copy the ID and share it with teammates

**Flow 3: Browse the queue**
1. User lands on list view (`/`)
2. User scans the list to find bugs by status or owner
3. (In v5, no sorting; user scans. In v6+, user can filter/sort.)
4. User clicks a bug to read more
