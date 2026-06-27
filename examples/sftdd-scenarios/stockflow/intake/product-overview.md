---
author: Product Owner
---

# StockFlow (product overview)

The Product Owner's standing intent for the warehouse-management
application. It is deliberately open-ended: it says who the product is
for and what they need to accomplish, and the Product Owner refines it
between iterations as working software is seen. It is project-level and
is not a frozen contract. The structured per-feature asks live alongside
it as the Feature Requester's `feature-requests/`; the Spec Author turns
those into the gated `feature-spec` artifacts.

## Who it is for

A mid-market warehouse operation that has outgrown spreadsheets and a
shared Excel file but for whom an enterprise WMS is overpriced and
overwrought. The people in the warehouse who scan goods in, put them on
shelves, pick them off shelves, count them, and ship them. The
inventory manager who reconciles what the system says with what the
shelves actually hold. The operations lead who needs to know whether
today's orders are going to ship.

## What they need to accomplish

- Know what they have, in what quantity, at which physical location, at
  any point in time.
- Receive inbound goods from a supplier and put them somewhere
  recoverable.
- Pick goods off the shelf for a customer order without overcommitting
  what is actually there.
- Count what is on the shelf, and reconcile that count with what the
  system says is there.
- Operate across multiple warehouses without each one needing its own
  copy of the system.

## What I want in V1

The first runnable increment, the V1 that goes into use, should be the
simplest thing that lets the team see and adjust stock at one
warehouse. Concretely:

- File, retrieve, and adjust the stock level of one SKU at one
  location.
- Hold stock for the same SKU at multiple locations within one
  warehouse.
- Record inbound receipts: a known supplier delivers a known quantity,
  and stock goes up at a chosen location.
- Record outbound picks: a customer order draws stock down at a chosen
  location, with the system refusing to overcommit.
- Each unit is identified by a single tracking code that encodes
  location, batch, and serial together. The team is fine with this for
  V1; later iterations will revisit whether those fields should be
  split apart.

Everything beyond V1 is open. The Product Owner expects to revisit and
extend this overview between iterations once V1 is in real use.

## How I want to work

After each sprint I want to see **working software I can actually use**,
not designs, stubs, or partial scaffolding. Every iteration must land
as something runnable and demonstrable before the next one starts; that
working increment is what I review to decide what the next sprint
should be. A warehouse operator should be able to scan a real barcode
and see the stock level move in real time before I sign off.

## Architectural requirements

These are the parts of HOW the product is built that I care enough
about to write down. The Architect owns everything else.

### Stack

Server, under `app/`:

- **Python 3.10+**, FastAPI, SQLAlchemy 2.0, Alembic, psycopg.
- **uv** for packaging and dependency resolution.
- **pytest** as the test runner. **pytest-bdd** for behavior tests.
  **httpx** for in-process HTTP requests inside tests.

Client, under `client/`:

- **React 18** with **TypeScript**, built as a single-page
  application.
- **Vite** for the dev server, build, and HMR.
- **React Router** for client-side routing.
- **Vitest** as the unit test runner, with **React Testing Library**,
  **jsdom**, and `@testing-library/jest-dom` for component and hook
  tests.
- **Playwright** for end-to-end browser tests, driving the rendered
  SPA against the real server backed by the paired Lakebase branch.

The server returns **JSON only**; the rendered UI is the SPA. The
server does not render HTML.

### Server-side layered architecture

The server is layered under `app/`, and the layers are hard-named:

- **`app/models/`**: SQLAlchemy models. Validation rules live here.
- **`app/repositories/`**: the only layer that touches the ORM
  session. Each repository takes a `Session` in its constructor and
  returns models.
- **`app/services/`**: business logic. Services compose repositories
  via constructor injection and never reach the database directly.
  Business predicates are defined ONCE in the service layer as named
  constants and reused; no duplicated literals scattered across
  layers.
- **`app/routes/`**: FastAPI route handlers. Routes call services and
  return JSON. Routes never touch the database, never write SQL,
  never render HTML.

Cross-layer access is forbidden: a route never imports a repository,
a service never writes a SQL string.

### Client-side layered architecture

The client is layered under `client/src/`, and the layers are
hard-named:

- **`client/src/api/`**: typed wrappers around the server's REST
  endpoints. The only layer that issues `fetch`. Returns typed
  response objects.
- **`client/src/hooks/`**: custom React hooks. Hooks call the `api/`
  layer; they hold data-fetching, caching, and UI state logic.
- **`client/src/components/`**: presentational React components.
  Receive props and emit events. They never call `fetch` and never
  call hooks that fetch.
- **`client/src/pages/`**: route-level views. Pages compose
  components and use hooks for data; they are the only place where
  hooks and components are wired together.

Cross-layer access is forbidden: a component never calls the `api/`
layer directly, a page never issues `fetch`, a hook never imports a
page.

### Design guidelines

The UI follows Databricks brand standards. Design tokens live in
`client/src/styles/theme.css` as CSS custom properties; the
philosophy and full token tables live in
`client/src/styles/STYLE_GUIDE.md` (research-repo copy:
[[34-stockflow-style-guide]]). Summary below.

#### Principles

- **Clarity over decoration.** Every element earns its space.
- **Guide the user.** The interface explains itself; empty states
  teach, not scold.
- **Warm and professional.** Navy + warm neutrals, not cold corporate
  grey.
- **Consistent with the Databricks ecosystem.** A user visiting other
  Databricks surfaces and then this app should feel at home.

#### Typography

- **DM Sans** as the primary face (Google Fonts, weights 400 / 500 /
  600 / 700). **DM Mono** for code and numerics.
- Type scale: 10px (xs), 13px (sm), 15px (base), 16px (md), 20px (lg),
  24px (xl), 29px (xxl). Body line-height 1.5, headings 1.25.

#### Color palette

- **Brand red `#FF3621`** is the primary CTA color (Save, Submit,
  active state). Hover `#EB1600`. Use sparingly; the rest of the page
  is calm.
- **Navy `#1B3139`** is the primary text color. The navy scale
  (900 / 700 / 500 / 400 / 300 / 200 / 100) carries all dark surfaces
  and text variants.
- **Warm background `#F9F7F4`** is the page surface. Cards are pure
  white on warm.
- **Semantic colors**: `#2E844A` success, `#FFAB00` warning, `#0176D3`
  info, brand red for error.

#### Spacing, radius, shadows

- 4px base grid (`--space-1` through `--space-16`).
- Radius: 4px small (inputs), 8px medium (cards, buttons), 12px large
  (modals, hero cards), pill for badges.
- Shadows are navy-tinted, never black. Three levels (sm, md, lg) plus
  a navbar-specific shadow.

#### Layout

- Content max width: **960px**. Wide enough for comfortable form
  layouts; narrow enough that no line of body text exceeds a readable
  measure.
- Navbar height: **64px**. Persistent across pages.
- Single content column on detail and form pages; grids on the index
  pages.

#### Interaction and accessibility

- Every state is shown explicitly: an empty list shows an explicit
  empty state ("No items yet, add the first one"), never a blank
  page; a missing optional field shows a clear "none yet", never a
  null crash or a blank region.
- Forms never fail silently: a successful save lands on a
  confirmation; a validation problem is shown inline next to the
  field that caused it, naming the field.
- Form inputs have visible, persistent labels (not placeholder-only).
- Meaning is never conveyed by color alone. A status (success,
  warning, error) carries its name as text, not just a colored pill.
- All controls are keyboard-reachable and readable at 200% zoom.

### Testing discipline

- **Test-driven development.** Every change is written with a failing
  test first. The test names the behavior; the code earns the green.
- **Server tests hit the real database.** No mocks, no in-memory
  substitutes, no fakes for the data layer. Integration tests against
  the paired Lakebase branch are the default throughout; unit tests
  are only used where there is genuinely no I/O to integrate with.
- **Client tests use the real DOM.** Component and hook tests run
  under jsdom via Vitest + React Testing Library; we test behavior
  (what the user sees and can do), not implementation (which internal
  hook fired).
- **Every layer is covered.** Each server layer (`models/`,
  `repositories/`, `services/`, `routes/`) and each client layer
  (`api/`, `hooks/`, `components/`, `pages/`) has tests that exercise
  it directly. The test layout mirrors the source layout.
- **Architectural fitness tests** enforce the cross-layer access
  rules programmatically. They live in `tests/architecture/` for the
  server (AST analysis of Python source) and
  `client/tests/architecture/` for the client (AST analysis of
  TypeScript source). A new layer violation goes RED in CI before
  the PR can merge.
- **Behavior tests** live in `tests/features/` as Gherkin `.feature`
  files, with step definitions in `tests/step_defs/`, run via
  pytest-bdd against the server.
- **End-to-end tests** live in `client/tests/e2e/` and use Playwright
  to drive the rendered SPA through a real browser, against the real
  server backed by the paired Lakebase branch.
- **Seed and restore.** The team needs a way to put the database
  into a known state before a test and to return it to a known state
  after. Each test starts from a defined precondition and never
  pollutes the next test's precondition.

### Migrations

All schema changes are Alembic migrations under `alembic/versions/`,
named with a timestamp prefix (`<YYYYMMDDhhmmss>_short_description.py`),
and checked in alongside the application code change that requires
them. The PR is the unit of review; the migration is part of the PR.

## Product-level non-goals

- This is not a production-grade WMS. The features I would expect from
  Manhattan or Blue Yonder (slotting optimization, labor management,
  yard management, advanced forecasting) are out of scope.
- No carrier-rate shopping, no label printing, no shipping integration
  beyond a manual tracking number field.
- No native mobile app. The warehouse operator uses a browser on a
  rugged tablet or a barcode scanner with a browser.
- No accounting integration, no general-ledger postings, no invoicing.
- No multi-tenant isolation across customer companies. One tenant per
  deployment.
- Beyond the architectural requirements above, this overview does not
  say HOW the product is built. Specific technology, database schema,
  services, and endpoints are the Architect's and the implementation's
  concern.
