# Bug Tracker Design Guide

## Design Philosophy

The bug tracker is designed for clarity and efficiency. The interface is clean, scannable, and calm when at rest, with purposeful use of accent color to draw attention to primary actions and active states. Every interaction explicitly acknowledges state: no blank cells, no silent failures, no unconfirmed successes. The design emphasizes readability and keyboard accessibility, making it fast for teams to file, find, and manage bugs at a glance.

## Typography

**Font stack:** System/UI font stack (sans-serif), no custom web fonts for this iteration.
- `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif`

**Type scale:** Based on Databricks baseline 16px base.

| Name | Size | Line-height | Weight | Use |
|------|------|-------------|--------|-----|
| `type-xs` | 12px | 1.5 | 400 | Helper text, timestamps, captions |
| `type-sm` | 13px | 1.5 | 400 | Form labels, secondary information |
| `type-base` | 16px | 1.5 | 400 | Body text, list rows, form fields |
| `type-lg` | 18px | 1.6 | 500 | Subheadings, form section titles |
| `type-xl` | 24px | 1.3 | 600 | Page headings, detail page title |
| `type-mono` | 13px | 1.5 | 400 | Bug identifiers (e.g., `#42`) |

## Color Palette

**Brand colors** (sourced from Databricks-brand default):
- `--color-brand-red`: `#E74C3C` - Databricks accent, reserved for primary actions and active states only
- `--color-neutral-white`: `#FFFFFF` - Page background, card backgrounds
- `--color-neutral-900`: `#1A1A1A` - Primary text, strong contrast
- `--color-neutral-700`: `#4A4A4A` - Secondary text
- `--color-neutral-500`: `#757575` - Tertiary text, placeholders
- `--color-neutral-300`: `#EBEBEB` - Borders, dividers
- `--color-neutral-200`: `#F5F5F5` - Light backgrounds, hover states
- `--color-neutral-100`: `#FAFAFA` - Very light backgrounds

**Semantic colors** (high-contrast states, not color-alone):
- `--color-status-open`: `#1A73E8` - Open bug state, text + pill background with label
- `--color-status-closed`: `#34A853` - Closed bug state, text + pill background with label
- `--color-status-in-progress`: `#EA4335` - In-progress state, text + pill background with label
- `--color-feedback-error`: `#D32F2F` - Error text, error borders
- `--color-feedback-success`: `#388E3C` - Success confirmations
- `--color-feedback-warning`: `#F57C00` - Warning messages

**Surface colors:**
- `--color-surface-page`: `--color-neutral-white` - Main page background
- `--color-surface-card`: `--color-neutral-white` - Card and container backgrounds
- `--color-surface-hover`: `--color-neutral-200` - Interactive element hover state
- `--color-surface-focus`: `--color-neutral-300` - Focus ring and focus indicators

## Spacing

**Spacing scale** (based on Databricks 8px base grid):

| Token | Value | Use |
|-------|-------|-----|
| `--space-xs` | 4px | Tight spacing within components |
| `--space-sm` | 8px | Padding in small components, tight margins |
| `--space-md` | 16px | Standard padding, standard margins |
| `--space-lg` | 24px | Large padding, section spacing |
| `--space-xl` | 32px | Major section breaks |
| `--space-2xl` | 48px | Page-level spacing |

**Layout:**
- Form field padding: `--space-md` (16px)
- Card padding: `--space-lg` (24px)
- List item padding: `--space-md` vertical, `--space-lg` horizontal
- Page margins: `--space-xl` (32px) on desktop

## Border Radius

- `--radius-none`: `0px` - Sharp corners for strict, no-nonsense UI
- `--radius-sm`: `2px` - Very subtle curves on form inputs
- `--radius-md`: `4px` - Standard corners on buttons and pills
- `--radius-lg`: `8px` - Larger radius for modals and feature components (reserved for future)

## Shadows

- `--shadow-none`: `none` - No shadow
- `--shadow-sm`: `0 1px 2px rgba(0, 0, 0, 0.05)` - Subtle elevation, form field focus
- `--shadow-md`: `0 4px 6px rgba(0, 0, 0, 0.1)` - Standard card shadow
- `--shadow-lg`: `0 10px 15px rgba(0, 0, 0, 0.1)` - Modal/overlay shadow (reserved for future)

## Breakpoints

- `--breakpoint-mobile`: `480px` - Mobile/small screens
- `--breakpoint-tablet`: `768px` - Tablet and medium screens
- `--breakpoint-desktop`: `1024px` - Desktop and large screens
- `--breakpoint-wide`: `1440px` - Ultra-wide screens

For v1, the form and detail screens are single-column responsive (mobile-first), stack on all sizes, and handle 200% zoom without horizontal scroll.

## Components

### Buttons

**Primary Button** (for primary actions: submit, create, navigate to detail)
- Background: `--color-brand-red`
- Text color: `--color-neutral-white`
- Padding: `--space-sm` (8px) vertical, `--space-md` (16px) horizontal
- Radius: `--radius-md` (4px)
- Font: `--type-base`, weight 500
- State: hover lightens to `#EC7063`, active darkens to `#C0392B`, disabled at 50% opacity
- Border: none
- Min-height: 40px (touch-friendly)

**Secondary Button** (for cancel/back actions, reserved for future)
- Background: `--color-neutral-200`
- Text color: `--color-neutral-900`
- Padding: `--space-sm` (8px) vertical, `--space-md` (16px) horizontal
- Radius: `--radius-md` (4px)
- Font: `--type-base`, weight 500
- State: hover darkens background to `#EBEBEB`, active to `#DCDCDC`, disabled at 50% opacity
- Border: 1px `--color-neutral-300`
- Min-height: 40px

**Link/Text Button** (for navigation and secondary actions)
- Background: transparent
- Text color: `--color-brand-red`
- Padding: 0 (text only)
- Font: `--type-base`, weight 400, underline on hover
- State: hover underlines, active darkens text, disabled at 50% opacity

### Form Fields

**Text Input & Text Area**
- Background: `--color-surface-card` (`#FFFFFF`)
- Border: 1px solid `--color-neutral-300`
- Padding: `--space-sm` (8px)
- Radius: `--radius-sm` (2px)
- Font: `--type-base`
- Focus state: border color changes to `--color-brand-red`, box-shadow `0 0 0 3px rgba(231, 76, 60, 0.1)` (subtle red glow)
- Placeholder text: `--color-neutral-500`, italic
- Error state: border color `--color-feedback-error`, error text below field in `--color-feedback-error` at `--type-sm`

**Labels**
- Font: `--type-sm`, weight 600
- Color: `--color-neutral-900`
- Margin-bottom: `--space-xs` (4px)
- Required asterisk (red) suffix: `--color-feedback-error`

**Helper text / Error text**
- Font: `--type-xs`
- Color: `--color-neutral-700` (helper), `--color-feedback-error` (error)
- Margin-top: `--space-xs` (4px)

### Status Pills

State-as-text pills (never color alone, always includes the state name):
- Padding: `--space-xs` (4px) vertical, `--space-sm` (8px) horizontal
- Radius: `--radius-md` (4px)
- Font: `--type-sm`, weight 500
- Accessibility: text label always visible, e.g., "Open", "Closed", "In Progress"

**Open status pill:**
- Background: `--color-status-open` with 15% opacity (`#1A73E8` + 15% alpha)
- Text: `--color-status-open`

**Closed status pill:**
- Background: `--color-status-closed` with 15% opacity (`#34A853` + 15% alpha)
- Text: `--color-status-closed`

### Cards

**Content card** (used for bug detail display, form sections)
- Background: `--color-surface-card`
- Border: 1px solid `--color-neutral-300`
- Padding: `--space-lg` (24px)
- Radius: `--radius-md` (4px)
- Shadow: `--shadow-md`
- Margin-bottom: `--space-lg` (24px)

### Empty State

**Empty state message** (shown when the bug list is empty)
- Background: `--color-surface-card`
- Padding: `--space-xl` (32px)
- Radius: `--radius-md` (4px)
- Border: 1px dashed `--color-neutral-300`
- Text: "No bugs found. Create your first bug to get started." or similar
- Font: `--type-base`, color `--color-neutral-700`
- Icon: optional (reserved for future)

## User Feedback Principles

### No silent failures

- Form submission fails: error message shown above form (red text, `--color-feedback-error`)
- Network error: modal or toast showing "Unable to create bug. Please try again." with retry action
- Validation failure: field border turns red, helper text appears below field in `--color-feedback-error`

### No unacknowledged success

- Form submission succeeds: user is navigated to the newly created bug's detail page (implicit confirmation via URL change and full detail page load)
- Detail page loads: breadcrumb or title shows the bug ID, confirming the page load

### Acknowledgment patterns for v1

- **Create form success:** Navigation to `/bugs/:id` detail page (browser URL change is the confirmation)
- **Create form failure:** Error message in red, field focus restored to first invalid field
- **Detail page loaded:** Title shows bug ID in clear format: "Bug #42" as the page title

### Future feedback patterns (reserved for v2+)

- Success toast: brief green notification slide-in from top (e.g., "Bug #42 created")
- Confirmation dialog: for destructive actions (delete, close, reassign)
- Loading state: spinner on button or page during async operations

## Color accessibility

- Status must not be conveyed by color alone. Status pills always include the state name as text (e.g., "Open", not just a blue pill).
- Contrast ratio between text and background must meet WCAG AA standard (4.5:1 for body text).
- Focus states use visible outline or glow, not color alone.

## Keyboard & screen reader accessibility

- All interactive elements (buttons, links, form fields) are keyboard-navigable via Tab.
- Form labels are properly associated with inputs via `<label for="fieldId">`.
- Status pills use semantic HTML or ARIA labels to announce state to screen readers.
- The detail page heading announces the bug ID as the primary landmark: e.g., `<h1>Bug #42</h1>`.
- Empty state is announced as a live region or landmark heading, not just passive text.

## Responsive behavior

For v1, all screens are single-column, mobile-first responsive:
- On mobile (< 768px): full-width, stacked layout, single column
- On tablet (768px to 1024px): max-width card center, padding maintained
- On desktop (> 1024px): max-width card center (typically 600-800px for forms), padding maintained
- At 200% zoom: no horizontal scroll, all text and buttons remain visible and clickable
- Form inputs and buttons are at least 44px in height (touch-friendly)
